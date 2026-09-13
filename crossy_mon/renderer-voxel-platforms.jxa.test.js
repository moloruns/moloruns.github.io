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
    assert(typeof renderer.drawVoxelLog === 'function', 'drawVoxelLog is missing');
    assert(typeof renderer.drawVoxelLilyPad === 'function', 'drawVoxelLilyPad is missing');

    function capture(methodName, platform) {
      var blocks = [];
      var shadows = [];
      var polygons = [];
      var originalBlock = renderer.drawVoxelBlock;
      var originalShadow = renderer.drawGroundShadow;
      var originalPolygon = renderer.fillPolygon;
      var originalWorldToIso = renderer.worldToIso;
      var originalScreenToCanvas = renderer.screenToCanvas;
      renderer.drawVoxelBlock = function (x, y, width, depth, height, palette, elevation) {
        blocks.push({ x: x, y: y, width: width, depth: depth, height: height,
          palette: clone(palette), elevation: elevation });
      };
      renderer.drawGroundShadow = function (x, y, width, depth) {
        shadows.push({ x: x, y: y, width: width, depth: depth });
      };
      renderer.fillPolygon = function (points, color) {
        polygons.push({ points: clone(points), color: color });
      };
      // Identity projection exposes world-space silhouette proportions while
      // preserving the renderer's elevation offset in captured y coordinates.
      renderer.worldToIso = function (x, y) { return { screenX: x, screenY: y }; };
      renderer.screenToCanvas = function (x, y) { return { x: x, y: y }; };
      var drawn = renderer[methodName](platform);
      renderer.drawVoxelBlock = originalBlock;
      renderer.drawGroundShadow = originalShadow;
      renderer.fillPolygon = originalPolygon;
      renderer.worldToIso = originalWorldToIso;
      renderer.screenToCanvas = originalScreenToCanvas;
      return { blocks: blocks, shadows: shadows, polygons: polygons, drawn: drawn };
    }

    function assertFootprint(result, platform, label) {
      assert(result.shadows.length === 1 && result.shadows[0].x === platform.x &&
        result.shadows[0].y === platform.y && result.shadows[0].width === platform.width &&
        result.shadows[0].depth === 0.46,
        label + ' did not preserve the existing logical-width Platform shadow');
      result.blocks.forEach(function (block) {
        assert(block.x >= platform.x - 1e-9 &&
          block.x + block.width <= platform.x + platform.width + 1e-9,
          label + ' part escaped logical Platform width: ' + JSON.stringify(block));
        assert(block.y >= platform.y - 1e-9 && block.y + block.depth <= platform.y + 1 + 1e-9,
          label + ' part escaped river-row depth: ' + JSON.stringify(block));
      });
    }

    [3, 4].forEach(function (width) {
      var log = {
        x: -4.25,
        y: 7,
        width: width,
        velocity: -0.0075,
        type: 'LOG',
        landingTolerance: 0.35,
        visual: { id: 'river:7:log:' + width, paletteIndex: 1, modelVariant: width % 3 }
      };
      var before = clone(log);
      var result = capture('drawVoxelLog', log);
      assert(JSON.stringify(log) === JSON.stringify(before),
        'Voxel log rendering mutated Platform gameplay or visual fields');
      assert(result.drawn === 7 && result.blocks.length === 7,
        'Voxel log did not draw trunk, two end caps, two bark bands, and two ring marks');
      assert(result.polygons.length === 0,
        'Voxel log unexpectedly left the established cuboid rendering path');
      assertFootprint(result, log, 'Voxel log');

      var barkTop = renderer.PALETTES.stage2.LOG_BARK.top;
      var endTop = renderer.PALETTES.stage2.LOG_END.top;
      var detailTop = renderer.PALETTES.stage2.TREE_TRUNK.top;
      var barkParts = result.blocks.filter(function (block) { return block.palette.top === barkTop; });
      var endCaps = result.blocks.filter(function (block) { return block.palette.top === endTop; });
      var bands = result.blocks.filter(function (block) { return block.palette.top === detailTop; });
      assert(barkParts.length === 3 && endCaps.length === 2 && bands.length === 2,
        'Voxel log is missing contrasting caps or bark/ring detail');
      assert(endCaps[0].x < log.x + width * 0.1 &&
        endCaps[1].x + endCaps[1].width > log.x + width * 0.9,
        'Contrasting log end faces are not positioned at both ends');
      assert(bands.every(function (band) { return band.elevation > barkParts[0].elevation; }),
        'Bark bands are not visibly raised above the trunk');
      assert(JSON.stringify(result) === JSON.stringify(capture('drawVoxelLog', log)),
        'Equivalent log visual metadata did not render deterministically');
    });

    [1, 3, 4].forEach(function (legacyWidth) {
      [0, 1, 2].forEach(function (variant) {
        var lily = {
          x: 2.5,
          y: -3,
          width: legacyWidth,
          velocity: 0.006,
          type: 'LILY_PAD',
          landingTolerance: 0.35,
          visual: { id: 'river:-3:lily:' + legacyWidth + ':' + variant,
            paletteIndex: variant, modelVariant: variant }
        };
        var before = clone(lily);
        var result = capture('drawVoxelLilyPad', lily);
        assert(JSON.stringify(lily) === JSON.stringify(before),
          'Lily-pad rendering mutated Platform gameplay or visual fields');
        assert(result.drawn > 0,
          'Valid Lily metadata did not produce lightweight draw instrumentation');
        assert(result.shadows.length === 1 && result.shadows[0].x === lily.x &&
          result.shadows[0].y === lily.y && result.shadows[0].width === 1 &&
          result.shadows[0].depth === 0.46,
          'Lily shadow was not bounded to its one-cell support footprint');
        result.blocks.forEach(function (block) {
          assert(block.x >= lily.x - 1e-9 && block.x + block.width <= lily.x + 1 + 1e-9,
            'Lily accent escaped the one-cell support footprint: ' + JSON.stringify(block));
          assert(block.y >= lily.y - 1e-9 && block.y + block.depth <= lily.y + 1 + 1e-9,
            'Lily accent escaped the river-row depth: ' + JSON.stringify(block));
        });

        var padPalette = renderer.PALETTES.stage2.LILY_PAD;
        var topFaces = result.polygons.filter(function (polygon) {
          return polygon.color === padPalette.top;
        });
        var sideFaces = result.polygons.filter(function (polygon) {
          return polygon.color === padPalette.left || polygon.color === padPalette.right;
        });
        assert(topFaces.length === 1,
          'Each Lily entity must render exactly one contiguous top hexagon');
        assert(sideFaces.length === 6,
          'The single Lily hexagon must retain six shallow voxel-prism side quads');

        var face = topFaces[0];
        assert(face.points.length === 6,
          'Lily-pad top silhouette is not hexagonal: ' + JSON.stringify(face));
        var unique = {};
        face.points.forEach(function (point) {
          unique[point.x.toFixed(9) + ':' + point.y.toFixed(9)] = true;
        });
        assert(Object.keys(unique).length === 6,
          'Lily-pad hexagon contains duplicate corners');
        var xs = face.points.map(function (point) { return point.x; });
        var ys = face.points.map(function (point) { return point.y; });
        var minX = Math.min.apply(null, xs);
        var maxX = Math.max.apply(null, xs);
        var minY = Math.min.apply(null, ys);
        var maxY = Math.max.apply(null, ys);
        var silhouetteWidth = maxX - minX;
        var silhouetteDepth = maxY - minY;
        var expectedCenterY = lily.y + 0.5 -
          (renderer.TERRAIN_HEIGHT + 0.06 + 0.09) * renderer.TILE_HEIGHT;
        assert(close((minX + maxX) / 2, lily.x + 0.5) &&
          close((minY + maxY) / 2, expectedCenterY),
          'Single Lily hexagon is not centered on the one-cell support');
        assert(silhouetteWidth <= 0.84 + 1e-9 && silhouetteDepth <= 0.72 + 1e-9,
          'Lily-pad silhouette is not compact');
        assert(silhouetteWidth / silhouetteDepth < 1.5,
          'Lily-pad silhouette regressed to an elongated plate');
        assert(minX >= lily.x - 1e-9 && maxX <= lily.x + 1 + 1e-9,
          'Hexagonal lily pad escaped the one-cell support width');

        sideFaces.forEach(function (sideFace) {
          assert(sideFace.points.length === 4,
            'Hexagonal lily-pad prism side is not a voxel quad');
          assert(close(Math.abs(sideFace.points[0].y - sideFace.points[3].y),
            0.09 * renderer.TILE_HEIGHT),
            'Lily-pad prism no longer has the approved shallow height');
        });

        var flowerStemTop = renderer.PALETTES.stage2.FLOWER_STEM.top;
        var blossomTop = renderer.PALETTES.stage2.FLOWER_BLOSSOM[variant].top;
        var stemCount = result.blocks.filter(function (block) {
          return block.palette.top === flowerStemTop;
        }).length;
        var blossomCount = result.blocks.filter(function (block) {
          return block.palette.top === blossomTop;
        }).length;
        assert(stemCount === (variant === 1 ? 1 : 0) &&
          blossomCount === (variant === 1 ? 1 : 0),
          'Optional lily flower did not follow deterministic model metadata');
        assert(JSON.stringify(result) === JSON.stringify(capture('drawVoxelLilyPad', lily)),
          'Equivalent lily-pad metadata did not render deterministically');
      });
    });

    [
      null,
      { x: NaN, y: 0, width: 1 },
      { x: 0, y: Infinity, width: 1 },
      { x: 0, y: 0, width: 0 }
    ].forEach(function (malformed) {
      var result = capture('drawVoxelLilyPad', malformed);
      assert(result.drawn === 0 && result.blocks.length === 0 &&
        result.shadows.length === 0 && result.polygons.length === 0,
        'Malformed Lily coordinates or width should be a render-only no-op');
    });

    __fills.length = 0;
    renderer.drawVoxelLog({ x: 0, y: 0, width: 4, velocity: 0.005, type: 'LOG' });
    renderer.drawVoxelLilyPad({ x: 5, y: 0, width: 1, velocity: -0.005,
      type: 'LILY_PAD', visual: { paletteIndex: 1, modelVariant: 1 } });
    [renderer.PALETTES.stage2.LOG_BARK.top,
      renderer.PALETTES.stage2.LOG_END.top,
      renderer.PALETTES.stage2.TREE_TRUNK.top,
      renderer.PALETTES.stage2.LILY_PAD.top,
      renderer.PALETTES.stage2.FLOWER_STEM.top,
      renderer.PALETTES.stage2.FLOWER_BLOSSOM[1].top,
      'rgba(24, 31, 28, 0.22)'].forEach(function (color) {
        assert(__fills.indexOf(color) !== -1,
          'Canvas path missed expected upgraded Platform color ' + color);
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
  return 'PASS: unchanged voxel logs plus compact shallow hexagonal lily pads, optional flower, footprint, shadow, determinism, and render purity';
}
