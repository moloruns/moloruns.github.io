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
    function __row(y, type, platforms, obstacles) {
      return { y: y, type: type, platforms: platforms || [], obstacles: obstacles || [], metadata: {} };
    }
    function __platform(x, y, width, velocity, type) {
      return { x: x, y: y, width: width, velocity: velocity, type: type || 'LOG' };
    }
    function __game() {
      var game = new Game();
      game.world.terrainRows.clear();
      return game;
    }

    var __carSpeeds = {};
    var __riverSpeeds = {};
    var __trainSpeeds = {};
    for (var speedIndex = 0; speedIndex < 300; speedIndex++) {
      var road = generateRoad(speedIndex);
      var river = generateRiver(speedIndex);
      var track = generateTrainTrack(speedIndex);
      updateTrainTrackLifecycle(
        track,
        track.metadata.idleRemaining + TRAIN_TRACK_CONFIG.warningDuration,
        Math.random
      );
      __assert(road.metadata.speed >= 0.0064 && road.metadata.speed <= 0.0144,
        'Car speed outside 20%-slower production range');
      __assert(river.metadata.speed >= 0.0049 && river.metadata.speed <= 0.0105,
        'River speed outside 30%-slower production range');
      __carSpeeds[road.metadata.speed.toFixed(6)] = true;
      __riverSpeeds[river.metadata.speed.toFixed(6)] = true;
      if (track.obstacles.length) {
        var trainSpeed = Math.abs(track.obstacles[0].velocity);
        __assert(trainSpeed >= 0.0255 && trainSpeed <= 0.0425,
          'Train speed outside 15%-slower production range');
        __trainSpeeds[trainSpeed.toFixed(6)] = true;
      }
    }
    __assert(Object.keys(__carSpeeds).length > 1, 'Car lane variation was lost');
    __assert(Object.keys(__riverSpeeds).length > 1, 'River lane variation was lost');
    __assert(Object.keys(__trainSpeeds).length > 1, 'Train lane variation was lost');

    for (var riverIndex = 0; riverIndex < 25; riverIndex++) {
      var generatedRiver = generateRiver(riverIndex);
      __assert(generatedRiver.platforms.length === 5, 'River crossing slot count changed');
      var sorted = generatedRiver.platforms.slice().sort(function (a, b) { return a.x - b.x; });
      for (var slotIndex = 0; slotIndex < sorted.length; slotIndex++) {
        var expectedSlot = -12 + slotIndex * 6;
        __assert(Math.abs(sorted[slotIndex].x - expectedSlot) <= 0.21,
          'River platform is not aligned to its crossing slot');
        if (slotIndex > 0) {
          var gap = sorted[slotIndex].x - (sorted[slotIndex - 1].x + sorted[slotIndex - 1].width);
          __assert(gap > 1.5, 'Generated river no longer has genuine water gaps');
        }
      }
    }

    var rideGame = __game();
    var rideLog = __platform(1, 5, 3, 0.005);
    rideGame.world.addTerrainRow(__row(5, 'RIVER', [rideLog]));
    rideGame.player.x = 1.25;
    rideGame.player.y = 5;
    rideGame.update(20);
    __close(rideLog.x, 1.1, 'Platform displacement');
    __close(rideGame.player.x, 1.35, 'Stationary player was not carried exactly once');
    __assert(rideGame.gameState.state === 'PLAYING', 'Platform rider died unexpectedly');

    var jumpGame = __game();
    var jumpLog = __platform(1, 5, 3, 0.005);
    jumpGame.world.addTerrainRow(__row(5, 'RIVER', [jumpLog]));
    jumpGame.world.addTerrainRow(__row(6, 'GRASS'));
    jumpGame.player.x = 1.25;
    jumpGame.player.y = 5;
    jumpGame.player.move(0, 1);
    jumpGame.update(jumpGame.player.animationDuration);
    __close(jumpGame.player.x, 1.25, 'Jump incorrectly inherited platform velocity');
    __assert(jumpGame.player.y === 6, 'Jump did not reach adjacent bank');
    __assert(jumpGame.gameState.state === 'PLAYING', 'Safe-bank exit died');

    var fractionalGame = __game();
    fractionalGame.world.addTerrainRow(__row(5, 'GRASS'));
    fractionalGame.world.addTerrainRow(__row(6, 'RIVER', [__platform(1.5, 6, 3, 0)]));
    fractionalGame.player.x = 1.2;
    fractionalGame.player.y = 5;
    fractionalGame.player.move(0, 1);
    fractionalGame.update(fractionalGame.player.animationDuration);
    __assert(fractionalGame.player.y === 6, 'Fractional grid jump did not complete');
    __assert(fractionalGame.gameState.state === 'PLAYING', 'Fractional edge landing died');

    var waterGame = __game();
    waterGame.world.addTerrainRow(__row(5, 'RIVER', [__platform(5, 5, 3, 0)]));
    waterGame.player.x = 0;
    waterGame.player.y = 5;
    waterGame.update(16);
    __assert(waterGame.gameState.state === 'GAME_OVER', 'Genuine water gap was made safe');

    var wrapGame = __game();
    var wrappingLog = __platform(19.9, 5, 3, 0.01);
    wrapGame.world.addTerrainRow(__row(5, 'RIVER', [wrappingLog]));
    wrapGame.player.x = 19.95;
    wrapGame.player.y = 5;
    wrapGame.update(20);
    __close(wrapGame.player.x, 19.95, 'Platform wrap teleported the player');
    __close(wrappingLog.x, -25, 'Platform did not wrap normally');
    __assert(wrapGame.gameState.state === 'GAME_OVER', 'Wrap-left-behind rider should hit water');
  `;

  var __context2d = {
    fillStyle: '', font: '', textAlign: '',
    clearRect: function () {}, fillRect: function () {}, beginPath: function () {},
    moveTo: function () {}, lineTo: function () {}, closePath: function () {},
    fill: function () {}, fillText: function () {}
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
  return 'PASS: tuned speeds, platform riding, jump exits, fractional landings, water hazards, and wrap handling';
}
