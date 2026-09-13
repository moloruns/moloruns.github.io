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
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    function assertClose(actual, expected, message) {
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-10) {
        throw new Error(message + ': expected ' + expected + ', got ' + actual);
      }
    }

    function assertEqualJson(actual, expected, message) {
      var actualJson = JSON.stringify(actual);
      var expectedJson = JSON.stringify(expected);
      if (actualJson !== expectedJson) {
        throw new Error(message + '\\nexpected: ' + expectedJson + '\\nactual:   ' + actualJson);
      }
    }

    function seededRandom(seed) {
      var state = seed >>> 0;
      return function () {
        state = (state + 0x6D2B79F5) >>> 0;
        var value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    }

    function eventFor(key) {
      return {
        key: key,
        defaultPrevented: false,
        preventDefault: function () { this.defaultPrevented = true; }
      };
    }

    function withoutCosmetics(value) {
      if (Array.isArray(value)) return value.map(withoutCosmetics);
      if (!value || typeof value !== 'object') return value;
      var result = {};
      Object.keys(value).forEach(function (key) {
        if (key !== 'cosmetics') result[key] = withoutCosmetics(value[key]);
      });
      return result;
    }

    function snapshotRows(world) {
      var rows = [];
      world.terrainRows.forEach(function (row, y) {
        rows.push({ y: y, row: withoutCosmetics(row) });
      });
      rows.sort(function (left, right) { return left.y - right.y; });
      return rows;
    }

    function countCosmetics(world) {
      var containers = 0;
      var descriptors = 0;
      world.terrainRows.forEach(function (row) {
        if (row && row.cosmetics && Object.isFrozen(row.cosmetics)) {
          containers++;
          if (row.cosmetics.pokeBall) descriptors++;
        }
      });
      return { containers: containers, descriptors: descriptors };
    }

    function createPlainRow(y, type, obstacles, platforms, metadata) {
      return {
        y: y,
        type: type,
        obstacles: obstacles || [],
        platforms: platforms || [],
        decorations: Object.freeze([]),
        metadata: metadata || {}
      };
    }

    function runScenario(caseIndex, cosmeticsEnabled) {
      var productionAttach = attachRowCosmetics;
      if (!cosmeticsEnabled) {
        attachRowCosmetics = function (row) { return row; };
      }

      try {
        var visualSeed = 'property-13-visual:' + caseIndex;
        var game = new Game({
          random: seededRandom((0x13000000 + Math.imul(caseIndex + 1, 7919)) >>> 0),
          visualSeed: visualSeed
        });
        var initialRows = snapshotRows(game.world);
        var initialCosmetics = countCosmetics(game.world);

        game.world.terrainRows.clear();
        for (var y = -20; y <= 15; y++) {
          var row;
          if (y === 7) {
            row = generateRoad(y, (caseIndex * 37) % 401,
              seededRandom(0x21000000 + caseIndex));
          } else if (y === 8) {
            row = generateRiver(y, (caseIndex * 41) % 401,
              seededRandom(0x22000000 + caseIndex));
          } else if (y === 9) {
            row = generateTrainTrack(y, seededRandom(0x23000000 + caseIndex));
          } else {
            row = createPlainRow(y, 'GRASS');
          }
          game.world.addTerrainRow(game.attachStage2RowData(row));
        }

        game.player.x = (caseIndex % 29) - 14;
        game.player.y = 0;
        game.player.startPos = { x: game.player.x, y: game.player.y };
        game.player.targetPos = { x: game.player.x, y: game.player.y };
        game.gameState.score = 0;
        game.gameState.maxYReached = 0;
        game.gameState.state = 'PLAYING';

        var upKeys = ['ArrowUp', 'w', 'W'];
        var rightKeys = ['ArrowRight', 'd', 'D'];
        var leftKeys = ['ArrowLeft', 'a', 'A'];
        var downKeys = ['ArrowDown', 's', 'S'];
        var keys = [
          upKeys[caseIndex % upKeys.length],
          rightKeys[caseIndex % rightKeys.length],
          leftKeys[caseIndex % leftKeys.length],
          upKeys[(caseIndex + 1) % upKeys.length],
          downKeys[caseIndex % downKeys.length]
        ];
        var expectedScores = [1, 1, 1, 2, 2];
        var movementTrace = [];

        keys.forEach(function (key, movementIndex) {
          var startX = game.player.x;
          var startY = game.player.y;
          var inputEvent = eventFor(key);
          game.inputSystem.handleKeyDown(inputEvent);
          assert(inputEvent.defaultPrevented,
            'Property 13 case ' + caseIndex + ' did not consume key ' + key);
          assert(game.player.isMoving && game.player.animationDuration === 150,
            'Property 13 case ' + caseIndex + ' did not start a 150ms move');
          assert(Math.abs(game.player.targetPos.x - startX) +
            Math.abs(game.player.targetPos.y - startY) === 1,
            'Property 13 case ' + caseIndex + ' move was not one cell');

          var targetX = game.player.targetPos.x;
          var targetY = game.player.targetPos.y;
          game.update(149);
          assert(game.player.isMoving && game.player.x === startX &&
            game.player.y === startY,
            'Property 13 case ' + caseIndex + ' completed before 150ms');
          game.update(1);
          assert(!game.player.isMoving && game.player.x === targetX &&
            game.player.y === targetY,
            'Property 13 case ' + caseIndex + ' did not complete at 150ms');
          assert(game.gameState.score === expectedScores[movementIndex],
            'Property 13 case ' + caseIndex + ' score progression changed');

          movementTrace.push({
            key: key,
            start: { x: startX, y: startY },
            target: { x: targetX, y: targetY },
            duration: game.player.animationDuration,
            score: game.gameState.score,
            maxYReached: game.gameState.maxYReached,
            state: game.gameState.state
          });
        });

        var boundaryX = caseIndex % 2 === 0 ? -15 : 15;
        var boundaryKey = boundaryX === -15 ? 'ArrowLeft' : 'ArrowRight';
        var boundaryPlayer = new Player(boundaryX, caseIndex % 7);
        var boundaryState = { state: 'PLAYING', score: caseIndex, maxYReached: 0 };
        var boundaryInput = new Input(boundaryPlayer, boundaryState, {
          canEnter: function () {
            throw new Error('Outward boundary input consulted World admission');
          }
        });
        var boundaryBefore = JSON.stringify(boundaryPlayer);
        var boundaryEvent = eventFor(boundaryKey);
        boundaryInput.handleKeyDown(boundaryEvent);
        assert(boundaryEvent.defaultPrevented && !boundaryPlayer.isMoving &&
          boundaryPlayer.x === boundaryX && JSON.stringify(boundaryPlayer) === boundaryBefore,
          'Property 13 case ' + caseIndex + ' changed the inclusive x boundary');

        var roadCollisionRow = createPlainRow(30, 'ROAD', [
          { type: 'CAR', x: 0, y: 30, width: 2, velocity: 0 }
        ]);
        var riverCollisionRow = createPlainRow(31, 'RIVER', [], [
          { type: 'LILY_PAD', x: 2, y: 31, width: 4, velocity: 0 }
        ]);
        var trainCollisionRow = createPlainRow(32, 'TRAIN_TRACK', [
          { type: 'TRAIN', x: -1, y: 32, width: 7, velocity: 0 }
        ]);
        var collisionWorld = new World();
        [roadCollisionRow, riverCollisionRow, trainCollisionRow].forEach(function (row) {
          collisionWorld.addTerrainRow(game.attachStage2RowData(row));
        });
        var collisionResults = [
          checkCollisions({ x: 0, y: 30 }, collisionWorld),
          checkCollisions({ x: 5, y: 30 }, collisionWorld),
          checkCollisions({ x: 1.65, y: 31 }, collisionWorld),
          checkCollisions({ x: 3.349999, y: 31 }, collisionWorld),
          checkCollisions({ x: 3.35, y: 31 }, collisionWorld),
          checkCollisions({ x: 4.5, y: 31 }, collisionWorld),
          checkCollisions({ x: -1, y: 32 }, collisionWorld)
        ];
        assertEqualJson(collisionResults,
          ['COLLISION', 'SAFE', 'SAFE', 'SAFE', 'WATER_HAZARD', 'WATER_HAZARD', 'COLLISION'],
          'Property 13 case ' + caseIndex + ' collision or single-Lily support changed');

        game.player.x = 0;
        game.player.y = 2;
        game.player.startPos = { x: 0, y: 2 };
        game.player.targetPos = { x: 0, y: 2 };
        game.player.isMoving = false;
        game.world.addTerrainRow(game.attachStage2RowData(createPlainRow(3, 'ROAD', [
          { type: 'CAR', x: 0, y: 3, width: 2, velocity: 0 }
        ], [], { direction: 1, lockedRowSpeed: 0 })));
        var hazardEvent = eventFor('ArrowUp');
        game.inputSystem.handleKeyDown(hazardEvent);
        game.update(150);
        assert(game.player.y === 3 && game.gameState.score === 3 &&
          game.gameState.maxYReached === 3 && game.gameState.state === 'GAME_OVER',
          'Property 13 case ' + caseIndex + ' collision state transition changed');

        var cameraCapture = null;
        var sideLayoutCapture = null;
        var pikachuCalls = 0;
        var chickenCalls = 0;
        var pokeBallDrawCalls = 0;
        var renderer = game.renderer;
        var productionCenter = Renderer.prototype.centerCameraOnPlayer;
        renderer.centerCameraOnPlayer = function (worldX, worldY) {
          productionCenter.call(this, worldX, worldY);
          cameraCapture = {
            targetX: worldX,
            targetY: worldY,
            cameraX: this.cameraX,
            cameraY: this.cameraY
          };
        };
        renderer.clear = function () {};
        renderer.isWorldFootprintVisible = function () { return true; };
        renderer.drawCloud = function () {};
        renderer.drawTerrainSlab = function () {};
        renderer.drawTrainTrackDetails = function () {};
        renderer.drawWarningSignal = function () {};
        renderer.drawGrassDecoration = function () {};
        renderer.drawBlockingProp = function () { return 1; };
        renderer.drawVoxelCar = function () { return 1; };
        renderer.drawVoxelTrain = function () { return 1; };
        renderer.drawVoxelLog = function () { return 1; };
        renderer.drawVoxelLilyPad = function () { return 1; };
        renderer.drawGroundShadow = function () {};
        renderer.drawVoxelPokeBall = function () { pokeBallDrawCalls++; return 1; };
        renderer.drawVoxelPikachu = function () { pikachuCalls++; return 1; };
        renderer.drawVoxelChicken = function () { chickenCalls++; return 1; };
        renderer.drawSideShoulders = function (layout) {
          sideLayoutCapture = withoutCosmetics(layout);
          return { sidesDrawn: 2, grassDrawn: 2, sceneryDrawn: 0, failedSides: 0 };
        };
        game.render();
        var expectedCamera = renderer.worldToIso(0, game.player.y);
        assert(cameraCapture && cameraCapture.targetX === 0 &&
          cameraCapture.targetY === game.player.y,
          'Property 13 case ' + caseIndex + ' camera did not target world x zero');
        assertClose(cameraCapture.cameraX, expectedCamera.screenX,
          'Property 13 case ' + caseIndex + ' camera x projection changed');
        assertClose(cameraCapture.cameraY, expectedCamera.screenY,
          'Property 13 case ' + caseIndex + ' camera y projection changed');
        assert(sideLayoutCapture &&
          sideLayoutCapture.opening.logicalMinX === -15 &&
          sideLayoutCapture.opening.logicalMaxExclusiveX === 16 &&
          sideLayoutCapture.left.logicalMaxExclusiveX === -15 &&
          sideLayoutCapture.right.logicalMinX === 16,
          'Property 13 case ' + caseIndex + ' side occlusion opening changed');
        assert(pikachuCalls === 1 && chickenCalls === 0,
          'Property 13 case ' + caseIndex + ' did not enable only Pikachu dispatch');

        var lilyRenderer = new Renderer(__canvas);
        var lilyShadowWidth = null;
        var lilyPolygonCount = 0;
        lilyRenderer.drawGroundShadow = function (x, y, width) {
          lilyShadowWidth = width;
        };
        lilyRenderer.fillPolygon = function () { lilyPolygonCount++; };
        var lilyRenderCount = lilyRenderer.drawVoxelLilyPad({
          type: 'LILY_PAD',
          x: 2,
          y: 31,
          width: 4,
          velocity: 0,
          visual: { modelVariant: 0, paletteIndex: caseIndex % 4 }
        });
        assert(lilyRenderCount === 1 && lilyShadowWidth === 1 && lilyPolygonCount === 7,
          'Property 13 case ' + caseIndex + ' single-Lily rendering changed');

        var spawnScore = (caseIndex * 37) % 501;
        var generatedRows = [
          generateGrass(100 + caseIndex, visualSeed, null),
          generateRoad(200 + caseIndex, spawnScore,
            seededRandom(0x31000000 + caseIndex)),
          generateRiver(300 + caseIndex, spawnScore,
            seededRandom(0x32000000 + caseIndex)),
          generateTrainTrack(400 + caseIndex,
            seededRandom(0x33000000 + caseIndex))
        ];
        generatedRows = generatedRows.map(function (row) {
          return game.attachStage2RowData(row);
        });
        assertClose(generatedRows[1].metadata.lockedRowSpeed,
          calculateScoreScaledSpeed('ROAD', spawnScore),
          'Property 13 case ' + caseIndex + ' Road score scaling changed');
        assertClose(generatedRows[2].metadata.lockedRowSpeed,
          calculateScoreScaledSpeed('RIVER', spawnScore),
          'Property 13 case ' + caseIndex + ' River score scaling changed');
        assert(generatedRows[2].platforms.length === 5 &&
          generatedRows[2].platforms.every(function (platform) {
            return platform.type !== 'LILY_PAD' || platform.width === 1;
          }), 'Property 13 case ' + caseIndex + ' generated Lily shape changed');

        var motionGame = Object.create(Game.prototype);
        motionGame.world = { terrainRows: new Map([
          [generatedRows[1].y, generatedRows[1]],
          [generatedRows[2].y, generatedRows[2]]
        ]) };
        motionGame.gameState = { score: spawnScore + 325 };
        motionGame.random = function () {
          throw new Error('Existing Road/River motion consumed random input');
        };
        motionGame.visualSeed = visualSeed;
        var motionDelta = 1 + (caseIndex % 97);
        motionGame.updateMovingEntities(motionDelta);

        var track = generateTrainTrack(500 + caseIndex,
          seededRandom(0x41000000 + caseIndex));
        game.attachStage2RowData(track);
        var trainRandom = seededRandom(0x42000000 + caseIndex);
        updateTrainTrackLifecycle(
          track,
          track.metadata.idleRemaining + TRAIN_TRACK_CONFIG.warningDuration,
          trainRandom,
          visualSeed
        );
        assert(track.metadata.trainState === 'ACTIVE' &&
          track.obstacles.length === 1 && track.obstacles[0].type === 'TRAIN' &&
          track.obstacles[0].width >= 7 && track.obstacles[0].width <= 11 &&
          Math.abs(track.obstacles[0].velocity) >= INITIAL_SPEED_RANGES.TRAIN.min &&
          Math.abs(track.obstacles[0].velocity) <= INITIAL_SPEED_RANGES.TRAIN.max,
          'Property 13 case ' + caseIndex + ' Train generation changed');
        updateTrainTrackLifecycle(track, 17 + (caseIndex % 31), trainRandom, visualSeed);

        var finalCosmetics = countCosmetics(game.world);
        var directCosmeticContainers = generatedRows.filter(function (row) {
          return !!row.cosmetics;
        }).length + (track.cosmetics ? 1 : 0);
        var directDescriptors = generatedRows.reduce(function (count, row) {
          return count + (row.cosmetics && row.cosmetics.pokeBall ? 1 : 0);
        }, track.cosmetics && track.cosmetics.pokeBall ? 1 : 0);

        return {
          gameplay: {
            initialRows: initialRows,
            movementTrace: movementTrace,
            boundary: {
              x: boundaryPlayer.x,
              y: boundaryPlayer.y,
              moving: boundaryPlayer.isMoving,
              state: boundaryState
            },
            collisionResults: collisionResults,
            transition: {
              x: game.player.x,
              y: game.player.y,
              score: game.gameState.score,
              maxYReached: game.gameState.maxYReached,
              state: game.gameState.state
            },
            camera: cameraCapture,
            sideLayout: sideLayoutCapture,
            worldAfterTrace: snapshotRows(game.world),
            generatedRows: generatedRows.map(withoutCosmetics),
            movedRows: Array.from(motionGame.world.terrainRows.values())
              .map(withoutCosmetics),
            train: withoutCosmetics(track),
            lilyRendering: {
              count: lilyRenderCount,
              shadowWidth: lilyShadowWidth,
              polygons: lilyPolygonCount
            }
          },
          cosmetics: {
            containers: initialCosmetics.containers + finalCosmetics.containers +
              directCosmeticContainers,
            descriptors: initialCosmetics.descriptors + finalCosmetics.descriptors +
              directDescriptors,
            pokeBallDrawCalls: pokeBallDrawCalls
          },
          pikachuCalls: pikachuCalls,
          chickenCalls: chickenCalls
        };
      } finally {
        attachRowCosmetics = productionAttach;
      }
    }

    // Feature: pokemon-reskin-and-pokeballs, Property 13: Existing gameplay regression behavior is invariant
    // **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 8.10**
    var PROPERTY_CASE_COUNT = 128;
    var totalCosmeticContainers = 0;
    var totalDescriptors = 0;
    var totalPokeBallDraws = 0;

    for (var caseIndex = 0; caseIndex < PROPERTY_CASE_COUNT; caseIndex++) {
      var baseline = runScenario(caseIndex, false);
      var enabled = runScenario(caseIndex, true);
      assertEqualJson(enabled.gameplay, baseline.gameplay,
        'Property 13 case ' + caseIndex +
        ' diverged from its pre-feature-equivalent gameplay snapshot');
      assert(baseline.cosmetics.containers === 0 && baseline.cosmetics.descriptors === 0,
        'Property 13 case ' + caseIndex + ' baseline unexpectedly contained cosmetics');
      assert(enabled.cosmetics.containers > 0,
        'Property 13 case ' + caseIndex + ' did not enable row cosmetic containers');
      assert(enabled.pikachuCalls === 1 && enabled.chickenCalls === 0,
        'Property 13 case ' + caseIndex + ' did not preserve Pikachu-only dispatch');
      totalCosmeticContainers += enabled.cosmetics.containers;
      totalDescriptors += enabled.cosmetics.descriptors;
      totalPokeBallDraws += enabled.cosmetics.pokeBallDrawCalls;
    }

    assert(totalDescriptors > 0,
      'Property 13 deterministic cases produced no enabled Poké Ball descriptors');
    assert(totalPokeBallDraws > 0,
      'Property 13 deterministic renders drew no enabled Poké Ball descriptors');

    return 'PASS: Feature: pokemon-reskin-and-pokeballs, Property 13: Existing gameplay regression behavior is invariant; ' +
      PROPERTY_CASE_COUNT + ' deterministic movement/input/time sequence pairs matched with ' +
      totalCosmeticContainers + ' cosmetic containers, ' + totalDescriptors +
      ' Poké Ball descriptors, and ' + totalPokeBallDraws + ' Poké Ball draws enabled';
  `;

  var __stack = [];
  var __context2d = {
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
  var __canvas = {
    width: 800,
    height: 600,
    getContext: function () { return __context2d; }
  };
  var console = { log: function () {}, error: function () {} };
  var document = {
    getElementById: function (id) { return id === 'gameCanvas' ? __canvas : null; }
  };
  var performance = { now: function () { return 0; } };
  var requestAnimationFrame = function () { return 1; };
  var window = {
    document: document,
    performance: performance,
    requestAnimationFrame: requestAnimationFrame,
    addEventListener: function () {},
    removeEventListener: function () {}
  };

  return eval(productionSource + '\n' + assertions);
}
