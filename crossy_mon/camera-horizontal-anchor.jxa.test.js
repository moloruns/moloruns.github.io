ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const scripts = [
    'player.js', 'world.js', 'generator.js', 'collision.js',
    'renderer.js', 'input.js', 'game.js'
  ];
  const source = scripts.map(function (script) {
    return readUtf8(root + '/' + script);
  }).join('\n;\n');

  const assertions = `
    // Feature: score-scaled-movement-and-side-occlusion,
    // Property 17: Camera is horizontally world-anchored while vertical
    // following and side coverage remain stable.
    // **Validates: Requirements 5.19, 5.20, 5.21, 5.22, 5.23, 5.24,
    // 5.25, 7.19, 7.20, 7.21, 7.22, 7.23, 7.24**
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    function close(actual, expected, message) {
      if (Math.abs(actual - expected) > 1e-9) {
        throw new Error(message + ': expected ' + expected + ', received ' + actual);
      }
    }
    function point(renderer, worldX, worldY) {
      var projected = renderer.worldToIso(worldX, worldY);
      return renderer.screenToCanvas(projected.screenX, projected.screenY);
    }
    function bounds(points) {
      var xs = points.map(function (entry) { return entry.x; });
      var ys = points.map(function (entry) { return entry.y; });
      return {
        minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs),
        minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys)
      };
    }
    function fixtureFor(type, side, rowY, state) {
      var widths = { CAR: 2, LOG: 3, LILY_PAD: 1, TRAIN: 8 };
      var width = widths[type];
      var x;
      if (side === 'LEFT') {
        x = state === 'CORRIDOR' ? -15 - width
          : state === 'OPENING' ? -15 : -15 - width / 2;
      } else {
        x = state === 'CORRIDOR' ? 16
          : state === 'OPENING' ? 16 - width : 16 - width / 2;
      }
      return { x: x, y: rowY, width: width, velocity: 0, type: type };
    }
    function classifyFixture(entity, side) {
      var minimum = entity.x;
      var maximum = entity.x + entity.width;
      var concealed = side === 'LEFT'
        ? Math.max(0, Math.min(maximum, -15) - minimum)
        : Math.max(0, maximum - Math.max(minimum, 16));
      var visible = entity.width - concealed;
      return { concealed: concealed, visible: visible };
    }

    var canvas = {
      width: 800,
      height: 600,
      getContext: function () { return __context; }
    };
    var renderer = new Renderer(canvas);
    var renderPosition = { x: 0, y: 0 };
    var game = Object.create(Game.prototype);
    game.renderer = renderer;
    game.player = {
      getCurrentPosition: function () {
        return { x: renderPosition.x, y: renderPosition.y };
      },
      getVisualState: function () { return {}; }
    };
    game.world = { terrainRows: new Map() };
    game.clouds = [];
    game.visualSeed = 'property-17';
    game.visualTime = 0;
    game.gameState = { score: 0, state: 'PLAYING' };
    game.isStage2ItemVisible = function () { return true; };
    game.renderUI = function () {};

    var capture = null;
    var productionCenter = Renderer.prototype.centerCameraOnPlayer;
    renderer.centerCameraOnPlayer = function (worldX, worldY) {
      productionCenter.call(this, worldX, worldY);
      capture.cameraTarget = { x: worldX, y: worldY };
      capture.camera = { x: this.cameraX, y: this.cameraY };
    };
    renderer.drawCloud = function () {};
    renderer.drawGrassDecoration = function () {};
    renderer.drawBlockingProp = function () {};
    renderer.drawTerrainSlab = function (type, startX, rowY, width) {
      capture.terrain.push({
        type: type,
        startX: startX,
        y: rowY,
        width: width,
        footprint: this.getCanvasFootprint(startX, rowY - 0.01, width, 1)
      });
    };
    renderer.drawTrainTrackDetails = function () {};
    renderer.drawWarningSignal = function () {};
    renderer.drawSideShoulders = function (layout) {
      function boundary(worldX) {
        return [
          point(renderer, worldX, layout.left.clipRowMin),
          point(renderer, worldX, layout.left.clipRowMax + 1)
        ];
      }
      capture.opening = {
        left: boundary(layout.opening.logicalMinX),
        right: boundary(layout.opening.logicalMaxExclusiveX)
      };
      capture.shoulders = {
        leftOuter: boundary(layout.left.logicalOuterX),
        leftInner: boundary(layout.left.logicalInnerX),
        rightInner: boundary(layout.right.logicalInnerX),
        rightOuter: boundary(layout.right.logicalOuterX)
      };
      capture.layout = {
        rowMin: layout.left.visibleRowMin,
        rowMax: layout.left.visibleRowMax,
        leftInnerX: layout.left.logicalInnerX,
        rightInnerX: layout.right.logicalInnerX
      };
      return { sidesDrawn: 2, grassDrawn: 2, sceneryDrawn: 0, failedSides: 0 };
    };
    function captureEntity(entity) {
      capture.entities.push({
        type: entity.type,
        x: entity.x,
        y: entity.y,
        width: entity.width,
        footprint: renderer.getCanvasFootprint(
          entity.x, entity.y, entity.width, 1, renderer.TERRAIN_HEIGHT
        )
      });
    }
    renderer.drawVoxelCar = captureEntity;
    renderer.drawVoxelTrain = captureEntity;
    renderer.drawVoxelLog = captureEntity;
    renderer.drawVoxelLilyPad = captureEntity;
    renderer.drawGroundShadow = function (x, y, width, depth) {
      capture.shadow = {
        x: x, y: y, width: width, depth: depth,
        footprint: this.getCanvasFootprint(x, y, width, depth)
      };
    };
    renderer.drawVoxelChicken = function (x, y) {
      capture.player = { x: x, y: y, canvas: point(this, x, y) };
    };

    function installWorld(rowMin, rowMax, entity) {
      game.world.terrainRows = new Map();
      function makeRow(y) {
        return {
          y: y,
          type: 'GRASS',
          obstacles: [],
          platforms: [],
          decorations: [],
          metadata: {}
        };
      }
      var first = makeRow(rowMin);
      if (entity.type === 'CAR' || entity.type === 'TRAIN') {
        first.obstacles.push(entity);
      } else {
        first.platforms.push(entity);
      }
      game.world.terrainRows.set(rowMin, first);
      if (rowMax !== rowMin) game.world.terrainRows.set(rowMax, makeRow(rowMax));
    }

    function renderCase(options) {
      canvas.width = options.width;
      canvas.height = options.height;
      renderPosition = { x: options.playerX, y: options.playerY };
      installWorld(options.rowMin, options.rowMax, options.entity);
      capture = {
        terrain: [], entities: [], opening: null, shoulders: null,
        layout: null, shadow: null, player: null
      };
      game.render();
      var coverage = renderer.getCanvasFootprint(
        renderer.SIDE_OCCLUSION_CONFIG.leftOuterX,
        options.rowMin,
        renderer.SIDE_OCCLUSION_CONFIG.rightOuterX -
          renderer.SIDE_OCCLUSION_CONFIG.leftOuterX,
        options.rowMax - options.rowMin + 1
      );
      capture.coverage = bounds(coverage);
      capture.nonPlayer = JSON.stringify({
        terrain: capture.terrain,
        opening: capture.opening,
        shoulders: capture.shoulders,
        layout: capture.layout,
        entities: capture.entities,
        coverage: capture.coverage
      });
      return capture;
    }

    var entityTypes = ['CAR', 'LOG', 'LILY_PAD', 'TRAIN'];
    var propertyCases = 128;
    for (var caseIndex = 0; caseIndex < propertyCases; caseIndex++) {
      var width = [640, 800, 960, 1024][caseIndex % 4];
      var height = [480, 600, 720][Math.floor(caseIndex / 4) % 3];
      var playerY = (((caseIndex * 17) % 81) - 40) / 4;
      var playerX = ((caseIndex * 11) % 31) - 15;
      var rowMin = Math.floor(playerY) - 20 + (caseIndex % 2);
      var rowMax = Math.floor(playerY) + 15 - (caseIndex % 3);
      var type = entityTypes[caseIndex % entityTypes.length];
      var side = Math.floor(caseIndex / entityTypes.length) % 2 === 0
        ? 'LEFT' : 'RIGHT';
      var entity = fixtureFor(type, side, rowMin, 'STRADDLE');
      var options = {
        width: width, height: height, playerX: playerX, playerY: playerY,
        rowMin: rowMin, rowMax: rowMax, entity: entity
      };
      var actual = renderCase(options);
      options.playerX = 0;
      var baseline = renderCase(options);
      var expectedCamera = renderer.worldToIso(0, playerY);

      assert(actual.cameraTarget.x === 0 && actual.cameraTarget.y === playerY,
        'Property 17 camera target used Player x in case ' + caseIndex);
      close(actual.camera.x, expectedCamera.screenX,
        'Property 17 cameraX mismatch in case ' + caseIndex);
      close(actual.camera.y, expectedCamera.screenY,
        'Property 17 cameraY mismatch in case ' + caseIndex);
      assert(actual.nonPlayer === baseline.nonPlayer,
        'Property 17 non-Player geometry moved with Player x in case ' + caseIndex);
      assert(actual.terrain.every(function (terrain) {
        return terrain.startX === -15 && terrain.width === 31;
      }), 'Property 17 Terrain left the fixed [-15, 16) opening in case ' + caseIndex);
      assert(actual.player.x === playerX && actual.player.y === playerY,
        'Property 17 Player was not drawn at interpolated x/y in case ' + caseIndex);
      close(actual.shadow.x, playerX + 0.08,
        'Property 17 shadow lost interpolated Player x in case ' + caseIndex);
      close(actual.shadow.y, playerY + 0.16,
        'Property 17 shadow lost interpolated Player y in case ' + caseIndex);
      assert(actual.coverage.minX <= 0 && actual.coverage.maxX >= width,
        'Property 17 side coverage did not reach both viewport edges in case ' + caseIndex);
      var classification = classifyFixture(entity, side);
      assert(classification.concealed > 0 && classification.visible > 0,
        'Property 17 entity fixture did not straddle its side boundary in case ' + caseIndex);
    }

    // Focused fixed-y x matrix: Camera, Terrain, opening, shoulders, and entity
    // boundaries are byte-equivalent at every mandated Player x coordinate.
    var exactXs = [-15, -14, -1, 0, 1, 14, 15];
    var fixedY = 6.25;
    var exactOptions = {
      width: 800, height: 600, playerX: 0, playerY: fixedY,
      rowMin: -14, rowMax: 21,
      entity: fixtureFor('CAR', 'LEFT', -14, 'STRADDLE')
    };
    var exactBaseline = renderCase(exactOptions);
    exactXs.forEach(function (playerX) {
      exactOptions.playerX = playerX;
      var result = renderCase(exactOptions);
      assert(result.cameraTarget.x === 0 && result.cameraTarget.y === fixedY,
        'Focused camera target changed at Player x ' + playerX);
      assert(result.nonPlayer === exactBaseline.nonPlayer,
        'Focused non-Player boundary changed at Player x ' + playerX);
    });

    // Focused accepted lateral hops preserve all non-Player captures while the
    // Player moves by the unchanged one-cell isometric projection delta.
    [[-15, -14], [-1, 0], [0, 1], [14, 15]].forEach(function (hop) {
      exactOptions.playerX = hop[0];
      var before = renderCase(exactOptions);
      exactOptions.playerX = hop[1];
      var after = renderCase(exactOptions);
      var beforeIso = renderer.worldToIso(hop[0], fixedY);
      var afterIso = renderer.worldToIso(hop[1], fixedY);
      close(after.player.canvas.x - before.player.canvas.x,
        afterIso.screenX - beforeIso.screenX,
        'Lateral hop Player canvas x delta changed for ' + hop.join('->'));
      close(after.player.canvas.y - before.player.canvas.y,
        afterIso.screenY - beforeIso.screenY,
        'Lateral hop Player canvas y delta changed for ' + hop.join('->'));
      assert(before.nonPlayer === after.nonPlayer,
        'Lateral hop moved non-Player boundaries for ' + hop.join('->'));
    });

    // Focused edge coverage and symmetric conceal/reveal classification for
    // every Moving Entity kind on both sides at Player x -15, 0, and 15.
    [-15, 0, 15].forEach(function (playerX) {
      entityTypes.forEach(function (type) {
        ['LEFT', 'RIGHT'].forEach(function (side) {
          var states = ['CORRIDOR', 'STRADDLE', 'OPENING'];
          var classifications = states.map(function (state) {
            var entity = fixtureFor(type, side, -14, state);
            var options = {
              width: 800, height: 600, playerX: playerX, playerY: fixedY,
              rowMin: -14, rowMax: 21, entity: entity
            };
            var result = renderCase(options);
            options.playerX = 0;
            var reference = renderCase(options);
            assert(result.nonPlayer === reference.nonPlayer,
              type + ' ' + side + ' occlusion moved at Player x ' + playerX);
            assert(result.coverage.minX <= 0 && result.coverage.maxX >= 800,
              'Background exposure detected for ' + type + ' ' + side +
                ' at Player x ' + playerX);
            return classifyFixture(entity, side);
          });
          assert(classifications[0].concealed > 0 && classifications[0].visible === 0,
            type + ' ' + side + ' corridor fixture was not fully concealed');
          assert(classifications[1].concealed > 0 && classifications[1].visible > 0,
            type + ' ' + side + ' boundary fixture did not conceal/reveal partially');
          assert(classifications[2].concealed === 0 && classifications[2].visible > 0,
            type + ' ' + side + ' opening fixture was not fully revealed');
        });
      });
    });

    // Backward, zero, forward, and fractional y values retain vertical follow
    // and the existing 62-percent canvas ahead-bias independently of Player x.
    [-9, -2.5, 0, 3.75, 12].forEach(function (playerY) {
      [-15, 0, 15].forEach(function (playerX) {
        var options = {
          width: 960, height: 720, playerX: playerX, playerY: playerY,
          rowMin: Math.floor(playerY) - 20,
          rowMax: Math.floor(playerY) + 15,
          entity: fixtureFor('LILY_PAD', 'RIGHT', Math.floor(playerY) - 20, 'STRADDLE')
        };
        var result = renderCase(options);
        var expected = renderer.worldToIso(0, playerY);
        close(result.camera.x, expected.screenX,
          'Vertical follow cameraX changed at y ' + playerY + ', x ' + playerX);
        close(result.camera.y, expected.screenY,
          'Vertical follow cameraY changed at y ' + playerY + ', x ' + playerX);
        var cameraAnchor = point(renderer, 0, playerY);
        close(cameraAnchor.x, canvas.width / 2,
          'Horizontal world anchor left Canvas center at y ' + playerY);
        close(cameraAnchor.y, canvas.height * renderer.PLAYER_SCREEN_Y_RATIO,
          '62-percent ahead-bias changed at y ' + playerY);
      });
    });

    // Known-input/known-output checks guard the unchanged projection formulas.
    var projectionRenderer = new Renderer(canvas);
    canvas.width = 800;
    canvas.height = 600;
    var grid = projectionRenderer.gridToIso(2, 1);
    assert(grid.screenX === 32 && grid.screenY === 48,
      'gridToIso formula changed');
    var world = projectionRenderer.worldToIso(2, 1);
    assert(world.screenX === 96 && world.screenY === 16,
      'worldToIso formula changed');
    var canvasPoint = projectionRenderer.screenToCanvas(96, 16);
    assert(canvasPoint.x === 496 && canvasPoint.y === 388,
      'screenToCanvas formula or 62-percent ahead-bias changed');
  `;

  var __stack = [];
  var __context = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, font: '', textAlign: '',
    shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0,
    shadowOffsetY: 0, globalCompositeOperation: 'source-over',
    clearRect: function () {}, fillRect: function () {}, fillText: function () {},
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    closePath: function () {}, clip: function () {}, fill: function () {},
    stroke: function () {},
    save: function () { __stack.push({ globalAlpha: this.globalAlpha }); },
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

  eval(source + '\n' + assertions);
  return 'PASS: Property 17 (128 deterministic cases), fixed x matrix, lateral hops, edge coverage, entity occlusion, vertical follow, and projection formulas';
}
