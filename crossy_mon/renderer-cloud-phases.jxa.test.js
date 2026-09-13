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
    function assert(condition, message) { if (!condition) throw new Error(message); }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }

    var renderer = new Renderer(__canvas);
    assert(typeof renderer.drawCloud === 'function', 'drawCloud is missing');
    assert(typeof renderer.renderFramePhases === 'function',
      'renderFramePhases is missing');

    var minCloud = Object.freeze({
      id: 'cloud:min', anchorX: 0.2, anchorY: 0.1, scale: 0.8,
      opacity: 0.18, formCount: 3, variant: 0, parallaxRate: 0.002
    });
    var maxCloud = Object.freeze({
      id: 'cloud:max', anchorX: 0.75, anchorY: 0.22, scale: 1.25,
      opacity: 0.9, formCount: 6, variant: 2, parallaxRate: 0.006
    });
    var minBefore = clone(minCloud);
    var maxBefore = clone(maxCloud);

    __context.globalAlpha = 0.8;
    var minStart = __fills.length;
    assert(renderer.drawCloud(minCloud, 1200) === 3,
      'Minimum Cloud did not draw exactly three forms');
    assert(__fills.length - minStart === 9,
      'Each minimum Cloud form must draw three shaded voxel faces');
    assert(JSON.stringify(minCloud) === JSON.stringify(minBefore),
      'Minimum Cloud descriptor was mutated');
    assert(__context.globalAlpha === 0.8,
      'Minimum Cloud leaked Canvas alpha');

    var maxStart = __fills.length;
    var maxAlphaStart = __alphas.length;
    assert(renderer.drawCloud(maxCloud, 2400) === 6,
      'Maximum Cloud did not draw exactly six forms');
    assert(__fills.length - maxStart === 18,
      'Each maximum Cloud form must draw three shaded voxel faces');
    assert(__alphas.slice(maxAlphaStart).every(function (alpha) {
      return Math.abs(alpha - 0.28) < 1e-10;
    }), 'Cloud opacity was not capped at 0.35 and multiplied locally');
    assert(JSON.stringify(maxCloud) === JSON.stringify(maxBefore),
      'Maximum Cloud descriptor was mutated');
    assert(__context.globalAlpha === 0.8,
      'Maximum Cloud leaked Canvas alpha');
    assert(__saveCount === 2 && __restoreCount === 2,
      'Cloud Canvas save/restore calls are unbalanced');

    var paleFaces = [];
    renderer.PALETTES.stage2.CLOUD.forEach(function (palette) {
      paleFaces.push(palette.top, palette.left, palette.right);
    });
    assert(__fills.every(function (color) { return paleFaces.indexOf(color) !== -1; }),
      'Cloud rendering used a non-Cloud palette');

    var phaseOrder = [];
    var executed = renderer.renderFramePhases({
      ui: function () { phaseOrder.push('ui'); },
      depthSortedScene: function () { phaseOrder.push('depthSortedScene'); },
      lowDecorations: function () { phaseOrder.push('lowDecorations'); },
      terrain: function () { phaseOrder.push('terrain'); },
      clouds: function () { phaseOrder.push('clouds'); },
      sideOcclusion: function () { phaseOrder.push('sideOcclusion'); },
      player: function () { phaseOrder.push('player'); },
      ignored: function () { phaseOrder.push('ignored'); }
    });
    var expected = 'clouds,terrain,lowDecorations,depthSortedScene,sideOcclusion,player,ui';
    assert(phaseOrder.join(',') === expected,
      'Render phases ran out of order: ' + phaseOrder.join(','));
    assert(executed.join(',') === expected,
      'Render phase result did not report the fixed order');

    var generatedClouds = generateClouds('task-29.7');
    var generatedBefore = clone(generatedClouds);
    generatedClouds.forEach(function (cloud, index) {
      var count = renderer.drawCloud(cloud, index * 500);
      assert(count >= 3 && count <= 6,
        'Generated Cloud rendered outside the three-to-six-form bound');
    });
    assert(JSON.stringify(generatedClouds) === JSON.stringify(generatedBefore),
      'Rendering generated Clouds mutated immutable descriptors');

    var game = new Game({ random: function () { return 0; } });
    var productionOrder = [];
    var originalPhases = game.renderer.renderFramePhases;
    game.renderer.renderFramePhases = function (phases) {
      var wrapped = {};
      this.RENDER_PHASE_ORDER.forEach(function (name) {
        if (typeof phases[name] !== 'function') return;
        wrapped[name] = function () {
          productionOrder.push(name);
          return phases[name]();
        };
      });
      return originalPhases.call(this, wrapped);
    };
    game.render();
    assert(productionOrder.join(',') === expected,
      'Production Game did not route drawing through all explicit phases: ' +
        productionOrder.join(','));

    productionOrder = [];
    game.renderer.getSideOcclusionLayout = function () {
      throw new Error('injected side-layout failure');
    };
    game.render();
    assert(productionOrder.join(',') === expected,
      'A side-occlusion failure prevented restored Player/UI phases: ' +
        productionOrder.join(','));
  `;

  var __fills = [];
  var __alphas = [];
  var __current = [];
  var __stack = [];
  var __saveCount = 0;
  var __restoreCount = 0;
  var __frames = [];
  var __context = {
    fillStyle: '', globalAlpha: 1, font: '', textAlign: '',
    clearRect: function () {}, fillRect: function () {}, fillText: function () {},
    beginPath: function () { __current = []; },
    moveTo: function (x, y) { __current.push({ x: x, y: y }); },
    lineTo: function (x, y) { __current.push({ x: x, y: y }); },
    closePath: function () {},
    fill: function () {
      __fills.push(this.fillStyle);
      __alphas.push(this.globalAlpha);
    },
    save: function () {
      __saveCount++;
      __stack.push({ fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
    },
    restore: function () {
      __restoreCount++;
      var state = __stack.pop();
      this.fillStyle = state.fillStyle;
      this.globalAlpha = state.globalAlpha;
    }
  };
  var __canvas = {
    width: 800, height: 600,
    getContext: function (type) {
      if (type !== '2d') throw new Error('Unexpected context ' + type);
      return __context;
    }
  };
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

  eval(source + '\n' + assertions);
  return 'PASS: immutable 3-6 form Clouds, pale capped alpha, Canvas restoration, fixed render phases, and production phase routing';
}
