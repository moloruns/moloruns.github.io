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
  const indexSource = readUtf8(root + '/index.html');
  var previousIndex = -1;
  scripts.forEach(function (script) {
    var tag = '<script src="' + script + '"></script>';
    var position = indexSource.indexOf(tag);
    if (position === -1) throw new Error('Missing local production script ' + script);
    if (position <= previousIndex) throw new Error('Incorrect production script order at ' + script);
    previousIndex = position;
  });
  if (indexSource.indexOf('http://') !== -1 || indexSource.indexOf('https://') !== -1) {
    throw new Error('index.html introduced a remote production dependency');
  }

  const source = scripts.map(function (script) {
    return readUtf8(root + '/' + script);
  }).join('\n;\n');

  const assertions = `
    function assert(condition, message) { if (!condition) throw new Error(message); }

    var renderer = new Renderer(__canvas);
    renderer.drawVoxelBlock(0, 0, 1, 1, 0.5,
      { top: '#TOP', left: '#LEFT', right: '#RIGHT' });
    assert(__fills.indexOf('#LEFT') !== -1 && __fills.indexOf('#RIGHT') !== -1 &&
      __fills.indexOf('#TOP') !== -1, 'Distinct voxel faces were not drawn');

    var slabStart = __fills.length;
    renderer.drawTerrainSlab('ROAD', -15, 3, 31);
    assert(__fills.length - slabStart === 3, 'Terrain lane was not one continuous prism');
    assert(__fills.indexOf('#404040') !== -1, 'Road top was not drawn');

    renderer.centerCameraOnPlayer(4.25, 8.5);
    var followed = renderer.worldToIso(4.25, 8.5);
    var anchored = renderer.screenToCanvas(followed.screenX, followed.screenY);
    assert(anchored.x === 400 && anchored.y === 372,
      'Camera did not horizontally follow with ahead-biased vertical anchor');
    assert(renderer.worldToIso(0, 1).screenY < renderer.worldToIso(0, 0).screenY,
      'Positive-Y forward no longer appears upward');

    var player = new Player(2.5, 4);
    player.move(0, 1);
    player.update(75);
    assert(player.x === 2.5 && player.y === 4,
      'Hop changed logical position before animation completion');
    assert(player.getHopHeight() > 0, 'Hop height did not rise during animation');
    renderer.drawGroundShadow(2.5, 4, 0.84, 0.5);
    renderer.drawVoxelChicken(2.5, 4.5, player.getVisualState());
    ['rgba(24, 31, 28, 0.22)', '#FFF9E8', '#FFC83D', '#EF5145', '#22282D']
      .forEach(function (color) {
        assert(__fills.indexOf(color) !== -1, 'Missing Stage 1 color ' + color);
      });
    player.update(75);
    assert(player.y === 5 && player.getHopHeight() === 0,
      'Established movement completion timing changed');

    __fills.length = 0;
    var game = new Game({ random: function () { return 0; } });
    game.render();
    assert(__fills.indexOf('#7CFC00') !== -1, 'Production frame did not draw terrain');
    assert(__fills.indexOf('#FFF9E8') !== -1, 'Production frame did not draw chicken');
    assert(__fills.indexOf('rgba(24, 31, 28, 0.22)') !== -1,
      'Production frame did not draw contact shadow');
    assert(__fills.indexOf('#4169E1') === -1, 'Legacy blue player diamond is still rendered');
    assert(__polygons.length > 0, 'Production frame emitted no Canvas paths');

    game.start();
    var frame = __frames.shift();
    assert(typeof frame === 'function', 'Production game did not request an animation frame');
    frame(16);
  `;

  var __fills = [];
  var __polygons = [];
  var __current = [];
  var __frames = [];
  var __context2d = {
    fillStyle: '', globalAlpha: 1, font: '', textAlign: '',
    clearRect: function () {}, fillRect: function () {}, fillText: function () {},
    beginPath: function () { __current = []; },
    moveTo: function (x, y) { __current.push({ x: x, y: y }); },
    lineTo: function (x, y) { __current.push({ x: x, y: y }); },
    closePath: function () {},
    fill: function () { __fills.push(this.fillStyle); __polygons.push(__current.slice()); },
    save: function () { this.__savedAlpha = this.globalAlpha; },
    restore: function () { this.globalAlpha = this.__savedAlpha; }
  };
  var __canvas = {
    width: 800, height: 600,
    getContext: function (type) {
      if (type !== '2d') throw new Error('Unexpected context ' + type);
      return __context2d;
    }
  };
  var console = { log: function () {}, error: function () {} };
  var document = { getElementById: function (id) { return id === 'gameCanvas' ? __canvas : null; } };
  var performance = { now: function () { return 0; } };
  var requestAnimationFrame = function (callback) { __frames.push(callback); return __frames.length; };
  var window = {
    document: document, performance: performance, requestAnimationFrame: requestAnimationFrame,
    addEventListener: function () {}, removeEventListener: function () {}
  };

  eval(source + '\n' + assertions);
  return 'PASS: Stage 1 script order, voxel faces/slabs/chicken, shadow, camera, hop, and production frame';
}
