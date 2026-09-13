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
    function seededRandom(seed) {
      var state = seed >>> 0;
      return function () {
        state += 0x6D2B79F5;
        var value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    }
    function assertContinuousRows(game, minimumY, maximumY) {
      for (var y = minimumY; y <= maximumY; y++) {
        assert(game.world.terrainRows.has(y), 'Missing retained terrain row ' + y);
      }
    }
    function assertSequenceCaps(game, minimumY, maximumY) {
      var hazardRun = 0;
      var riverRun = 0;
      var maxHazardRun = 0;
      var maxRiverRun = 0;
      var riverStartedAtBoundary = false;

      for (var y = minimumY; y <= maximumY; y++) {
        var type = game.world.terrainRows.get(y).type;
        if (type === 'RIVER') {
          if (riverRun === 0) riverStartedAtBoundary = y === minimumY;
          riverRun++;
          maxRiverRun = Math.max(maxRiverRun, riverRun);
        } else if (riverRun > 0) {
          if (!riverStartedAtBoundary) {
            assert(riverRun === 2 || riverRun === 3,
              'Completed retained river run had length ' + riverRun);
          }
          riverRun = 0;
          riverStartedAtBoundary = false;
        }

        hazardRun = type === 'GRASS' ? 0 : hazardRun + 1;
        maxHazardRun = Math.max(maxHazardRun, hazardRun);
      }

      assert(maxRiverRun <= 3, 'Retained river run exceeded three rows');
      assert(maxHazardRun <= 3, 'Retained mixed-hazard run exceeded three rows');
    }

    // Large-frame regression: one suspended-tab frame is at most one 100ms
    // gameplay step, so warning state is rendered before any train can spawn.
    // **Validates: Requirements 14.1, 14.2, 14.4**
    var gapGame = new Game({ random: function () { return 0; } });
    gapGame.world.terrainRows.clear();
    var track = generateTrainTrack(10, function () { return 0; });
    track.metadata.idleRemaining = 0;
    gapGame.world.addTerrainRow(track);
    var renderedStates = [];
    var productionRender = gapGame.render.bind(gapGame);
    gapGame.render = function () {
      renderedStates.push(track.metadata.trainState);
      productionRender();
    };
    gapGame.gameState.lastFrameTime = 0;
    var currentTime = 20000;
    gapGame.gameLoop(currentTime);
    assert(GAMEPLAY_CONFIG.maxFrameDelta === 100, 'Gameplay delta clamp changed');
    assert(track.metadata.trainState === 'WARNING',
      'Large frame gap skipped the train warning phase');
    assert(track.metadata.warningElapsed === GAMEPLAY_CONFIG.maxFrameDelta,
      'Large frame gap was not clamped before lifecycle update');
    assert(renderedStates[0] === 'WARNING', 'Warning was not present at the next render');

    for (var warningFrame = 0; warningFrame < 28; warningFrame++) {
      currentTime += 100;
      gapGame.gameLoop(currentTime);
    }
    assert(track.metadata.trainState === 'WARNING' && track.metadata.warningElapsed === 2900,
      'Warning did not remain visible for approximately three seconds of gameplay');
    currentTime += 100;
    gapGame.gameLoop(currentTime);
    assert(track.metadata.trainState === 'ACTIVE' && track.obstacles.length === 1,
      'Train did not activate after 3000ms of rendered gameplay');

    var activeTrain = track.obstacles[0];
    var trainStart = activeTrain.x;
    currentTime += 20000;
    gapGame.gameLoop(currentTime);
    assert(track.metadata.trainState === 'ACTIVE' && track.metadata.completedEvents === 0,
      'Large active-frame gap skipped the complete train pass');
    assert(Math.abs(activeTrain.x - trainStart) <=
      INITIAL_SPEED_RANGES.TRAIN.max * GAMEPLAY_CONFIG.maxFrameDelta + 0.0000001,
      'Train moved farther than one clamped gameplay step');

    // Long-progress regression: generation plus cleanup remains a continuous,
    // bounded 20-behind/15-ahead buffer without changing sequence caps.
    // **Validates: Requirements 10.1, 10.3, 10.4**
    var progressGame = new Game({ random: seededRandom(20250913) });
    var expectedRowCount = GAMEPLAY_CONFIG.rowsBehind + GAMEPLAY_CONFIG.rowsAhead + 1;
    for (var playerY = 0; playerY <= 1000; playerY++) {
      progressGame.player.y = playerY;
      progressGame.ensureTerrainAroundPlayer(playerY);
      progressGame.cleanupOldTerrain(playerY);
      assert(progressGame.world.terrainRows.size <= expectedRowCount,
        'Terrain row count grew without bound at Y=' + playerY);
      assertContinuousRows(
        progressGame,
        playerY - GAMEPLAY_CONFIG.rowsBehind,
        playerY + GAMEPLAY_CONFIG.rowsAhead
      );
    }

    var minimumY = 1000 - GAMEPLAY_CONFIG.rowsBehind;
    var maximumY = 1000 + GAMEPLAY_CONFIG.rowsAhead;
    assert(progressGame.world.terrainRows.size === expectedRowCount,
      'Final retained terrain row count was not exact');
    assert(Math.min.apply(null, Array.from(progressGame.world.terrainRows.keys())) === minimumY,
      'Cleanup removed too little or too much terrain behind the player');
    assert(Math.max.apply(null, Array.from(progressGame.world.terrainRows.keys())) === maximumY,
      'At least 15 rows ahead were not retained');
    assertSequenceCaps(progressGame, minimumY, maximumY);

    var nextContext = getTerrainSequenceContext(progressGame.world.terrainRows, maximumY + 1);
    assert(nextContext.previousTerrain !== null,
      'Cleanup removed sequence context needed for forward generation');

    for (var reverseY = 999; reverseY >= 0; reverseY--) {
      progressGame.player.y = reverseY;
      progressGame.ensureTerrainAroundPlayer(reverseY);
      progressGame.cleanupOldTerrain(reverseY);
      assert(progressGame.world.terrainRows.size === expectedRowCount,
        'Reverse traversal retained stale forward rows at Y=' + reverseY);
      assertContinuousRows(
        progressGame,
        reverseY - GAMEPLAY_CONFIG.rowsBehind,
        reverseY + GAMEPLAY_CONFIG.rowsAhead
      );
      assertSequenceCaps(
        progressGame,
        reverseY - GAMEPLAY_CONFIG.rowsBehind,
        reverseY + GAMEPLAY_CONFIG.rowsAhead
      );
    }
    assert(Math.min.apply(null, Array.from(progressGame.world.terrainRows.keys())) === -20 &&
      Math.max.apply(null, Array.from(progressGame.world.terrainRows.keys())) === 15,
      'Long reverse traversal did not preserve the exact bounded window');

    var integratedGame = new Game({ random: function () { return 0; } });
    integratedGame.player.y = 500;
    integratedGame.update(0);
    assert(integratedGame.world.terrainRows.size === expectedRowCount,
      'Game.update did not integrate bounded terrain cleanup');
    assertContinuousRows(integratedGame, 480, 515);
  `;

  var __context2d = {
    fillStyle: '', globalAlpha: 1, font: '', textAlign: '',
    clearRect: function () {}, fillRect: function () {}, beginPath: function () {},
    moveTo: function () {}, lineTo: function () {}, closePath: function () {},
    fill: function () {}, fillText: function () {},
    save: function () { this.__savedAlpha = this.globalAlpha; },
    restore: function () { this.globalAlpha = this.__savedAlpha; }
  };
  var __canvas = {
    width: 800,
    height: 600,
    getContext: function () { return __context2d; }
  };
  var __frames = [];
  var console = { log: function () {}, error: function () {} };
  var document = {
    getElementById: function (id) { return id === 'gameCanvas' ? __canvas : null; }
  };
  var performance = { now: function () { return 0; } };
  var requestAnimationFrame = function (callback) {
    __frames.push(callback);
    return __frames.length;
  };
  var window = {
    document: document,
    performance: performance,
    requestAnimationFrame: requestAnimationFrame,
    addEventListener: function () {},
    removeEventListener: function () {}
  };

  eval(productionSource + '\n' + assertions);
  return 'PASS: large-frame warning clamp and bounded long-progress terrain cleanup';
}
