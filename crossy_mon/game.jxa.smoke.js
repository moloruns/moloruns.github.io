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
    var __game = new Game();
    if (__game.player.x !== 0 || __game.player.y !== 0) {
      throw new Error('Player did not initialize at (0, 0)');
    }
    if (__game.player.isMoving || __game.player.animationProgress !== 0) {
      throw new Error('Player animation state is invalid at initialization');
    }
    var initialPosition = __game.player.getCurrentPosition();
    if (initialPosition.x !== 0 || initialPosition.y !== 0) {
      throw new Error('getCurrentPosition did not return the initial position');
    }
    if (__game.world.terrainRows.size !== 20) {
      throw new Error('Expected 20 initial terrain rows');
    }
    for (var safeY = -5; safeY <= 2; safeY++) {
      var safeRow = __game.world.terrainRows.get(safeY);
      if (!safeRow || safeRow.type !== 'GRASS') {
        throw new Error('Spawn/behind row ' + safeY + ' is not safe grass');
      }
    }
    var origin = __game.renderer.worldToIso(0, 0);
    var forward = __game.renderer.worldToIso(0, 1);
    if (forward.screenY >= origin.screenY) {
      throw new Error('Positive-Y forward movement is not displayed upward');
    }
    __game.render();
    if (__fills.indexOf('#7CFC00') === -1) {
      throw new Error('Terrain drawing call was not observed');
    }
    if (__fills.indexOf('#FFF9E8') === -1 ||
        __fills.indexOf('#FFC83D') === -1 ||
        __fills.indexOf('#EF5145') === -1 ||
        __fills.indexOf('#22282D') === -1) {
      throw new Error('Voxel chicken component drawing calls were not observed');
    }
    if (__fills.indexOf('rgba(24, 31, 28, 0.22)') === -1) {
      throw new Error('Projected contact shadow drawing call was not observed');
    }
    __game.inputSystem.handleKeyDown({ key: 'ArrowUp', preventDefault: function () {} });
    __game.update(__game.player.animationDuration);
    if (__game.player.y !== 1 || __game.gameState.score !== 1) {
      throw new Error('Up input, positive-Y progress, and scoring are not aligned');
    }
    if (!__game.world.terrainRows.has(16)) {
      throw new Error('Terrain was not maintained ahead of the current player row');
    }
    __game.start();
    var firstFrame = __frames.shift();
    if (typeof firstFrame !== 'function') {
      throw new Error('Game did not request an animation frame');
    }
    firstFrame(16);
  `;

  var __fills = [];
  var __frames = [];
  var __listeners = {};
  var __context2d = {
    fillStyle: '', globalAlpha: 1, font: '', textAlign: '',
    clearRect: function () {}, fillRect: function () {},
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    closePath: function () {}, fill: function () { __fills.push(this.fillStyle); },
    fillText: function () {},
    save: function () { this.__savedAlpha = this.globalAlpha; },
    restore: function () { this.globalAlpha = this.__savedAlpha; }
  };
  var __canvas = {
    width: 800,
    height: 600,
    getContext: function (type) {
      if (type !== '2d') {
        throw new Error('Unexpected canvas context ' + type);
      }
      return __context2d;
    }
  };
  var console = { log: function () {}, error: function () {} };
  var document = {
    getElementById: function (id) {
      return id === 'gameCanvas' ? __canvas : null;
    }
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
    addEventListener: function (type, callback) { __listeners[type] = callback; },
    removeEventListener: function (type, callback) {
      if (__listeners[type] === callback) {
        delete __listeners[type];
      }
    }
  };

  eval(productionSource + '\n' + assertions);
  return 'PASS: production scripts parsed and rendered terrain/player without runtime errors';
}
