ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const rendererSource = readUtf8(root + '/renderer.js');
  const assertions = `
    function assert(condition, message) { if (!condition) throw new Error(message); }
    function assertPalette(palette, name) {
      ['top', 'left', 'right'].forEach(function (face) {
        assert(palette && typeof palette[face] === 'string' && palette[face].length > 0,
          name + ' is missing ' + face);
      });
    }

    var renderer = new Renderer(__canvas);
    assert(renderer.PALETTES.stage2.CAR_BODY.length >= 5,
      'Stage 2 does not expose at least five bright car palettes');
    ['DEFAULT', 'TRAIN_BODY', 'WINDOW', 'WHEEL', 'LOG_BARK', 'LILY_PAD',
      'SIGNAL_POST', 'GRASS_TUFT', 'TREE_TRUNK'].forEach(function (name) {
        assertPalette(renderer.PALETTES.stage2[name], name);
      });

    var fallback = renderer.PALETTES.stage2.DEFAULT;
    var resolved = renderer.resolveVoxelPalette({ top: '#123456', left: '', right: null });
    assert(resolved.top === '#123456' && resolved.left === fallback.left &&
      resolved.right === fallback.right, 'Palette face fallback is unsafe');
    assert(renderer.getStage2Palette('CAR_BODY', -1).top ===
      renderer.PALETTES.stage2.CAR_BODY[renderer.PALETTES.stage2.CAR_BODY.length - 1].top,
      'Palette variants do not wrap deterministically');
    assert(renderer.getStage2Palette('UNKNOWN', 8).top === fallback.top,
      'Unknown palette names do not use the safe fallback');

    __context.globalAlpha = 0.8;
    var drawn = renderer.drawStage2Model(2, 3, [{
      x: 0.1, y: 0.2, width: 0.8, depth: 0.5, height: 0.4,
      paletteName: 'TRAIN_BODY'
    }, {
      width: 0, depth: 1, height: 1, paletteName: 'ROCK'
    }], { opacity: 0.25, shadow: { width: 1.2, depth: 0.45 } });
    assert(drawn === 1, 'Invalid model parts were not skipped');
    assert(__fills.length === 4 && __fills[0] === 'rgba(24, 31, 28, 0.22)',
      'Model helper did not reuse the contact shadow and cuboid primitives');
    assert(__fills.slice(1).join(',') === '#355895,#263F70,#4D78C9',
      'Model helper changed cuboid face order');
    assert(__alphas.every(function (alpha) { return Math.abs(alpha - 0.2) < 1e-10; }),
      'Local model alpha was not applied');
    assert(__context.globalAlpha === 0.8 && __saveCount === 1 && __restoreCount === 1,
      'Canvas alpha or save/restore state leaked');

    var threw = false;
    try {
      renderer.withAlpha(0.5, function () { throw new Error('expected'); });
    } catch (error) {
      threw = error.message === 'expected';
    }
    assert(threw && __context.globalAlpha === 0.8 && __saveCount === 2 && __restoreCount === 2,
      'Canvas state was not restored after a drawing error');
  `;

  var __fills = [];
  var __alphas = [];
  var __current = [];
  var __stack = [];
  var __saveCount = 0;
  var __restoreCount = 0;
  var __context = {
    fillStyle: '', globalAlpha: 1,
    clearRect: function () {},
    beginPath: function () { __current = []; },
    moveTo: function (x, y) { __current.push({ x: x, y: y }); },
    lineTo: function (x, y) { __current.push({ x: x, y: y }); },
    closePath: function () {},
    fill: function () { __fills.push(this.fillStyle); __alphas.push(this.globalAlpha); },
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
    getContext: function () { return __context; }
  };

  eval(rendererSource + '\n' + assertions);
  return 'PASS: Stage 2 palettes, safe resolution, model primitives, contact shadow, and Canvas state guards';
}
