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

    function makeRow(y, type, obstacles, platforms, metadata, decorations) {
      return {
        y: y,
        type: type,
        obstacles: obstacles || [],
        platforms: platforms || [],
        metadata: metadata || {},
        decorations: decorations || []
      };
    }

    function makeDescriptor(x, y, terrainType, variant) {
      return Object.freeze({
        id: 'pokeball:' + y,
        type: 'POKE_BALL',
        x: x,
        y: y,
        terrainType: terrainType,
        blocking: false,
        variant: variant,
        schemaVersion: 1
      });
    }

    function installGuardedCosmetics(row, descriptor, accessGuard) {
      var container = Object.freeze({ pokeBall: descriptor });
      Object.defineProperty(row, 'cosmetics', {
        configurable: false,
        enumerable: true,
        get: function () {
          if (accessGuard.gameplayActive) {
            accessGuard.gameplayReads++;
            throw new Error(
              accessGuard.label + ': gameplay query consumed cosmetics on row ' + row.y
            );
          }
          return container;
        }
      });
      return container;
    }

    function rowGameplaySnapshot(row) {
      return {
        y: row.y,
        type: row.type,
        obstacles: row.obstacles,
        platforms: row.platforms,
        metadata: row.metadata,
        decorations: row.decorations
      };
    }

    function worldGameplaySnapshot(world) {
      return Array.from(world.terrainRows.values())
        .sort(function (left, right) { return left.y - right.y; })
        .map(rowGameplaySnapshot);
    }

    function playerSnapshot(player) {
      return {
        x: player.x,
        y: player.y,
        isMoving: player.isMoving,
        animationProgress: player.animationProgress,
        animationDuration: player.animationDuration,
        startPos: player.startPos,
        targetPos: player.targetPos,
        facing: player.facing,
        maxHopHeight: player.maxHopHeight
      };
    }

    function gameStateSnapshot(game) {
      return {
        state: game.gameState.state,
        score: game.gameState.score,
        maxYReached: game.gameState.maxYReached
      };
    }

    function makeKeyEvent(key) {
      return {
        key: key,
        prevented: false,
        preventDefault: function () { this.prevented = true; }
      };
    }

    function buildScenario(caseIndex, terrainType, withDescriptor) {
      var targetY = 20 + caseIndex * 7;
      var targetX = -10 + (caseIndex * 11) % 21;
      var visualSeed = 'property-10:' + caseIndex + ':' + terrainType;
      var accessGuard = {
        label: (withDescriptor ? 'descriptor' : 'descriptor-free') +
          ' case ' + caseIndex + ' ' + terrainType,
        gameplayActive: false,
        gameplayReads: 0
      };
      var game = new Game({
        visualSeed: visualSeed,
        random: seededRandom((0xA341316C ^ Math.imul(caseIndex + 1, 2654435761)) >>> 0)
      });

      game.world.terrainRows.clear();
      game.random = seededRandom((0xC8013EA4 ^ Math.imul(caseIndex + 3, 2246822519)) >>> 0);
      game.player.x = targetX;
      game.player.y = targetY - 1;
      game.player.startPos = { x: targetX, y: targetY - 1 };
      game.player.targetPos = { x: targetX, y: targetY - 1 };
      game.player.isMoving = false;
      game.player.animationProgress = 0;
      game.gameState.state = 'PLAYING';
      game.gameState.score = caseIndex % 13;
      game.gameState.maxYReached = targetY - 1;

      // Keep this focused trace on already-retained rows. Generation and cleanup
      // have their own properties; disabling them here prevents unrelated rows
      // from obscuring whether gameplay queries consume row cosmetics.
      game.ensureTerrainAroundPlayer = function () {};
      game.cleanupOldTerrain = function () {};

      var targetRow;
      if (terrainType === 'ROAD') {
        targetRow = makeRow(targetY, 'ROAD', [
          { x: targetX + 5, y: targetY, width: 1, velocity: 0.003, type: 'CAR' }
        ], [], {
          direction: 1,
          lockedRowSpeed: 0.003,
          speed: 0.003
        });
      } else if (terrainType === 'TRAIN_TRACK') {
        targetRow = makeRow(targetY, 'TRAIN_TRACK', [], [], {
          trainState: 'IDLE',
          idleRemaining: 10000,
          warningElapsed: 0,
          warningLightOn: false,
          completedEvents: 0
        });
      } else {
        targetRow = makeRow(targetY, 'GRASS');
      }

      var rows = [
        makeRow(targetY - 1, 'GRASS'),
        targetRow,
        makeRow(targetY + 1, 'GRASS'),
        makeRow(targetY + 2, 'ROAD', [
          { x: 6, y: targetY + 2, width: 2, velocity: 0.004, type: 'CAR' }
        ], [], {
          direction: 1,
          lockedRowSpeed: 0.004,
          speed: 0.004
        }),
        makeRow(targetY + 3, 'RIVER', [], [
          { x: -3, y: targetY + 3, width: 3, velocity: 0.002, type: 'LOG' }
        ], {
          direction: 1,
          lockedRowSpeed: 0.002,
          speed: 0.002
        }),
        makeRow(targetY + 4, 'RIVER', [], [], {
          direction: -1,
          lockedRowSpeed: 0.002,
          speed: 0.002
        }),
        makeRow(targetY + 5, 'TRAIN_TRACK', [], [], {
          trainState: 'WARNING',
          idleRemaining: 0,
          warningElapsed: 2950,
          warningLightOn: true,
          completedEvents: caseIndex % 4
        })
      ];

      var targetDescriptor = null;
      var targetContainer = null;
      rows.forEach(function (row) {
        var descriptor = null;
        if (row === targetRow && withDescriptor) {
          descriptor = makeDescriptor(targetX, targetY, terrainType, caseIndex % 4);
          targetDescriptor = descriptor;
        }
        var container = installGuardedCosmetics(row, descriptor, accessGuard);
        if (row === targetRow) targetContainer = container;
        game.world.addTerrainRow(row);
      });

      var observer = {
        soundCalls: [],
        explicitAnimationCalls: [],
        acceptedMovementAnimations: [],
        inventory: [],
        collections: [],
        removalCalls: [],
        collisionResults: []
      };

      game.playSound = function (name) { observer.soundCalls.push(name); };
      game.triggerAnimation = function (name) { observer.explicitAnimationCalls.push(name); };
      game.addToInventory = function (item) { observer.inventory.push(item); };
      game.collectPokeBall = function (item) { observer.collections.push(item); };
      game.removePokeBall = function (item) { observer.removalCalls.push(item); };

      var originalMove = game.player.move.bind(game.player);
      game.player.move = function (dx, dy) {
        var accepted = originalMove(dx, dy);
        if (accepted) {
          observer.acceptedMovementAnimations.push({ dx: dx, dy: dy });
        }
        return accepted;
      };

      var originalHandleCollision = game.handleCollision.bind(game);
      game.handleCollision = function (collisionResult) {
        observer.collisionResults.push(collisionResult);
        return originalHandleCollision(collisionResult);
      };

      return {
        game: game,
        observer: observer,
        accessGuard: accessGuard,
        targetRow: targetRow,
        targetContainer: targetContainer,
        targetDescriptor: targetDescriptor,
        targetX: targetX,
        targetY: targetY
      };
    }

    function executeGameplayTrace(scenario) {
      var game = scenario.game;
      var observer = scenario.observer;
      scenario.accessGuard.gameplayActive = true;

      var enterEvent = makeKeyEvent('ArrowUp');
      game.inputSystem.handleKeyDown(enterEvent);
      var enterAdmission = {
        prevented: enterEvent.prevented,
        moving: game.player.isMoving,
        targetX: game.player.targetPos.x,
        targetY: game.player.targetPos.y
      };
      game.update(75);
      game.update(75);
      var enteredDescriptorCell = game.player.x === scenario.targetX &&
        game.player.y === scenario.targetY;

      var crossEvent = makeKeyEvent('ArrowUp');
      game.inputSystem.handleKeyDown(crossEvent);
      var crossAdmission = {
        prevented: crossEvent.prevented,
        moving: game.player.isMoving,
        targetX: game.player.targetPos.x,
        targetY: game.player.targetPos.y
      };
      game.update(150);
      var crossedDescriptorCell = game.player.x === scenario.targetX &&
        game.player.y === scenario.targetY + 1;

      var targetCollision = checkCollisions(game.player, game.world);
      var roadRow = game.world.getTerrainAt(0, scenario.targetY + 2);
      var roadObstacle = roadRow.obstacles[0];
      var obstacleCollision = checkCollisions({
        x: roadObstacle.x + 0.25,
        y: roadRow.y
      }, game.world);

      var supportRow = game.world.getTerrainAt(0, scenario.targetY + 3);
      var supportingPlatform = supportRow.platforms[0];
      var supportProbe = new Player(supportingPlatform.x + 0.25, supportRow.y);
      var foundSupport = findSupportingPlatform(supportProbe, supportRow);
      var ridingResult = updatePlatformRiding(supportProbe, game.world, 20);

      var unsupportedProbe = new Player(14, scenario.targetY + 4);
      var missingSupport = findSupportingPlatform(
        unsupportedProbe,
        game.world.getTerrainAt(14, scenario.targetY + 4)
      );
      var waterCollision = checkCollisions(unsupportedProbe, game.world);
      var unsupportedRidingResult = updatePlatformRiding(
        unsupportedProbe,
        game.world,
        20
      );

      game.handleCollision(obstacleCollision);
      scenario.accessGuard.gameplayActive = false;

      return {
        enterAdmission: enterAdmission,
        crossAdmission: crossAdmission,
        enteredDescriptorCell: enteredDescriptorCell,
        crossedDescriptorCell: crossedDescriptorCell,
        player: playerSnapshot(game.player),
        gameState: gameStateSnapshot(game),
        targetCollision: targetCollision,
        obstacleCollision: obstacleCollision,
        foundSupportType: foundSupport && foundSupport.type,
        supportProbeX: supportProbe.x,
        ridingResult: ridingResult,
        missingSupport: missingSupport,
        waterCollision: waterCollision,
        unsupportedRidingResult: unsupportedRidingResult,
        soundCalls: observer.soundCalls,
        explicitAnimationCalls: observer.explicitAnimationCalls,
        acceptedMovementAnimations: observer.acceptedMovementAnimations,
        inventory: observer.inventory,
        collections: observer.collections,
        removalCalls: observer.removalCalls,
        collisionResults: observer.collisionResults,
        world: worldGameplaySnapshot(game.world)
      };
    }

    function assertNoInteractionArtifacts(result, label) {
      assert(result.enterAdmission.prevented && result.enterAdmission.moving,
        label + ': movement into the descriptor cell was not admitted');
      assert(result.crossAdmission.prevented && result.crossAdmission.moving,
        label + ': movement across the descriptor cell was not admitted');
      assert(result.enteredDescriptorCell,
        label + ': Player did not enter the descriptor cell');
      assert(result.crossedDescriptorCell,
        label + ': Player did not cross the descriptor cell');
      assert(result.targetCollision === 'SAFE',
        label + ': descriptor cell acquired a collision or hazard');
      assert(result.obstacleCollision === 'COLLISION',
        label + ': underlying Road collision probe was not exercised');
      assert(result.foundSupportType === 'LOG' && result.ridingResult === 'SAFE',
        label + ': River support/carry probe was not exercised');
      assert(result.missingSupport === null &&
        result.waterCollision === 'WATER_HAZARD' &&
        result.unsupportedRidingResult === 'WATER_HAZARD',
        label + ': River hazard probe was not exercised');
      assert(result.soundCalls.length === 0,
        label + ': Poké Ball crossing produced a sound call');
      assert(result.explicitAnimationCalls.length === 0,
        label + ': Poké Ball crossing produced an extra animation trigger');
      assert(result.acceptedMovementAnimations.length === 2,
        label + ': established movement animation count changed');
      assert(result.inventory.length === 0,
        label + ': Poké Ball crossing changed inventory');
      assert(result.collections.length === 0,
        label + ': Poké Ball crossing produced collection');
      assert(result.removalCalls.length === 0,
        label + ': Poké Ball crossing produced removal-on-contact');
      assert(result.gameState.state === 'GAME_OVER',
        label + ': established collision did not produce the state transition');
    }

    // Feature: pokemon-reskin-and-pokeballs, Property 10: Poké Balls are gameplay-neutral cosmetic state
    // **Validates: Requirements 4.5, 5.1, 5.2, 5.3, 5.4, 8.8**
    var ELIGIBLE_TERRAINS = ['GRASS', 'ROAD', 'TRAIN_TRACK'];
    var PROPERTY_CASE_COUNT = 120;
    var terrainCoverage = { GRASS: 0, ROAD: 0, TRAIN_TRACK: 0 };
    var totalEntityComparisons = 0;
    var totalTrainComparisons = 0;

    for (var caseIndex = 0; caseIndex < PROPERTY_CASE_COUNT; caseIndex++) {
      var terrainType = ELIGIBLE_TERRAINS[caseIndex % ELIGIBLE_TERRAINS.length];
      var baseline = buildScenario(caseIndex, terrainType, false);
      var enabled = buildScenario(caseIndex, terrainType, true);
      var label = 'Property 10 case ' + caseIndex + ' (' + terrainType + ')';

      var baselineResult = executeGameplayTrace(baseline);
      var enabledResult = executeGameplayTrace(enabled);

      assertNoInteractionArtifacts(baselineResult, label + ' descriptor-free');
      assertNoInteractionArtifacts(enabledResult, label + ' descriptor-enabled');
      assertEqualJson(enabledResult, baselineResult,
        label + ': adding only the descriptor changed gameplay results');

      assert(baseline.accessGuard.gameplayReads === 0 &&
        enabled.accessGuard.gameplayReads === 0,
        label + ': a gameplay query read the cosmetic container');
      assert(baseline.targetContainer.pokeBall === null,
        label + ': descriptor-free control unexpectedly retained a descriptor');
      assert(enabled.targetContainer.pokeBall === enabled.targetDescriptor,
        label + ': descriptor identity changed while its owner row was retained');
      assert(enabled.targetRow.cosmetics === enabled.targetContainer &&
        enabled.targetRow.cosmetics.pokeBall === enabled.targetDescriptor,
        label + ': crossing removed or replaced the retained descriptor');
      assert(Object.isFrozen(enabled.targetDescriptor) &&
        Object.isFrozen(enabled.targetContainer),
        label + ': retained cosmetic state lost immutability');
      assert(Object.keys(enabled.targetDescriptor).sort().join(',') ===
        'blocking,id,schemaVersion,terrainType,type,variant,x,y',
        label + ': descriptor gained gameplay or collection state');

      terrainCoverage[terrainType]++;
      totalEntityComparisons += enabledResult.world.reduce(function (count, row) {
        return count + row.obstacles.length + row.platforms.length;
      }, 0);
      totalTrainComparisons += enabledResult.world.filter(function (row) {
        return row.type === 'TRAIN_TRACK';
      }).length;
    }

    ELIGIBLE_TERRAINS.forEach(function (terrainType) {
      assert(terrainCoverage[terrainType] >= 40,
        'Property 10 did not execute at least 40 traces on ' + terrainType);
    });

    return 'PASS: Feature: pokemon-reskin-and-pokeballs, Property 10: Poké Balls are gameplay-neutral cosmetic state; ' +
      PROPERTY_CASE_COUNT + ' deterministic paired traces (' +
      terrainCoverage.GRASS + ' GRASS, ' + terrainCoverage.ROAD + ' ROAD, ' +
      terrainCoverage.TRAIN_TRACK + ' TRAIN_TRACK), ' + totalEntityComparisons +
      ' entity/platform comparisons, and ' + totalTrainComparisons +
      ' Train-row lifecycle comparisons matched with zero gameplay cosmetic reads';
  `;

  var __context2d = {
    fillStyle: '', globalAlpha: 1, font: '', textAlign: '',
    clearRect: function () {}, fillRect: function () {}, fillText: function () {},
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    closePath: function () {}, fill: function () {},
    save: function () {}, restore: function () {}
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

  return eval('(function () {\n' + productionSource + '\n;\n' + assertions + '\n})()');
}
