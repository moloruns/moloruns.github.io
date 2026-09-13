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
    assert(typeof renderer.drawGrassDecoration === 'function',
      'drawGrassDecoration is missing');
    assert(typeof renderer.drawBlockingProp === 'function',
      'drawBlockingProp is missing');

    function capture(methodName, record) {
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
      var drawn = renderer[methodName](record);
      renderer.drawVoxelBlock = originalBlock;
      renderer.drawGroundShadow = originalShadow;
      return { blocks: blocks, shadows: shadows, drawn: drawn };
    }

    function assertOneCellFootprint(result, record, label) {
      result.blocks.forEach(function (block) {
        assert(block.x >= record.x - 1e-9 &&
          block.x + block.width <= record.x + 1 + 1e-9,
          label + ' escaped one-cell X occupancy: ' + JSON.stringify(block));
        assert(block.y >= record.y - 1e-9 &&
          block.y + block.depth <= record.y + 1 + 1e-9,
          label + ' escaped one-cell Y occupancy: ' + JSON.stringify(block));
      });
    }

    var flower = {
      id: '4:2:FLOWER', type: 'FLOWER', x: 2, y: 4, blocking: false,
      variant: 1, paletteIndex: 2
    };
    var flowerBefore = clone(flower);
    var flowerResult = capture('drawGrassDecoration', flower);
    assert(JSON.stringify(flower) === JSON.stringify(flowerBefore),
      'Flower rendering mutated its immutable Decoration_Record');
    assert(flowerResult.drawn === 3 && flowerResult.blocks.length === 3,
      'Flower must contain a stem, blossom, and low leaf');
    assert(flowerResult.shadows.length === 0,
      'Low flower incorrectly received a contact shadow');
    assertOneCellFootprint(flowerResult, flower, 'Flower');
    var flowerStemTop = renderer.PALETTES.stage2.FLOWER_STEM.top;
    var blossomTop = renderer.PALETTES.stage2.FLOWER_BLOSSOM[2].top;
    assert(flowerResult.blocks.filter(function (block) {
      return block.palette.top === flowerStemTop;
    }).length === 2, 'Flower is missing its stem or leaf');
    assert(flowerResult.blocks.filter(function (block) {
      return block.palette.top === blossomTop;
    }).length === 1, 'Flower paletteIndex did not select its blossom');
    assert(flowerResult.blocks.every(function (block) {
      return block.height <= 0.2 && block.elevation <= renderer.TERRAIN_HEIGHT + 0.32;
    }), 'Flower no longer has a low gameplay-readable profile');

    var tuft = {
      id: '-3:-1:GRASS_TUFT', type: 'GRASS_TUFT', x: -1, y: -3,
      blocking: false, variant: 3, paletteIndex: 0
    };
    var tuftBefore = clone(tuft);
    var tuftResult = capture('drawGrassDecoration', tuft);
    assert(JSON.stringify(tuft) === JSON.stringify(tuftBefore),
      'Grass-tuft rendering mutated its immutable Decoration_Record');
    assert(tuftResult.drawn === 3 && tuftResult.blocks.length === 3,
      'Grass tuft must contain three offset blades');
    assert(tuftResult.shadows.length === 0,
      'Low grass tuft incorrectly received a contact shadow');
    assertOneCellFootprint(tuftResult, tuft, 'Grass tuft');
    assert(tuftResult.blocks.every(function (block) {
      return block.palette.top === renderer.PALETTES.stage2.GRASS_TUFT.top &&
        block.width <= 0.1 && block.height <= 0.26;
    }), 'Grass tuft blades are not narrow, low, palette-safe prisms');
    assert(tuftResult.blocks[0].x !== tuftResult.blocks[1].x &&
      tuftResult.blocks[1].x !== tuftResult.blocks[2].x,
      'Grass tuft blades are not visibly offset');

    var tree = {
      id: '7:5:TREE', type: 'TREE', x: 5, y: 7, blocking: true,
      variant: 2, paletteIndex: 1
    };
    var treeBefore = clone(tree);
    var treeResult = capture('drawBlockingProp', tree);
    assert(JSON.stringify(tree) === JSON.stringify(treeBefore),
      'Tree rendering mutated position, blocking state, or visual variants');
    assert(treeResult.drawn === 4 && treeResult.blocks.length === 4,
      'Tree must contain one trunk and three canopy layers');
    assert(treeResult.shadows.length === 1 && treeResult.shadows[0].x === tree.x &&
      treeResult.shadows[0].y === tree.y && treeResult.shadows[0].width === 1,
      'Tree did not receive exactly one one-cell contact shadow');
    assertOneCellFootprint(treeResult, tree, 'Tree');
    var trunks = treeResult.blocks.filter(function (block) {
      return block.palette.top === renderer.PALETTES.stage2.TREE_TRUNK.top;
    });
    var canopies = treeResult.blocks.filter(function (block) {
      return block.palette.top === renderer.PALETTES.stage2.TREE_CANOPY[0].top ||
        block.palette.top === renderer.PALETTES.stage2.TREE_CANOPY[1].top;
    });
    assert(trunks.length === 1 && canopies.length === 3,
      'Tree is missing its trunk or layered canopy palettes');
    assert(canopies[0].width > canopies[1].width &&
      canopies[1].width > canopies[2].width &&
      canopies[0].elevation < canopies[1].elevation &&
      canopies[1].elevation < canopies[2].elevation,
      'Tree canopy does not form three raised, narrowing layers');

    var rock = {
      id: '11:-4:ROCK', type: 'ROCK', x: -4, y: 11, blocking: true,
      variant: 1, paletteIndex: 0
    };
    var rockBefore = clone(rock);
    var rockResult = capture('drawBlockingProp', rock);
    assert(JSON.stringify(rock) === JSON.stringify(rockBefore),
      'Rock rendering mutated position, blocking state, or visual variants');
    assert(rockResult.drawn === 3 && rockResult.blocks.length === 3,
      'Rock must contain at least two stepped voxel masses');
    assert(rockResult.shadows.length === 1 && rockResult.shadows[0].x === rock.x &&
      rockResult.shadows[0].y === rock.y && rockResult.shadows[0].width === 1,
      'Rock did not receive exactly one one-cell contact shadow');
    assertOneCellFootprint(rockResult, rock, 'Rock');
    assert(rockResult.blocks[0].width > rockResult.blocks[1].width &&
      rockResult.blocks[1].width > rockResult.blocks[2].width &&
      rockResult.blocks[0].elevation < rockResult.blocks[1].elevation &&
      rockResult.blocks[1].elevation < rockResult.blocks[2].elevation,
      'Rock masses are not visibly stepped by size and elevation');
    assert(rockResult.blocks.every(function (block) {
      return block.palette.top === renderer.PALETTES.stage2.ROCK[0].top ||
        block.palette.top === renderer.PALETTES.stage2.ROCK[1].top;
    }), 'Rock masses did not use named Stage 2 rock palettes');

    assert(JSON.stringify(flowerResult) ===
      JSON.stringify(capture('drawGrassDecoration', flower)),
      'Equivalent flower records did not render deterministically');
    assert(JSON.stringify(tuftResult) ===
      JSON.stringify(capture('drawGrassDecoration', tuft)),
      'Equivalent grass-tuft records did not render deterministically');
    assert(JSON.stringify(treeResult) ===
      JSON.stringify(capture('drawBlockingProp', tree)),
      'Equivalent tree records did not render deterministically');
    assert(JSON.stringify(rockResult) ===
      JSON.stringify(capture('drawBlockingProp', rock)),
      'Equivalent rock records did not render deterministically');

    assert(capture('drawGrassDecoration', { type: 'TREE', x: 0, y: 0 }).drawn === 0,
      'Ground-decoration dispatcher accepted a blocking type');
    assert(capture('drawBlockingProp', { type: 'FLOWER', x: 0, y: 0 }).drawn === 0,
      'Blocking-prop dispatcher accepted a non-blocking type');
    assert(capture('drawBlockingProp', { type: 'ROCK', x: NaN, y: 0 }).drawn === 0,
      'Invalid prop coordinates were rendered');

    __fills.length = 0;
    renderer.drawGrassDecoration(flower);
    renderer.drawGrassDecoration(tuft);
    renderer.drawBlockingProp(tree);
    renderer.drawBlockingProp(rock);
    [renderer.PALETTES.stage2.FLOWER_STEM.top,
      renderer.PALETTES.stage2.FLOWER_BLOSSOM[2].top,
      renderer.PALETTES.stage2.GRASS_TUFT.top,
      renderer.PALETTES.stage2.TREE_TRUNK.top,
      renderer.PALETTES.stage2.TREE_CANOPY[0].top,
      renderer.PALETTES.stage2.TREE_CANOPY[1].top,
      renderer.PALETTES.stage2.ROCK[0].top,
      renderer.PALETTES.stage2.ROCK[1].top].forEach(function (color) {
        assert(__fills.indexOf(color) !== -1,
          'Canvas path missed expected grass-prop color ' + color);
      });
    assert(__fills.filter(function (color) {
      return color === 'rgba(24, 31, 28, 0.22)';
    }).length === 2,
      'Contact shadows must be emitted only once each for tree and rock');
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
  return 'PASS: low flower/grass-tuft models, layered tree, stepped rock, one-cell footprint, blocking-only shadows, determinism, and render purity';
}
