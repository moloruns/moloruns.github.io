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
    function snapshotState(context) {
      return JSON.stringify({
        fillStyle: context.fillStyle,
        strokeStyle: context.strokeStyle,
        globalAlpha: context.globalAlpha,
        transform: context.transform,
        shadowColor: context.shadowColor,
        shadowBlur: context.shadowBlur,
        shadowOffsetX: context.shadowOffsetX,
        shadowOffsetY: context.shadowOffsetY,
        globalCompositeOperation: context.globalCompositeOperation,
        clipDepth: context.clipDepth
      });
    }

    var renderer = new Renderer(__canvas);
    renderer.centerCameraOnPlayer(0, 0);
    var config = renderer.SIDE_OCCLUSION_CONFIG;
    assert(Object.isFrozen(config), 'Side occlusion geometry is not immutable');
    assert(config.leftOuterX === -32 && config.playableMinX === -15 &&
      config.playableMaxExclusiveX === 16 && config.rightOuterX === 32,
      'Side corridors do not preserve the exact [-15, 16) opening or wrap extents');

    var layout = renderer.getSideOcclusionLayout(-20, 15, 'focused-seed');
    var repeated = renderer.getSideOcclusionLayout(-20, 15, 'focused-seed');
    assert(layout && Object.isFrozen(layout) && Object.isFrozen(layout.left) &&
      Object.isFrozen(layout.right) && Object.isFrozen(layout.left.scenery) &&
      Object.isFrozen(layout.right.scenery), 'Side layout/descriptors are not immutable');
    assert(JSON.stringify(layout) === JSON.stringify(repeated),
      'Equivalent visual seed/side/row inputs did not reproduce stable scenery');
    assert(layout.opening.logicalMinX === -15 &&
      layout.opening.logicalMaxExclusiveX === 16,
      'Layout changed the central gameplay opening');
    assert(layout.left.grass.x === -32 && layout.left.grass.width === 17 &&
      layout.right.grass.x === 16 && layout.right.grass.width === 16,
      'Grass strips do not exactly cover their bounded side corridors');

    [layout.left, layout.right].forEach(function (side) {
      assert(side.scenery.length <= config.maxSceneryPerSide,
        side.side + ' scenery exceeded its descriptor cap');
      assert(side.scenery.some(function (item) { return item.type === 'TREE'; }) &&
        side.scenery.some(function (item) { return item.type === 'ROCK'; }),
        side.side + ' normal row band lacks a tree or rock');
      side.scenery.forEach(function (item) {
        assert(item.x >= side.logicalMinX && item.x + 1 <= side.logicalMaxExclusiveX,
          side.side + ' scenery escaped its complete logical corridor footprint');
        assert(item.y >= side.visibleRowMin && item.y <= side.visibleRowMax,
          side.side + ' scenery escaped the retained visible row band');
        assert(item.side === side.side && !('blocking' in item) && !('world' in item),
          'Render-only scenery acquired gameplay state');
      });
    });
    assert(renderer.getSideOcclusionLayout(10, 9, 'bad') === null &&
      renderer.getSideOcclusionLayout(NaN, 9, 'bad') === null &&
      renderer.getSideOcclusionLayout(0, 1000, 'bad') === null,
      'Invalid or unbounded row bands did not safely no-op');

    var worldRecordsBefore = JSON.stringify(layout);
    var directGrass = renderer.drawSideGrass(layout.left);
    var directScenery = renderer.drawSideScenery(layout.left);
    assert(directGrass === 0 && directScenery === 0 && __fills.length === 0,
      'A shoulder primitive drew without an owning active clip');

    var normalResult = renderer.drawSideShoulders(layout);
    assert(normalResult.sidesDrawn === 2 && normalResult.failedSides === 0,
      'Both clipped shoulder scopes did not complete');
    assert(__clipCalls === 2 && __saveCount === __restoreCount && __stack.length === 0,
      'Shoulder scopes did not save, clip, and restore independently');
    assert(__fills.length > 0 && __fills.every(function (fill) {
      return fill.clipDepth > 0;
    }), 'A grass/scenery shadow, face, stroke, or detail drew outside a side clip');
    assert(JSON.stringify(layout) === worldRecordsBefore,
      'Shoulder rendering mutated its ephemeral layout');

    var culled = layout.left.scenery[0];
    var drawnScenery = [];
    var originalVisibility = renderer.isWorldFootprintVisible;
    var originalBlockingProp = renderer.drawBlockingProp;
    renderer.isWorldFootprintVisible = function (x, y) {
      return !(x === culled.x && y === culled.y);
    };
    renderer.drawBlockingProp = function (item) {
      drawnScenery.push(item);
      return 1;
    };
    renderer.drawSideShoulders(layout);
    assert(drawnScenery.indexOf(culled) === -1 && drawnScenery.length > 0,
      'Projected-footprint visibility did not cull side scenery');
    renderer.isWorldFootprintVisible = originalVisibility;
    renderer.drawBlockingProp = originalBlockingProp;

    __context.fillStyle = '#before-fill';
    __context.strokeStyle = '#before-stroke';
    __context.globalAlpha = 0.37;
    __context.transform = 'matrix-before';
    __context.shadowColor = '#before-shadow';
    __context.shadowBlur = 7;
    __context.shadowOffsetX = 3;
    __context.shadowOffsetY = 4;
    __context.globalCompositeOperation = 'multiply';
    var beforeFailure = snapshotState(__context);
    var grassCalls = 0;
    var sceneryCalls = 0;
    var originalGrass = renderer.drawSideGrass;
    var originalScenery = renderer.drawSideScenery;
    renderer.drawSideGrass = function (side) {
      grassCalls++;
      __context.fillStyle = '#changed';
      __context.strokeStyle = '#changed';
      __context.globalAlpha = 0.1;
      __context.transform = 'changed';
      __context.shadowColor = '#changed';
      __context.shadowBlur = 99;
      __context.shadowOffsetX = 99;
      __context.shadowOffsetY = 99;
      __context.globalCompositeOperation = 'screen';
      if (side.side === 'LEFT') throw new Error('injected grass failure');
      return 1;
    };
    renderer.drawSideScenery = function () { sceneryCalls++; return 2; };
    var failedResult = renderer.drawSideShoulders(layout);
    assert(failedResult.failedSides === 1 && failedResult.sidesDrawn === 1 &&
      grassCalls === 2 && sceneryCalls === 1,
      'A failed left scope prevented the restored right scope from rendering');
    assert(snapshotState(__context) === beforeFailure && __stack.length === 0,
      'Canvas clip/style/alpha/transform/shadow/composite state leaked after failure');
    renderer.drawSideGrass = originalGrass;
    renderer.drawSideScenery = originalScenery;

    var noClipContext = {
      beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
      closePath: function () {}, fill: function () {}, save: function () {},
      restore: function () {}
    };
    var noClipRenderer = new Renderer({
      width: 800, height: 600, getContext: function () { return noClipContext; }
    });
    var noClipLayout = noClipRenderer.getSideOcclusionLayout(-20, 15, 'no-clip');
    var noClipResult = noClipRenderer.drawSideShoulders(noClipLayout);
    assert(noClipResult.sidesDrawn === 0 && noClipResult.failedSides === 0,
      'A context without clipping drew an unclipped fallback');
  `;

  var __fills = [];
  var __current = [];
  var __stack = [];
  var __saveCount = 0;
  var __restoreCount = 0;
  var __clipCalls = 0;
  var __context = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1,
    transform: 'identity', shadowColor: 'transparent', shadowBlur: 0,
    shadowOffsetX: 0, shadowOffsetY: 0,
    globalCompositeOperation: 'source-over', clipDepth: 0,
    clearRect: function () {},
    beginPath: function () { __current = []; },
    moveTo: function (x, y) { __current.push({ x: x, y: y }); },
    lineTo: function (x, y) { __current.push({ x: x, y: y }); },
    closePath: function () {},
    clip: function () { __clipCalls++; this.clipDepth++; },
    fill: function () {
      __fills.push({ fillStyle: this.fillStyle, clipDepth: this.clipDepth });
    },
    stroke: function () {
      __fills.push({ fillStyle: this.strokeStyle, clipDepth: this.clipDepth });
    },
    save: function () {
      __saveCount++;
      __stack.push({
        fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
        globalAlpha: this.globalAlpha, transform: this.transform,
        shadowColor: this.shadowColor, shadowBlur: this.shadowBlur,
        shadowOffsetX: this.shadowOffsetX, shadowOffsetY: this.shadowOffsetY,
        globalCompositeOperation: this.globalCompositeOperation,
        clipDepth: this.clipDepth
      });
    },
    restore: function () {
      __restoreCount++;
      var state = __stack.pop();
      this.fillStyle = state.fillStyle;
      this.strokeStyle = state.strokeStyle;
      this.globalAlpha = state.globalAlpha;
      this.transform = state.transform;
      this.shadowColor = state.shadowColor;
      this.shadowBlur = state.shadowBlur;
      this.shadowOffsetX = state.shadowOffsetX;
      this.shadowOffsetY = state.shadowOffsetY;
      this.globalCompositeOperation = state.globalCompositeOperation;
      this.clipDepth = state.clipDepth;
    }
  };
  var __canvas = {
    width: 800, height: 600,
    getContext: function () { return __context; }
  };

  eval(rendererSource + '\n' + assertions);
  return 'PASS: bounded deterministic shoulder layouts, owning-corridor clipping, culling, render purity, no fallback, and full Canvas restoration';
}
