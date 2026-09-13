ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const scripts = [
    'player.js',
    'world.js',
    'generator.js',
    'collision.js',
    'renderer.js',
    'input.js',
    'game.js'
  ];
  const productionSource = scripts.map(function (script) {
    return readUtf8(root + '/' + script);
  }).join('\n;\n');

  const assertions = `
    // Feature: pokemon-reskin-and-pokeballs, Property 3: Pikachu hop is uniform and rendering-only
    // **Validates: Requirements 1.5, 2.1, 8.1**
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    function close(actual, expected, message) {
      if (Math.abs(actual - expected) > 1e-10) {
        throw new Error(message + ': expected ' + expected + ', received ' + actual);
      }
    }

    function normalizedHop(value) {
      return Number.isFinite(value) && value >= 0 ? value : 0;
    }

    function playerSnapshot(player) {
      return JSON.stringify({
        x: player.x,
        y: player.y,
        isMoving: player.isMoving,
        animationProgress: player.animationProgress,
        animationDuration: player.animationDuration,
        startPos: player.startPos,
        targetPos: player.targetPos,
        facing: player.facing,
        maxHopHeight: player.maxHopHeight
      });
    }

    function gameplaySnapshot(game) {
      var rows = [];
      game.world.terrainRows.forEach(function (row, key) {
        rows.push({ key: key, row: row });
      });
      rows.sort(function (left, right) { return left.key - right.key; });
      return JSON.stringify({
        gameState: game.gameState,
        terrainRows: rows,
        collisionSystem: game.collisionSystem,
        generator: game.generator,
        visualSeed: game.visualSeed,
        visualTime: game.visualTime
      });
    }

    function deterministicUnit(index) {
      var value = (Math.imul(index + 1, 1103515245) + 12345) >>> 0;
      value ^= value >>> 16;
      return (value >>> 0) / 4294967295;
    }

    var cardinalFacings = [
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: -1, dy: 0 }
    ];

    function createFixture(caseIndex, hopInput) {
      var canvas = {
        width: 800,
        height: 600,
        getContext: function () { return __context; }
      };
      var renderer = new Renderer(canvas);
      var facing = cardinalFacings[caseIndex % cardinalFacings.length];
      var player = new Player(
        ((caseIndex * 13) % 31) - 15,
        ((caseIndex * 17) % 47) - 23
      );

      player.startPos = { x: player.x, y: player.y };
      player.targetPos = {
        x: player.x + facing.dx,
        y: player.y + facing.dy
      };
      player.facing = { dx: facing.dx, dy: facing.dy };
      player.isMoving = caseIndex % 3 !== 0;
      player.animationProgress = player.isMoving
        ? ((caseIndex * 19) % 99) / 100
        : 0;
      player.getVisualState = function () {
        return {
          facing: { dx: this.facing.dx, dy: this.facing.dy },
          hopHeight: hopInput
        };
      };

      var rowY = Math.floor(player.y);
      var row = {
        y: rowY,
        type: caseIndex % 2 === 0 ? 'GRASS' : 'ROAD',
        obstacles: [{
          type: 'CAR', x: -4.5, y: rowY, width: 2,
          velocity: 0.003 + caseIndex / 100000
        }],
        platforms: [],
        decorations: [{
          type: 'GRASS_TUFT', x: 4, y: rowY,
          blocking: false, variant: caseIndex % 3
        }],
        metadata: {
          direction: caseIndex % 2 === 0 ? 1 : -1,
          lockedRowSpeed: 0.003 + caseIndex / 100000,
          warningLightOn: false
        }
      };

      var game = Object.create(Game.prototype);
      game.renderer = renderer;
      game.player = player;
      game.world = { terrainRows: new Map([[rowY, row]]) };
      game.gameState = {
        state: 'PLAYING',
        score: caseIndex * 3,
        maxYReached: Math.max(0, player.y),
        lastFrameTime: 1000 + caseIndex
      };
      game.collisionSystem = {
        lastResult: 'SAFE',
        playerInterval: { left: player.x, right: player.x + 1 }
      };
      game.generator = { retainedSequence: caseIndex, randomCalls: caseIndex * 2 };
      game.visualSeed = 'pikachu-hop-property-' + caseIndex;
      game.visualTime = caseIndex * 16;
      game.clouds = [];

      game.renderClouds = function () {};
      game.renderTerrain = function () {};
      game.renderLowDecorations = function () {};
      game.renderObstaclesAndPlatforms = function () {};
      game.renderSideShoulders = function () {};
      game.renderUI = function () {};

      var capture = {
        blocks: [],
        shadows: [],
        pikachuCalls: 0,
        pikachuResults: [],
        chickenCalls: 0
      };
      renderer.drawVoxelBlock = function (
        x, y, width, depth, height, palette, elevation
      ) {
        capture.blocks.push({
          x: x,
          y: y,
          width: width,
          depth: depth,
          height: height,
          elevation: elevation,
          palette: palette
        });
      };
      renderer.drawGroundShadow = function (x, y, width, depth) {
        capture.shadows.push({ x: x, y: y, width: width, depth: depth });
      };
      var productionPikachu = Renderer.prototype.drawVoxelPikachu;
      renderer.drawVoxelPikachu = function (x, y, visualState) {
        capture.pikachuCalls++;
        var result = productionPikachu.call(this, x, y, visualState);
        capture.pikachuResults.push(result);
        return result;
      };
      renderer.drawVoxelChicken = function () {
        capture.chickenCalls++;
      };

      return { game: game, renderer: renderer, player: player, capture: capture };
    }

    function renderAndAssertUnchanged(caseIndex, hopInput) {
      var fixture = createFixture(caseIndex, hopInput);
      var renderPosition = fixture.player.getCurrentPosition();
      var beforePlayer = playerSnapshot(fixture.player);
      var beforeGameplay = gameplaySnapshot(fixture.game);

      fixture.game.render();

      var afterPlayer = playerSnapshot(fixture.player);
      var afterGameplay = gameplaySnapshot(fixture.game);
      assert(afterPlayer === beforePlayer,
        'Property 3 Player snapshot changed after render in case ' + caseIndex);
      assert(afterGameplay === beforeGameplay,
        'Property 3 Gameplay State snapshot changed after render in case ' + caseIndex);
      assert(fixture.capture.pikachuCalls === 1,
        'Property 3 did not dispatch exactly one Pikachu in case ' + caseIndex);
      assert(fixture.capture.pikachuResults.length === 1 &&
        fixture.capture.pikachuResults[0] === 1,
        'Property 3 Pikachu semantic draw did not return one in case ' + caseIndex);
      assert(fixture.capture.chickenCalls === 0,
        'Property 3 dispatched the production chicken in case ' + caseIndex);
      assert(fixture.capture.shadows.length === 1,
        'Property 3 did not draw exactly one ground shadow in case ' + caseIndex);

      var shadow = fixture.capture.shadows[0];
      close(shadow.x, renderPosition.x + 0.08,
        'Property 3 shadow x moved with hop in case ' + caseIndex);
      close(shadow.y, renderPosition.y + 0.16,
        'Property 3 shadow y moved with hop in case ' + caseIndex);
      close(shadow.width, 0.84,
        'Property 3 shadow width changed in case ' + caseIndex);
      close(shadow.depth, 0.5,
        'Property 3 shadow depth changed in case ' + caseIndex);

      var manifest = fixture.renderer.buildPikachuManifest(fixture.player.facing);
      assert(fixture.capture.blocks.length === manifest.length,
        'Property 3 did not pass every valid Pikachu part to the voxel primitive in case ' + caseIndex);
      assert(fixture.capture.blocks.length > 0 && fixture.capture.blocks.length <= 32,
        'Property 3 Pikachu part count was outside its bounded manifest in case ' + caseIndex);

      var hop = normalizedHop(hopInput);
      for (var partIndex = 0; partIndex < manifest.length; partIndex++) {
        var expectedElevation = fixture.renderer.TERRAIN_HEIGHT + 0.025 +
          hop + manifest[partIndex].elevation;
        close(fixture.capture.blocks[partIndex].elevation, expectedElevation,
          'Property 3 effective part elevation mismatch for ' +
            manifest[partIndex].role + ' in case ' + caseIndex);
      }

      return {
        blocks: fixture.capture.blocks,
        shadow: shadow,
        normalizedHop: hop
      };
    }

    var requiredHopInputs = [
      0,
      0.14,
      0.28,
      -0.14,
      NaN,
      Infinity,
      -Infinity,
      undefined,
      null
    ];
    var snapshotCount = 128;

    for (var caseIndex = 0; caseIndex < snapshotCount; caseIndex++) {
      var hopInput;
      if (caseIndex < requiredHopInputs.length) {
        hopInput = requiredHopInputs[caseIndex];
      } else if (caseIndex % 17 === 0) {
        hopInput = -deterministicUnit(caseIndex) * 0.28;
      } else if (caseIndex % 19 === 0) {
        hopInput = NaN;
      } else if (caseIndex % 23 === 0) {
        hopInput = Infinity;
      } else {
        hopInput = deterministicUnit(caseIndex) * 0.28;
      }

      var baseline = renderAndAssertUnchanged(caseIndex, 0);
      var hopped = renderAndAssertUnchanged(caseIndex, hopInput);
      assert(JSON.stringify(hopped.shadow) === JSON.stringify(baseline.shadow),
        'Property 3 shadow was not byte-equivalent to its zero-hop baseline in case ' + caseIndex);
      assert(hopped.blocks.length === baseline.blocks.length,
        'Property 3 hop changed the Pikachu part count in case ' + caseIndex);

      for (var blockIndex = 0; blockIndex < hopped.blocks.length; blockIndex++) {
        close(
          hopped.blocks[blockIndex].elevation - baseline.blocks[blockIndex].elevation,
          hopped.normalizedHop,
          'Property 3 hop offset was not uniform at part ' + blockIndex +
            ' in case ' + caseIndex
        );
      }
    }
  `;

  var __stack = [];
  var __context = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: '',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalCompositeOperation: 'source-over',
    clearRect: function () {},
    fillRect: function () {},
    fillText: function () {},
    beginPath: function () {},
    moveTo: function () {},
    lineTo: function () {},
    closePath: function () {},
    clip: function () {},
    fill: function () {},
    stroke: function () {},
    save: function () {
      __stack.push({ globalAlpha: this.globalAlpha });
    },
    restore: function () {
      var state = __stack.pop();
      if (state) this.globalAlpha = state.globalAlpha;
    }
  };
  var console = { log: function () {}, error: function () {} };
  var document = { getElementById: function () { return null; } };
  var performance = { now: function () { return 0; } };
  var requestAnimationFrame = function () { return 1; };
  var window = {
    document: document,
    performance: performance,
    requestAnimationFrame: requestAnimationFrame,
    addEventListener: function () {},
    removeEventListener: function () {}
  };

  eval(productionSource + '\n' + assertions);
  return 'PASS: Feature: pokemon-reskin-and-pokeballs, Property 3: Pikachu hop is uniform and rendering-only (128 deterministic snapshots; zero, midpoint, maximum, negative, and non-finite inputs)';
}
