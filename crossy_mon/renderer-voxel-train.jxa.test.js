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
    function close(actual, expected) { return Math.abs(actual - expected) < 1e-9; }

    var renderer = new Renderer(__canvas);
    assert(typeof renderer.drawVoxelTrain === 'function', 'drawVoxelTrain is missing');

    function capture(train) {
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
      var drawn = renderer.drawVoxelTrain(train);
      renderer.drawVoxelBlock = originalBlock;
      renderer.drawGroundShadow = originalShadow;
      return { blocks: blocks, shadows: shadows, drawn: drawn };
    }

    [7, 8, 9, 10, 11].forEach(function (width) {
      var base = {
        x: -4.25,
        y: 12,
        width: width,
        velocity: 0.031,
        type: 'TRAIN',
        visual: { id: 'track:12:train:' + width, paletteIndex: width % 3, modelVariant: width % 2 },
        lifecycle: { state: 'ACTIVE', completedEvents: 4, warningLightOn: false }
      };
      var rightTrain = clone(base);
      var leftTrain = clone(base);
      leftTrain.velocity = -base.velocity;
      var rightBefore = clone(rightTrain);
      var leftBefore = clone(leftTrain);
      var right = capture(rightTrain);
      var left = capture(leftTrain);

      assert(JSON.stringify(rightTrain) === JSON.stringify(rightBefore),
        'Positive-direction render mutated train data at width ' + width);
      assert(JSON.stringify(leftTrain) === JSON.stringify(leftBefore),
        'Negative-direction render mutated train data at width ' + width);
      assert(right.drawn === right.blocks.length && right.blocks.length > 0,
        'Train did not report every drawn cuboid at width ' + width);
      assert(left.drawn === right.drawn && left.blocks.length === right.blocks.length,
        'Mirroring changed train detail count at width ' + width);

      [right, left].forEach(function (result) {
        assert(result.shadows.length === 1 && result.shadows[0].x === base.x &&
          result.shadows[0].y === base.y && result.shadows[0].width === width &&
          result.shadows[0].depth === 0.62,
          'Logical-width train contact shadow changed at width ' + width);
        result.blocks.forEach(function (block) {
          assert(block.x >= base.x - 1e-9 &&
            block.x + block.width <= base.x + width + 1e-9,
            'Train part escaped logical width ' + width + ': ' + JSON.stringify(block));
          assert(block.y >= base.y - 1e-9 && block.y + block.depth <= base.y + 1 + 1e-9,
            'Train part escaped track-row depth: ' + JSON.stringify(block));
        });
      });

      var expectedCars = width >= 10 ? 2 : 1;
      var bodyTop = renderer.PALETTES.stage2.TRAIN_BODY.top;
      var windowTop = renderer.PALETTES.stage2.WINDOW.top;
      var wheelTop = renderer.PALETTES.stage2.WHEEL.top;
      var accentTop = renderer.PALETTES.stage2.TRAIN_ACCENT.top;
      var metalTop = renderer.PALETTES.stage2.METAL.top;
      var followingCars = right.blocks.filter(function (block) {
        return block.palette.top === bodyTop && close(block.height, 0.4);
      });
      var locomotiveChassis = right.blocks.filter(function (block) {
        return block.palette.top === bodyTop && close(block.height, 0.3);
      });
      var raisedCab = right.blocks.filter(function (block) {
        return block.palette.top === bodyTop && close(block.height, 0.58);
      });
      var noses = right.blocks.filter(function (block) {
        return block.palette.top === accentTop && close(block.height, 0.44);
      });
      var windows = right.blocks.filter(function (block) {
        return block.palette.top === windowTop;
      });
      var wheels = right.blocks.filter(function (block) {
        return block.palette.top === wheelTop;
      });
      var metal = right.blocks.filter(function (block) {
        return block.palette.top === metalTop;
      });

      assert(followingCars.length === expectedCars,
        'Width ' + width + ' did not scale to the expected separated following-car count');
      assert(locomotiveChassis.length === 1 && raisedCab.length === 1 &&
        raisedCab[0].elevation > locomotiveChassis[0].elevation,
        'Locomotive is missing its chassis or distinct raised cab at width ' + width);
      assert(noses.length === 1 &&
        noses[0].x + noses[0].width <= base.x + width + 1e-9,
        'Locomotive nose is missing or outside its footprint at width ' + width);
      assert(windows.length >= expectedCars * 2 + 2,
        'Repeated following-car and cab windows are missing at width ' + width);
      assert(wheels.length === (expectedCars + 1) * 4,
        'Repeated wheel pairs did not scale with train sections at width ' + width);
      assert(metal.length === expectedCars + 1,
        'Coupler separators or locomotive front plate are missing at width ' + width);
      followingCars.forEach(function (car) {
        assert(car.x + car.width < locomotiveChassis[0].x,
          'Following car is not visibly separated from the leading locomotive');
      });

      for (var index = 0; index < right.blocks.length; index++) {
        var rightBlock = right.blocks[index];
        var leftBlock = left.blocks[index];
        assert(close(rightBlock.x + leftBlock.x + rightBlock.width,
          base.x * 2 + width),
          'Train part did not mirror inside its logical interval at width ' + width);
        assert(close(rightBlock.width, leftBlock.width) &&
          close(rightBlock.depth, leftBlock.depth) &&
          close(rightBlock.height, leftBlock.height),
          'Mirroring changed train dimensions at width ' + width);
      }

      var repeated = capture(rightTrain);
      assert(JSON.stringify(right) === JSON.stringify(repeated),
        'Equivalent train data did not render deterministically at width ' + width);
    });

    __fills.length = 0;
    renderer.drawVoxelTrain({ x: 1, y: 2, width: 11, velocity: -0.04, type: 'TRAIN' });
    [renderer.PALETTES.stage2.TRAIN_BODY.top,
      renderer.PALETTES.stage2.TRAIN_ACCENT.top,
      renderer.PALETTES.stage2.WINDOW.top,
      renderer.PALETTES.stage2.WHEEL.top,
      renderer.PALETTES.stage2.METAL.top,
      'rgba(24, 31, 28, 0.22)'].forEach(function (color) {
        assert(__fills.indexOf(color) !== -1,
          'Canvas path missed expected voxel train color ' + color);
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
  return 'PASS: voxel trains widths 7-11, mirrored locomotive, raised cab, windows, repeated wheels, separated cars/couplers, footprint, shadow, determinism, and render purity';
}
