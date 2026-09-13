ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) {
    throw new Error('Unable to read ' + filePath);
  }
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
    function __assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    function __close(actual, expected, message) {
      if (Math.abs(actual - expected) > 0.0000000001) {
        throw new Error(message + ': expected ' + expected + ', got ' + actual);
      }
    }
    function __event(key) {
      return {
        key: key,
        defaultPrevented: false,
        preventDefault: function () { this.defaultPrevented = true; }
      };
    }
    function __row(y, type, decorations, obstacles, platforms, metadata) {
      return {
        y: y,
        type: type,
        decorations: decorations || [],
        obstacles: obstacles || [],
        platforms: platforms || [],
        metadata: metadata || {}
      };
    }
    function __playerState(player) {
      return JSON.stringify({
        x: player.x,
        y: player.y,
        isMoving: player.isMoving,
        animationProgress: player.animationProgress,
        animationDuration: player.animationDuration,
        startPos: player.startPos,
        targetPos: player.targetPos,
        facing: player.facing
      });
    }
    function __worldState(world) {
      var rows = [];
      world.terrainRows.forEach(function (row, y) {
        rows.push({ y: y, row: row });
      });
      rows.sort(function (a, b) { return a.y - b.y; });
      return JSON.stringify(rows);
    }
    function __installMoveSpy(player) {
      var originalMove = player.move.bind(player);
      var spy = { calls: 0 };
      player.move = function (dx, dy) {
        spy.calls++;
        return originalMove(dx, dy);
      };
      return spy;
    }

    __assert(PLAYER_MOVEMENT_BOUNDS.minX === -15 && PLAYER_MOVEMENT_BOUNDS.maxX === 15,
      'Fixed Player movement bounds changed');
    __assert(isWithinPlayerHorizontalBounds(-15) && isWithinPlayerHorizontalBounds(15),
      'Inclusive Player boundary cells were rejected');
    __assert(!isWithinPlayerHorizontalBounds(-15.000001) &&
      !isWithinPlayerHorizontalBounds(15.000001) &&
      !isWithinPlayerHorizontalBounds(NaN) &&
      !isWithinPlayerHorizontalBounds(Infinity),
      'Out-of-span or nonfinite Player destinations were admitted');

    // Feature: score-scaled-movement-and-side-occlusion, Property 16: Outward boundary input is rejected without state mutation
    // **Validates: Requirements 5.9, 5.14, 5.15, 5.16, 7.16**
    var boundaryCaseCount = 128;
    var leftKeys = ['ArrowLeft', 'a', 'A'];
    var rightKeys = ['ArrowRight', 'd', 'D'];
    for (var boundaryIndex = 0; boundaryIndex < boundaryCaseCount; boundaryIndex++) {
      var atLeftBoundary = boundaryIndex % 2 === 0;
      var shouldersEnabled = Math.floor(boundaryIndex / 2) % 2 === 0;
      var boundaryX = atLeftBoundary ? -15 : 15;
      var boundaryY = (boundaryIndex % 19) - 9;
      var boundaryKeySet = atLeftBoundary ? leftKeys : rightKeys;
      var boundaryKey = boundaryKeySet[boundaryIndex % boundaryKeySet.length];
      var boundaryPlayer = new Player(boundaryX, boundaryY);
      boundaryPlayer.facing = boundaryIndex % 3 === 0
        ? { dx: 0, dy: -1 }
        : { dx: atLeftBoundary ? 1 : -1, dy: 0 };
      var boundaryGameState = {
        state: 'PLAYING',
        score: boundaryIndex * 7,
        maxYReached: boundaryIndex * 3,
        lastFrameTime: boundaryIndex + 0.25
      };
      var boundaryWorld = new World();
      boundaryWorld.addTerrainRow(__row(
        boundaryY,
        boundaryIndex % 4 === 0 ? 'ROAD' : 'GRASS',
        [{
          id: 'sentinel:' + boundaryIndex,
          type: boundaryIndex % 3 === 0 ? 'TREE' : 'ROCK',
          x: 0,
          y: boundaryY,
          blocking: false,
          shoulderMode: shouldersEnabled ? 'ENABLED_IN_RENDER_HARNESS' : 'OMITTED_IN_RENDER_HARNESS'
        }],
        [],
        [],
        { sentinel: boundaryIndex }
      ));
      var admissionCallsForBoundary = 0;
      var boundaryInput = new Input(boundaryPlayer, boundaryGameState, {
        canEnter: function () {
          admissionCallsForBoundary++;
          return true;
        }
      });
      var boundaryMoveSpy = __installMoveSpy(boundaryPlayer);
      var boundaryPlayerBefore = __playerState(boundaryPlayer);
      var boundaryGameStateBefore = JSON.stringify(boundaryGameState);
      var boundaryWorldBefore = __worldState(boundaryWorld);
      var boundaryEvent = __event(boundaryKey);

      // Shoulder rendering is either present or callback-omitted in the harness;
      // neither mode is passed into Input or stored as logical World state.
      var shoulderRenderCalls = 0;
      var shoulderRenderCallback = shouldersEnabled
        ? function () { shoulderRenderCalls++; }
        : null;
      if (shoulderRenderCallback) shoulderRenderCallback();

      boundaryInput.handleKeyDown(boundaryEvent);

      __assert(boundaryEvent.defaultPrevented,
        'Recognized outward boundary command did not prevent browser behavior in case ' + boundaryIndex);
      __assert(admissionCallsForBoundary === 0,
        'Boundary rejection called logical canEnter in case ' + boundaryIndex);
      __assert(boundaryMoveSpy.calls === 0,
        'Boundary rejection called Player.move in case ' + boundaryIndex);
      __assert(__playerState(boundaryPlayer) === boundaryPlayerBefore,
        'Boundary rejection mutated Player Movement State in case ' + boundaryIndex);
      __assert(JSON.stringify(boundaryGameState) === boundaryGameStateBefore,
        'Boundary rejection mutated Score or Game State in case ' + boundaryIndex);
      __assert(__worldState(boundaryWorld) === boundaryWorldBefore,
        'Boundary rejection mutated World state in case ' + boundaryIndex);
      __assert(boundaryPlayer.x === boundaryX,
        'Boundary rejection clamped or teleported Player in case ' + boundaryIndex);
      __assert(shoulderRenderCalls === (shouldersEnabled ? 1 : 0),
        'Shoulder-mode harness did not execute deterministically in case ' + boundaryIndex);
      __assert(!Object.prototype.hasOwnProperty.call(boundaryWorld, 'sideShoulders'),
        'Render-only shoulder mode leaked into World state in case ' + boundaryIndex);
    }

    // Exact adjacent destinations remain eligible: -14 -> -15 and 14 -> 15.
    var adjacentCases = [
      { x: -14, key: 'ArrowLeft', targetX: -15 },
      { x: 14, key: 'ArrowRight', targetX: 15 }
    ];
    adjacentCases.forEach(function (testCase) {
      var adjacentPlayer = new Player(testCase.x, 4);
      var adjacentCalls = 0;
      var adjacentInput = new Input(adjacentPlayer, { state: 'PLAYING', score: 0 }, {
        canEnter: function (x, y) {
          adjacentCalls++;
          return x === testCase.targetX && y === 4;
        }
      });
      adjacentInput.handleKeyDown(__event(testCase.key));
      __assert(adjacentCalls === 1 && adjacentPlayer.isMoving &&
        adjacentPlayer.targetPos.x === testCase.targetX,
        'Adjacent in-span destination was not admitted at x=' + testCase.x);
    });

    // Boundary-legal destinations still delegate to logical blocking exactly once.
    var blockedBoundaryCases = [
      { x: -15, key: 'ArrowRight' },
      { x: -15, key: 'ArrowUp' },
      { x: 15, key: 'ArrowLeft' },
      { x: 15, key: 'ArrowDown' }
    ];
    blockedBoundaryCases.forEach(function (testCase) {
      var blockedBoundaryPlayer = new Player(testCase.x, 8);
      var blockedBoundaryBefore = __playerState(blockedBoundaryPlayer);
      var blockedBoundaryCalls = 0;
      var blockedBoundaryInput = new Input(
        blockedBoundaryPlayer,
        { state: 'PLAYING', score: 11 },
        { canEnter: function () { blockedBoundaryCalls++; return false; } }
      );
      var blockedBoundarySpy = __installMoveSpy(blockedBoundaryPlayer);
      blockedBoundaryInput.handleKeyDown(__event(testCase.key));
      __assert(blockedBoundaryCalls === 1 && blockedBoundarySpy.calls === 0,
        'In-span blocked destination bypassed or repeated logical admission');
      __assert(__playerState(blockedBoundaryPlayer) === blockedBoundaryBefore,
        'Logical rejection mutated Player state at a horizontal boundary');
    });

    // Feature: score-scaled-movement-and-side-occlusion, Property 14: Accepted in-span movement preserves the one-cell 150ms animation
    // **Validates: Requirements 5.17, 6.5, 7.17**
    var acceptedBoundaryCases = [
      { x: -15, y: 0, key: 'ArrowRight', targetX: -14, targetY: 0 },
      { x: -15, y: 0, key: 'ArrowUp', targetX: -15, targetY: 1 },
      { x: -15, y: 0, key: 'ArrowDown', targetX: -15, targetY: -1 },
      { x: 15, y: 0, key: 'ArrowLeft', targetX: 14, targetY: 0 },
      { x: 15, y: 0, key: 'ArrowUp', targetX: 15, targetY: 1 },
      { x: 15, y: 0, key: 'ArrowDown', targetX: 15, targetY: -1 }
    ];
    for (var shoulderMode = 0; shoulderMode < 2; shoulderMode++) {
      acceptedBoundaryCases.forEach(function (testCase, acceptedIndex) {
        var acceptedPlayer = new Player(testCase.x, testCase.y);
        var acceptedWorld = new World();
        acceptedWorld.addTerrainRow(__row(testCase.y, 'GRASS'));
        acceptedWorld.addTerrainRow(__row(testCase.targetY, 'GRASS'));
        var acceptedGameState = {
          state: 'PLAYING', score: 23 + acceptedIndex, maxYReached: 9
        };
        var acceptedAdmissionCalls = 0;
        var acceptedInput = new Input(acceptedPlayer, acceptedGameState, {
          canEnter: function (x, y) {
            acceptedAdmissionCalls++;
            return x === testCase.targetX && y === testCase.targetY;
          }
        });
        var acceptedWorldBefore = __worldState(acceptedWorld);
        var acceptedStateBefore = JSON.stringify(acceptedGameState);
        var acceptedShoulderCallback = shoulderMode === 1 ? function () {} : null;
        if (acceptedShoulderCallback) acceptedShoulderCallback();

        acceptedInput.handleKeyDown(__event(testCase.key));
        __assert(acceptedAdmissionCalls === 1 && acceptedPlayer.isMoving,
          'Accepted boundary move did not start in shoulder mode ' + shoulderMode);
        __assert(acceptedPlayer.animationDuration === 150,
          'Accepted boundary move changed the 150ms duration');
        __assert(acceptedPlayer.targetPos.x === testCase.targetX &&
          acceptedPlayer.targetPos.y === testCase.targetY,
          'Accepted boundary move changed its one-cell destination');
        __assert(Math.abs(acceptedPlayer.targetPos.x - testCase.x) +
          Math.abs(acceptedPlayer.targetPos.y - testCase.y) === 1,
          'Accepted boundary move was not exactly one cell');

        acceptedPlayer.update(149);
        __assert(acceptedPlayer.isMoving && acceptedPlayer.x === testCase.x &&
          acceptedPlayer.y === testCase.y,
          'Accepted move completed before 150ms');
        acceptedPlayer.update(1);
        __assert(!acceptedPlayer.isMoving && acceptedPlayer.x === testCase.targetX &&
          acceptedPlayer.y === testCase.targetY,
          'Accepted move did not complete exactly at 150ms');
        __assert(__worldState(acceptedWorld) === acceptedWorldBefore &&
          JSON.stringify(acceptedGameState) === acceptedStateBefore,
          'Accepted Player animation unexpectedly mutated World or Score');
      });
    }

    // Legacy Input construction remains permissive for recognized in-span movement.
    var legacyState = { state: 'PLAYING', score: 0, maxYReached: 0 };
    var legacyPlayer = new Player(0, 0);
    var legacyInput = new Input(legacyPlayer, legacyState);
    legacyInput.handleKeyDown(__event('ArrowRight'));
    __assert(legacyPlayer.isMoving && legacyPlayer.targetPos.x === 1 && legacyPlayer.targetPos.y === 0,
      'Legacy Input construction no longer admits recognized in-span movement');

    // Game supplies World-backed destination admission. A blocked move must not
    // mutate Player state, score, max progress, or Game_State.
    var blockedGame = new Game();
    blockedGame.world.terrainRows.clear();
    blockedGame.world.addTerrainRow(__row(0, 'GRASS'));
    blockedGame.world.addTerrainRow(__row(1, 'GRASS', [
      { id: 'tree:0:1', type: 'TREE', x: 0, y: 1, blocking: true, variant: 0, paletteIndex: 0 }
    ]));
    var blockedPlayerBefore = __playerState(blockedGame.player);
    var blockedStateBefore = JSON.stringify(blockedGame.gameState);
    var blockedEvent = __event('ArrowUp');
    blockedGame.inputSystem.handleKeyDown(blockedEvent);
    __assert(blockedEvent.defaultPrevented, 'Recognized blocked input did not prevent browser behavior');
    __assert(__playerState(blockedGame.player) === blockedPlayerBefore,
      'Blocked destination mutated Player position or animation state');
    __assert(JSON.stringify(blockedGame.gameState) === blockedStateBefore,
      'Blocked destination mutated score or Game_State');

    // Admission is not consulted when animation or game-over blocking applies.
    var admissionCalls = 0;
    var guardedPlayer = new Player(0, 0);
    var guardedState = { state: 'PLAYING', score: 0, maxYReached: 0 };
    var guardedInput = new Input(guardedPlayer, guardedState, {
      canEnter: function () { admissionCalls++; return true; }
    });
    guardedPlayer.isMoving = true;
    guardedInput.handleKeyDown(__event('w'));
    guardedPlayer.isMoving = false;
    guardedState.state = 'GAME_OVER';
    guardedInput.handleKeyDown(__event('ArrowLeft'));
    __assert(admissionCalls === 0, 'Animation/game-over blocking order changed');

    // Fractional X from Platform carrying is passed through unchanged in-span.
    var fractionalGame = new Game();
    fractionalGame.world.terrainRows.clear();
    fractionalGame.player.x = 1.25;
    fractionalGame.player.y = 5;
    fractionalGame.player.startPos = { x: 1.25, y: 5 };
    fractionalGame.player.targetPos = { x: 1.25, y: 5 };
    fractionalGame.world.addTerrainRow(__row(5, 'GRASS'));
    fractionalGame.world.addTerrainRow(__row(6, 'GRASS', [
      { id: 'rock:1:6', type: 'ROCK', x: 1, y: 6, blocking: true, variant: 0, paletteIndex: 0 }
    ]));
    fractionalGame.inputSystem.handleKeyDown(__event('W'));
    __assert(!fractionalGame.player.isMoving && fractionalGame.player.x === 1.25,
      'Fractional destination inside a blocker was admitted');

    fractionalGame.world.addTerrainRow(__row(6, 'GRASS', [
      { id: 'rock:2:6', type: 'ROCK', x: 2, y: 6, blocking: true, variant: 0, paletteIndex: 0 }
    ]));
    fractionalGame.inputSystem.handleKeyDown(__event('W'));
    __assert(fractionalGame.player.isMoving && fractionalGame.player.targetPos.x === 1.25 &&
      fractionalGame.player.targetPos.y === 6,
      'Fractional destination outside the blocker was rejected or rounded');

    // Admitted moves still resolve lethal hazards through the existing game loop.
    var hazardGame = new Game();
    hazardGame.world.terrainRows.clear();
    hazardGame.player.x = 1.25;
    hazardGame.player.y = 5;
    hazardGame.player.startPos = { x: 1.25, y: 5 };
    hazardGame.player.targetPos = { x: 1.25, y: 5 };
    hazardGame.world.addTerrainRow(__row(5, 'GRASS'));
    hazardGame.world.addTerrainRow(__row(6, 'ROAD', [], [
      { type: 'CAR', x: 1, y: 6, width: 2, velocity: 0 }
    ]));
    hazardGame.inputSystem.handleKeyDown(__event('ArrowUp'));
    hazardGame.update(hazardGame.player.animationDuration);
    __assert(hazardGame.player.y === 6, 'Admitted hazard move did not complete');
    __assert(hazardGame.gameState.state === 'GAME_OVER',
      'Destination admission suppressed existing lethal hazard resolution');

    // The fixed boundary applies only to Player-issued destinations. Cars,
    // Logs, and Lily Pads continue through both Side Corridors and wrap normally.
    var movingGame = new Game();
    movingGame.world.terrainRows.clear();
    movingGame.player.x = -15;
    movingGame.player.y = 0;
    movingGame.player.startPos = { x: -15, y: 0 };
    movingGame.player.targetPos = { x: -15, y: 0 };
    movingGame.inputSystem.handleKeyDown(__event('ArrowLeft'));
    __assert(!movingGame.player.isMoving && movingGame.player.x === -15,
      'Moving-entity regression setup did not activate fixed Player boundary');

    var leftCar = { type: 'CAR', x: -14.9, y: 10, width: 2, velocity: -0.01 };
    var rightCar = { type: 'CAR', x: 15.9, y: 11, width: 2, velocity: 0.01 };
    var leftLog = { type: 'LOG', x: -14.9, y: 12, width: 3, velocity: -0.01 };
    var rightLog = { type: 'LOG', x: 15.9, y: 13, width: 3, velocity: 0.01 };
    var leftLily = { type: 'LILY_PAD', x: -14.9, y: 14, width: 1, velocity: -0.01 };
    var rightLily = { type: 'LILY_PAD', x: 15.9, y: 15, width: 1, velocity: 0.01 };
    movingGame.world.addTerrainRow(__row(10, 'ROAD', [], [leftCar], [],
      { direction: -1, lockedRowSpeed: 0.01 }));
    movingGame.world.addTerrainRow(__row(11, 'ROAD', [], [rightCar], [],
      { direction: 1, lockedRowSpeed: 0.01 }));
    movingGame.world.addTerrainRow(__row(12, 'RIVER', [], [], [leftLog],
      { direction: -1, lockedRowSpeed: 0.01 }));
    movingGame.world.addTerrainRow(__row(13, 'RIVER', [], [], [rightLog],
      { direction: 1, lockedRowSpeed: 0.01 }));
    movingGame.world.addTerrainRow(__row(14, 'RIVER', [], [], [leftLily],
      { direction: -1, lockedRowSpeed: 0.01 }));
    movingGame.world.addTerrainRow(__row(15, 'RIVER', [], [], [rightLily],
      { direction: 1, lockedRowSpeed: 0.01 }));
    movingGame.updateMovingEntities(20);
    __close(leftCar.x, -15.1, 'Car did not enter left Side Corridor');
    __close(rightCar.x, 16.1, 'Car did not enter right Side Corridor');
    __close(leftLog.x, -15.1, 'Log did not enter left Side Corridor');
    __close(rightLog.x, 16.1, 'Log did not enter right Side Corridor');
    __close(leftLily.x, -15.1, 'Lily Pad did not enter left Side Corridor');
    __close(rightLily.x, 16.1, 'Lily Pad did not enter right Side Corridor');

    ['CAR', 'LOG', 'LILY_PAD'].forEach(function (entityType) {
      var positiveWrap = calculateEntityMovement(
        { type: entityType, x: 19.9, width: 1, velocity: 0.01 }, 20
      );
      var negativeWrap = calculateEntityMovement(
        { type: entityType, x: -19.9, width: 1, velocity: -0.01 }, 20
      );
      __assert(positiveWrap.wrapped && positiveWrap.x === -25,
        entityType + ' positive wrap changed while Player boundary was active');
      __assert(negativeWrap.wrapped && negativeWrap.x === 25,
        entityType + ' negative wrap changed while Player boundary was active');
    });

    // Logical Car/Train collision and River support classifications are unchanged.
    var collisionWorld = new World();
    collisionWorld.addTerrainRow(__row(30, 'ROAD', [], [
      { type: 'CAR', x: -15, y: 30, width: 1, velocity: 0 }
    ]));
    collisionWorld.addTerrainRow(__row(31, 'TRAIN_TRACK', [], [
      { type: 'TRAIN', x: 15, y: 31, width: 7, velocity: 0 }
    ]));
    collisionWorld.addTerrainRow(__row(32, 'RIVER', [], [], [
      { type: 'LILY_PAD', x: -15.2, y: 32, width: 1, velocity: 0 }
    ]));
    __assert(checkCollisions({ x: -15, y: 30 }, collisionWorld) === 'COLLISION',
      'Car collision changed under fixed Player boundary');
    __assert(checkCollisions({ x: 15, y: 31 }, collisionWorld) === 'COLLISION',
      'Train collision changed under fixed Player boundary');
    __assert(checkCollisions({ x: -15, y: 32 }, collisionWorld) === 'SAFE' &&
      checkCollisions({ x: 0, y: 32 }, collisionWorld) === 'WATER_HAZARD',
      'Lily support or unsupported-water classification changed');

    // Platform carry remains independent and may carry a stationary Player into
    // a Side Corridor; Input does not clamp or teleport that logical motion.
    var carryWorld = new World();
    var carryingLily = {
      type: 'LILY_PAD', x: -15.2, y: 40, width: 1, velocity: -0.005
    };
    carryWorld.addTerrainRow(__row(40, 'RIVER', [], [], [carryingLily]));
    var carriedPlayer = new Player(-15, 40);
    var carryResult = updatePlatformRiding(carriedPlayer, carryWorld, 20);
    carryingLily.x = calculateEntityMovement(carryingLily, 20).x;
    __assert(carryResult === 'SAFE', 'Lily carry changed under fixed Player boundary');
    __close(carriedPlayer.x, -15.1, 'Player carry was clamped at left boundary');
    __close(carriedPlayer.x - carryingLily.x, 0.2,
      'Lily carry did not preserve Player relative offset');

    var carryingLog = { type: 'LOG', x: 14.5, y: 41, width: 3, velocity: 0.005 };
    carryWorld.addTerrainRow(__row(41, 'RIVER', [], [], [carryingLog]));
    var logCarriedPlayer = new Player(15, 41);
    var logCarryResult = updatePlatformRiding(logCarriedPlayer, carryWorld, 20);
    carryingLog.x = calculateEntityMovement(carryingLog, 20).x;
    __assert(logCarryResult === 'SAFE', 'Log carry changed under fixed Player boundary');
    __close(logCarriedPlayer.x, 15.1, 'Player carry was clamped at right boundary');
    __close(logCarriedPlayer.x - carryingLog.x, 0.5,
      'Log carry did not preserve Player relative offset');

    // Trains still complete active events at either configured world edge.
    function __activeTrack(y, train) {
      var track = generateTrainTrack(y, function () { return 0; });
      track.metadata.trainState = 'ACTIVE';
      track.metadata.warningElapsed = TRAIN_TRACK_CONFIG.warningDuration;
      track.metadata.warningLightOn = false;
      track.obstacles = [train];
      return track;
    }
    var rightTrack = __activeTrack(50, {
      type: 'TRAIN', x: TRAIN_TRACK_CONFIG.worldEdge - 0.1, y: 50,
      width: 7, velocity: 0.01
    });
    var rightCompletedBefore = rightTrack.metadata.completedEvents;
    updateTrainTrackLifecycle(rightTrack, 20, function () { return 0; });
    __assert(rightTrack.metadata.trainState === 'IDLE' && rightTrack.obstacles.length === 0 &&
      rightTrack.metadata.completedEvents === rightCompletedBefore + 1,
      'Right-moving Train event did not complete at world edge');

    var leftTrack = __activeTrack(51, {
      type: 'TRAIN', x: -TRAIN_TRACK_CONFIG.worldEdge - 7 + 0.1, y: 51,
      width: 7, velocity: -0.01
    });
    var leftCompletedBefore = leftTrack.metadata.completedEvents;
    updateTrainTrackLifecycle(leftTrack, 20, function () { return 0; });
    __assert(leftTrack.metadata.trainState === 'IDLE' && leftTrack.obstacles.length === 0 &&
      leftTrack.metadata.completedEvents === leftCompletedBefore + 1,
      'Left-moving Train event did not complete at world edge');
  `;

  var __context2d = {
    fillStyle: '', font: '', textAlign: '', globalAlpha: 1,
    clearRect: function () {}, fillRect: function () {}, beginPath: function () {},
    moveTo: function () {}, lineTo: function () {}, closePath: function () {},
    fill: function () {}, fillText: function () {}, save: function () {}, restore: function () {}
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

  eval(productionSource + '\n' + assertions);
  return 'PASS: 128 fixed-boundary cases, 150ms accepted moves, immutable rejection, shoulder isolation, and moving-entity regressions';
}
