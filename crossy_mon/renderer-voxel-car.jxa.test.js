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
    function clone(value) { return JSON.parse(JSON.stringify(value)); }

    var renderer = new Renderer(__canvas);
    assert(typeof renderer.drawVoxelCar === 'function', 'drawVoxelCar is missing');
    assert(renderer.PALETTES.stage2.CAR_BODY.length >= 5,
      'Fewer than five deterministic bright car palettes are available');

    function capture(car) {
      var blocks = [];
      var shadows = [];
      var originalBlock = renderer.drawVoxelBlock;
      var originalShadow = renderer.drawGroundShadow;
      renderer.drawVoxelBlock = function (x, y, width, depth, height, palette, elevation) {
        blocks.push({ x: x, y: y, width: width, depth: depth, height: height,
          palette: clone(palette), elevation: elevation });
      };
      renderer.drawGroundShadow = function (x, y, width, depth) {
        shadows.push({ x: x, y: y, width: width, depth: depth });
      };
      var drawn = renderer.drawVoxelCar(car);
      renderer.drawVoxelBlock = originalBlock;
      renderer.drawGroundShadow = originalShadow;
      return { blocks: blocks, shadows: shadows, drawn: drawn };
    }

    var brightTops = {};
    renderer.PALETTES.stage2.CAR_BODY.forEach(function (palette, paletteIndex) {
      var car = {
        x: -3.25,
        y: 8,
        width: 2,
        velocity: paletteIndex % 2 === 0 ? 0.01 : -0.01,
        type: 'CAR',
        visual: { id: 'road:8:car:' + paletteIndex, paletteIndex: paletteIndex,
          modelVariant: paletteIndex % 3 }
      };
      var before = clone(car);
      var result = capture(car);
      assert(JSON.stringify(car) === JSON.stringify(before),
        'Rendering mutated car gameplay or visual fields for palette ' + paletteIndex);
      assert(result.drawn === 12 && result.blocks.length === 12,
        'Voxel car did not draw the complete 12-part silhouette');
      assert(result.shadows.length === 1 && result.shadows[0].x === car.x &&
        result.shadows[0].y === car.y && result.shadows[0].width === 2 &&
        result.shadows[0].depth === 0.48,
        'Existing logical-width contact shadow was not preserved');

      result.blocks.forEach(function (block) {
        assert(block.x >= car.x - 1e-10 && block.x + block.width <= car.x + 2 + 1e-10,
          'Car part escaped logical width 2: ' + JSON.stringify(block));
        assert(block.y >= car.y - 1e-10 && block.y + block.depth <= car.y + 1 + 1e-10,
          'Car part escaped its lane depth: ' + JSON.stringify(block));
      });

      var wheelTop = renderer.PALETTES.stage2.WHEEL.top;
      var windowTop = renderer.PALETTES.stage2.WINDOW.top;
      var bodyTop = palette.top;
      assert(result.blocks.filter(function (block) { return block.palette.top === wheelTop; }).length === 4,
        'Car does not contain exactly four visible wheel forms');
      assert(result.blocks.filter(function (block) { return block.palette.top === windowTop; }).length === 2,
        'Car does not contain front and rear windows');
      var body = result.blocks.filter(function (block) { return block.palette.top === bodyTop; });
      assert(body.length === 2 && body[1].elevation > body[0].elevation &&
        body[1].height > body[0].height,
        'Raised cabin is not distinct from the chassis');
      brightTops[bodyTop] = true;
    });
    assert(Object.keys(brightTops).length >= 5,
      'Car palette metadata did not select at least five distinct bright bodies');

    var baseCar = {
      x: 4.5, y: -2, width: 2, type: 'CAR',
      visual: { id: 'road:-2:car:0', paletteIndex: 2, modelVariant: 0 }
    };
    var rightCar = clone(baseCar); rightCar.velocity = 0.01;
    var leftCar = clone(baseCar); leftCar.velocity = -0.01;
    var right = capture(rightCar);
    var left = capture(leftCar);
    var windowTop = renderer.PALETTES.stage2.WINDOW.top;
    var rightWindows = right.blocks.filter(function (block) { return block.palette.top === windowTop; });
    var leftWindows = left.blocks.filter(function (block) { return block.palette.top === windowTop; });
    assert(rightWindows[0].x > rightWindows[1].x && leftWindows[0].x < leftWindows[1].x,
      'Front/rear window detail did not mirror with velocity sign');
    var metalTop = renderer.PALETTES.stage2.METAL.top;
    var rightNose = right.blocks.filter(function (block) { return block.palette.top === metalTop; });
    var leftNose = left.blocks.filter(function (block) { return block.palette.top === metalTop; });
    assert(rightNose[0].x > leftNose[0].x,
      'Facing accents did not mirror with velocity sign');

    var repeated = capture(rightCar);
    assert(JSON.stringify(right) === JSON.stringify(repeated),
      'Equivalent visual metadata did not render deterministically');

    __fills.length = 0;
    renderer.drawVoxelCar(rightCar);
    [renderer.PALETTES.stage2.CAR_BODY[2].top,
      renderer.PALETTES.stage2.WINDOW.top,
      renderer.PALETTES.stage2.WHEEL.top,
      'rgba(24, 31, 28, 0.22)'].forEach(function (color) {
        assert(__fills.indexOf(color) !== -1, 'Canvas path missed expected car color ' + color);
      });
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

  eval(rendererSource + '\n' + assertions);
  return 'PASS: bright voxel cars, width bounds, chassis/cabin/windows/wheels, mirrored facing, shadow, determinism, and render purity';
}
