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
    function __row(y, platforms, metadata) {
      return {
        y: y,
        type: 'RIVER',
        platforms: platforms || [],
        obstacles: [],
        metadata: metadata || {}
      };
    }
    function __platform(x, y, width, velocity, type, routeValue) {
      return {
        x: x,
        y: y,
        width: width,
        velocity: velocity,
        type: type,
        routeSelected: routeValue,
        initialCrossingRoute: routeValue
      };
    }
    function __game() {
      var game = new Game();
      game.world.terrainRows.clear();
      return game;
    }

    // Lily support is [x - 0.35, x + 1 + 0.35), even if a historical
    // fixture still carries an obsolete wider width.
    var supportWorld = new World();
    var legacyWideLily = __platform(2, 5, 4, 0, 'LILY_PAD', true);
    supportWorld.addTerrainRow(__row(5, [legacyWideLily], {
      routePlatformIndex: 0,
      routePlan: { anchorX: 2 }
    }));
    __assert(checkCollisions({ x: 1.65, y: 5 }, supportWorld) === 'SAFE',
      'Lily left tolerance boundary was not inclusive');
    __assert(checkCollisions({ x: 3.349999, y: 5 }, supportWorld) === 'SAFE',
      'Lily right tolerance interior was not supported');
    __assert(checkCollisions({ x: 3.35, y: 5 }, supportWorld) === 'WATER_HAZARD',
      'Lily right tolerance boundary must remain half-open');
    __assert(checkCollisions({ x: 4.5, y: 5 }, supportWorld) === 'WATER_HAZARD',
      'Obsolete multi-cell Lily width incorrectly expanded support');

    // Logs retain their stored logical width and the same edge tolerance.
    var logWorld = new World();
    logWorld.addTerrainRow(__row(6, [__platform(5, 6, 4, 0, 'LOG', false)]));
    __assert(checkCollisions({ x: 8.9, y: 6 }, logWorld) === 'SAFE',
      'Log support width was changed by Lily normalization');
    __assert(checkCollisions({ x: 9.35, y: 6 }, logWorld) === 'WATER_HAZARD',
      'Log right tolerance boundary must remain half-open');

    function __rideWithRouteMetadata(routeValue) {
      var game = __game();
      var lily = __platform(1, 7, 6, 0.005, 'LILY_PAD', routeValue);
      game.world.addTerrainRow(__row(7, [lily], {
        routeSelected: routeValue,
        initialCrossingRoute: routeValue,
        routePlan: routeValue ? { anchorX: 1 } : null
      }));
      game.player.x = 1.25;
      game.player.y = 7;
      var relativeBefore = game.player.x - lily.x;
      game.update(20);
      return {
        game: game,
        lily: lily,
        relativeBefore: relativeBefore,
        relativeAfter: game.player.x - lily.x
      };
    }

    var routedRide = __rideWithRouteMetadata(true);
    var unroutedRide = __rideWithRouteMetadata(false);
    [routedRide, unroutedRide].forEach(function (ride) {
      __close(ride.lily.x, 1.1, 'Lily displacement');
      __close(ride.game.player.x, 1.35,
        'Stationary Player did not receive the Lily displacement exactly once');
      __close(ride.relativeAfter, ride.relativeBefore,
        'Player-to-Lily relative offset changed during carry');
      __assert(ride.game.gameState.state === 'PLAYING',
        'Valid one-cell Lily rider was classified as water');
    });
    __close(routedRide.game.player.x, unroutedRide.game.player.x,
      'Carry outcome depended on route-selection metadata');

    var outsideGame = __game();
    outsideGame.world.addTerrainRow(__row(8, [
      __platform(1, 8, 5, 0.005, 'LILY_PAD', true)
    ], { routeSelected: true }));
    outsideGame.player.x = 2.5;
    outsideGame.player.y = 8;
    outsideGame.update(20);
    __assert(outsideGame.gameState.state === 'GAME_OVER',
      'Player outside the one-cell Lily support avoided WATER_HAZARD');

    var wrapGame = __game();
    var wrappingLily = __platform(19.9, 9, 1, 0.01, 'LILY_PAD', true);
    wrapGame.world.addTerrainRow(__row(9, [wrappingLily], {
      routeSelected: true,
      initialCrossingRoute: true
    }));
    wrapGame.player.x = 19.95;
    wrapGame.player.y = 9;
    wrapGame.update(20);
    __close(wrapGame.player.x, 19.95,
      'Wrapping Lily teleported the Player');
    __close(wrappingLily.x, -25,
      'Wrapping Lily did not use the existing wrap rule');
    __assert(wrapGame.gameState.state === 'GAME_OVER',
      'Wrapping Lily support did not become WATER_HAZARD');
  `;

  var __context2d = {
    fillStyle: '', globalAlpha: 1, font: '', textAlign: '',
    clearRect: function () {}, fillRect: function () {}, beginPath: function () {},
    moveTo: function () {}, lineTo: function () {}, closePath: function () {},
    fill: function () {}, fillText: function () {}, save: function () {},
    restore: function () {}, translate: function () {}, scale: function () {}
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
  return 'PASS: one-cell Lily support, Log preservation, single carry, wrap hazard, and route-metadata neutrality';
}
