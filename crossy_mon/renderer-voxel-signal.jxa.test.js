ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const source = ['generator.js', 'renderer.js'].map(function (file) {
    return readUtf8(root + '/' + file);
  }).join('\n;\n');

  const assertions = `
    function assert(condition, message) { if (!condition) throw new Error(message); }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function close(actual, expected) { return Math.abs(actual - expected) < 1e-9; }

    var renderer = new Renderer(__canvas);
    assert(typeof renderer.drawVoxelWarningSignal === 'function',
      'drawVoxelWarningSignal is missing');
    assert(typeof renderer.drawWarningSignal === 'function',
      'drawWarningSignal compatibility alias is missing');
    assert(TRAIN_TRACK_CONFIG.warningDuration === 3000,
      'Train warning duration changed from 3000ms');
    assert(TRAIN_TRACK_CONFIG.flashInterval === 350,
      'Train warning flash interval changed from 350ms');

    function capture(lightOn, useAlias) {
      var blocks = [];
      var originalBlock = renderer.drawVoxelBlock;
      renderer.drawVoxelBlock = function (x, y, width, depth, height, palette, elevation) {
        blocks.push({ x: x, y: y, width: width, depth: depth, height: height,
          palette: clone(palette), elevation: elevation });
      };
      var drawn = useAlias
        ? renderer.drawWarningSignal(-3, 7, lightOn)
        : renderer.drawVoxelWarningSignal(-3, 7, lightOn);
      renderer.drawVoxelBlock = originalBlock;
      return { blocks: blocks, drawn: drawn };
    }

    var metadata = { trainState: 'WARNING', warningElapsed: 700,
      warningLightOn: true, completedEvents: 2 };
    var metadataBefore = clone(metadata);
    var lit = capture(metadata.warningLightOn, false);
    assert(JSON.stringify(metadata) === JSON.stringify(metadataBefore),
      'Signal rendering mutated warning lifecycle metadata');
    assert(lit.drawn === 8 && lit.blocks.length === 8,
      'Voxel signal did not draw its eight designed cuboids');

    lit.blocks.forEach(function (block) {
      assert(block.y >= 8.08 - 1e-9,
        'Signal block overlapped playable track row [7, 8]: ' + JSON.stringify(block));
      assert(block.y + block.depth <= 8.54 + 1e-9,
        'Signal block escaped its bounded side footprint: ' + JSON.stringify(block));
    });

    var metalTop = renderer.PALETTES.stage2.METAL.top;
    var postTop = renderer.PALETTES.stage2.SIGNAL_POST.top;
    var housingTop = renderer.PALETTES.stage2.SIGNAL_HOUSING.top;
    var litTop = renderer.PALETTES.stage2.SIGNAL_LIT.top;
    assert(lit.blocks.filter(function (block) { return block.palette.top === metalTop; }).length === 1,
      'Voxel signal is missing its weighted base');
    assert(lit.blocks.filter(function (block) { return block.palette.top === postTop; }).length === 2,
      'Voxel signal is missing its post or crossbar');
    assert(lit.blocks.filter(function (block) {
      return block.palette.top === housingTop && close(block.width, 0.22) && close(block.depth, 0.28);
    }).length === 2, 'Voxel signal does not have two distinct light housings');
    assert(lit.blocks.filter(function (block) { return block.palette.top === litTop; }).length === 1,
      'Lit phase must render exactly one emissive red light face');

    var unlit = capture(false, false);
    assert(unlit.blocks.filter(function (block) { return block.palette.top === litTop; }).length === 0,
      'Unlit phase rendered an emissive red face');
    assert(unlit.blocks.filter(function (block) {
      return block.palette.top === housingTop && close(block.width, 0.18) && close(block.depth, 0.055);
    }).length === 2, 'Unlit phase did not render both light faces dark');

    var aliasLit = capture(true, true);
    assert(JSON.stringify(aliasLit) === JSON.stringify(lit),
      'drawWarningSignal alias differs from drawVoxelWarningSignal');

    __fills.length = 0;
    renderer.drawWarningSignal(-3, 7, true);
    [metalTop, postTop, housingTop, litTop].forEach(function (color) {
      assert(__fills.indexOf(color) !== -1,
        'Canvas path missed expected signal palette color ' + color);
    });
    __fills.length = 0;
    renderer.drawWarningSignal(-3, 7, false);
    assert(__fills.indexOf(litTop) === -1,
      'Unlit Canvas path emitted the emissive red palette');
    assert(__fills.indexOf(housingTop) !== -1,
      'Unlit Canvas path omitted dark housing faces');
  `;

  var __fills = [];
  var __current = [];
  var __stack = [];
  var __context = {
    fillStyle: '', globalAlpha: 1,
    clearRect: function () {},
    beginPath: function () { __current = []; },
    moveTo: function (x, y) { __current.push({ x: x, y: y }); },
    lineTo: function (x, y) { __current.push({ x: x, y: y }); },
    closePath: function () {},
    fill: function () { __fills.push(this.fillStyle); },
    save: function () {
      __stack.push({ fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
    },
    restore: function () {
      var state = __stack.pop();
      this.fillStyle = state.fillStyle;
      this.globalAlpha = state.globalAlpha;
    }
  };
  var __canvas = {
    width: 800, height: 600,
    getContext: function () { return __context; }
  };

  eval(source + '\n' + assertions);
  return 'PASS: voxel signal base/post/crossbar, two housings, lit/unlit faces, off-track footprint, timing constants, alias, and render purity';
}
