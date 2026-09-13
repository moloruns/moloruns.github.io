ObjC.import('Foundation');

// Feature: pokemon-reskin-and-pokeballs, Property 11: One valid visible descriptor produces one recognizable Poké Ball

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const propertyLabel = 'Feature: pokemon-reskin-and-pokeballs, Property 11: One valid visible descriptor produces one recognizable Poké Ball';
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const scripts = [
    'player.js', 'world.js', 'generator.js', 'collision.js',
    'renderer.js', 'input.js', 'game.js'
  ];
  const sources = scripts.map(function (script) {
    return readUtf8(root + '/' + script);
  });
  const source = sources.join('\n;\n');
  const rendererSource = sources[4];
  const gameSource = sources[6];

  var __fills = [];
  var __currentPath = [];
  var __canvasStack = [];
  var __contextRequests = [];
  var __context = {
    fillStyle: '',
    globalAlpha: 1,
    clearRect: function () {},
    beginPath: function () { __currentPath = []; },
    moveTo: function (x, y) { __currentPath.push({ x: x, y: y }); },
    lineTo: function (x, y) { __currentPath.push({ x: x, y: y }); },
    closePath: function () {},
    fill: function () {
      __fills.push({ fillStyle: this.fillStyle, points: __currentPath.slice() });
    },
    save: function () {
      __canvasStack.push({
        fillStyle: this.fillStyle,
        globalAlpha: this.globalAlpha
      });
    },
    restore: function () {
      var state = __canvasStack.pop();
      if (!state) throw new Error('Canvas restore was not balanced');
      this.fillStyle = state.fillStyle;
      this.globalAlpha = state.globalAlpha;
    }
  };
  var __canvas = {
    width: 800,
    height: 600,
    getContext: function (kind) {
      __contextRequests.push(kind);
      if (kind !== '2d') throw new Error('Non-Canvas-2D context requested: ' + kind);
      return __context;
    }
  };
  var console = { log: function () {}, error: function () {} };
  var document = {
    getElementById: function (id) {
      return id === 'gameCanvas' ? __canvas : null;
    },
    createElement: function () {
      throw new Error('Poké Ball rendering attempted to create an asset element');
    }
  };
  var performance = { now: function () { return 0; } };
  var requestAnimationFrame = function () { return 1; };
  var window = {
    document: document,
    performance: performance,
    requestAnimationFrame: requestAnimationFrame,
    addEventListener: function () {},
    removeEventListener: function () {}
  };
  var Image = function () {
    throw new Error('Poké Ball rendering attempted to construct an image asset');
  };
  var fetch = function () {
    throw new Error('Poké Ball rendering attempted a network fetch');
  };
  var XMLHttpRequest = function () {
    throw new Error('Poké Ball rendering attempted a network request');
  };

  const assertions = `
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    function descriptor(rowY, terrainType, x, variant) {
      return Object.freeze({
        id: 'pokeball:' + rowY,
        type: 'POKE_BALL',
        x: x,
        y: rowY,
        terrainType: terrainType,
        blocking: false,
        variant: variant,
        schemaVersion: 1
      });
    }
    function paletteSignature(palette) {
      return [palette.top, palette.left, palette.right].join('|');
    }
    function assertCompletePalette(palette, message) {
      assert(palette && typeof palette === 'object', message + ': palette is missing');
      ['top', 'left', 'right'].forEach(function (face) {
        assert(typeof palette[face] === 'string' && palette[face].length > 0,
          message + ': ' + face + ' face is missing');
      });
    }
    function semantics(parts, name) {
      return parts.filter(function (part) { return part.semantic === name; });
    }
    function assertRecognizableManifest(renderer, parts, terrainType, caseLabel) {
      assert(Array.isArray(parts) && parts.length > 0 && parts.length <= 10,
        caseLabel + ': Poké Ball manifest exceeded the ten-part bound');
      assert(parts.every(function (part) {
        return Object.isFrozen(part) && renderer.isValidPokeBallPart(part);
      }), caseLabel + ': manifest contains a mutable or invalid voxel part');

      var upper = semantics(parts, 'upperHalf');
      var lower = semantics(parts, 'lowerHalf');
      var band = semantics(parts, 'centerBand');
      var button = semantics(parts, 'centerButton');
      assert(upper.length > 0, caseLabel + ': red upper half is missing');
      assert(lower.length > 0, caseLabel + ': white lower half is missing');
      assert(band.length > 0, caseLabel + ': dark center band is missing');
      assert(button.length > 0, caseLabel + ': central button is missing');

      var treatment = renderer.getPokeBallContrastPalette(terrainType);
      assert(treatment && Object.isFrozen(treatment),
        caseLabel + ': fixed terrain contrast treatment is missing');
      ['red', 'white', 'band', 'button'].forEach(function (region) {
        assertCompletePalette(treatment[region], caseLabel + ': ' + region);
      });
      upper.forEach(function (part) {
        assert(paletteSignature(part.palette) === paletteSignature(treatment.red),
          caseLabel + ': upper half does not use the terrain red treatment');
      });
      lower.forEach(function (part) {
        assert(paletteSignature(part.palette) === paletteSignature(treatment.white),
          caseLabel + ': lower half does not use the terrain white treatment');
      });
      band.forEach(function (part) {
        assert(paletteSignature(part.palette) === paletteSignature(treatment.band),
          caseLabel + ': center band does not use the terrain dark treatment');
      });
      button.forEach(function (part) {
        assert(paletteSignature(part.palette) === paletteSignature(treatment.button),
          caseLabel + ': button does not use the terrain button treatment');
      });

      var requiredRegionSignatures = [
        paletteSignature(treatment.red),
        paletteSignature(treatment.white),
        paletteSignature(treatment.band),
        paletteSignature(treatment.button)
      ];
      assert(requiredRegionSignatures.every(function (signature, index) {
        return requiredRegionSignatures.indexOf(signature) === index;
      }), caseLabel + ': required visual regions are not distinguishable');
    }

    assert(typeof Renderer.prototype.drawVoxelPokeBall === 'function',
      'Poké Ball semantic draw helper is missing');
    assert(typeof Renderer.prototype.buildPokeBallManifest === 'function',
      'Poké Ball semantic manifest builder is missing');
    assert(typeof Game.prototype.renderObstaclesAndPlatforms === 'function',
      'Game depth-sorted scene integration is missing');

    var forbiddenAssetPattern = /drawImage|createImageBitmap|new\\s+Image|fetch\\s*\\(|XMLHttpRequest|WebGL|getContext\\s*\\(\\s*['\"]webgl|<img|https?:\\/\\//;
    assert(!forbiddenAssetPattern.test(__rendererSource),
      'Renderer introduces an external asset or non-Canvas voxel path');
    assert(!forbiddenAssetPattern.test(__gameSource),
      'Game Poké Ball integration introduces an external asset path');

    var game = new Game({
      visualSeed: 'property-11-pokeball-render',
      random: function () { return 0; }
    });
    game.world.terrainRows.clear();
    game.clouds = Object.freeze([]);
    game.renderUI = function () {};

    var renderer = game.renderer;
    var originalStage2Model = renderer.drawStage2Model;
    var originalPokeBall = renderer.drawVoxelPokeBall;
    var originalVisibility = renderer.isWorldFootprintVisible;
    var originalRenderObstacle = game.renderObstacle;
    var originalRenderPlatform = game.renderPlatform;
    var semanticCalls = [];
    var modelCalls = [];
    var visibilityCalls = [];
    var eventLog = [];
    var visibilityResult = true;

    renderer.drawStage2Model = function (x, y, parts, options) {
      modelCalls.push({ x: x, y: y, parts: parts, options: options });
      return parts.length;
    };
    renderer.drawVoxelPokeBall = function (value, ownerRow) {
      eventLog.push('pokeBall');
      var call = { descriptor: value, ownerRow: ownerRow, result: null };
      semanticCalls.push(call);
      call.result = originalPokeBall.call(this, value, ownerRow);
      return call.result;
    };
    renderer.isWorldFootprintVisible = function (x, y, width, depth, options) {
      visibilityCalls.push({
        x: x, y: y, width: width, depth: depth, options: options
      });
      return visibilityResult;
    };
    game.renderObstacle = function () { eventLog.push('obstacle'); };
    game.renderPlatform = function () { eventLog.push('platform'); };

    var terrainTypes = ['GRASS', 'ROAD', 'TRAIN_TRACK'];
    var treatmentSignatures = {};
    var caseCount = 120;

    for (var caseIndex = 0; caseIndex < caseCount; caseIndex++) {
      var terrainType = terrainTypes[caseIndex % terrainTypes.length];
      var rowY = ((caseIndex * 37) % 211) - 105;
      var x = ((caseIndex * 17) % 31) - 15;
      var value = descriptor(rowY, terrainType, x, caseIndex % 3);
      var row = {
        y: rowY,
        type: terrainType,
        decorations: Object.freeze([]),
        obstacles: [{ type: 'CAR', x: x, y: rowY, width: 2, velocity: 1 }],
        platforms: [{ type: 'LOG', x: x, y: rowY, width: 3, velocity: 1 }],
        cosmetics: Object.freeze({ pokeBall: value })
      };
      game.world.terrainRows.clear();
      game.world.terrainRows.set(rowY, row);
      visibilityResult = true;
      eventLog = [];
      var semanticStart = semanticCalls.length;
      var modelStart = modelCalls.length;
      var visibilityStart = visibilityCalls.length;

      game.renderObstaclesAndPlatforms();

      var caseLabel = 'case ' + caseIndex + ' (' + terrainType + ')';
      assert(semanticCalls.length === semanticStart + 1,
        caseLabel + ': visible descriptor did not dispatch exactly once');
      assert(semanticCalls[semanticStart].descriptor === value &&
        semanticCalls[semanticStart].ownerRow === row &&
        semanticCalls[semanticStart].result === 1,
        caseLabel + ': descriptor did not map to one semantic Poké Ball object');
      assert(modelCalls.length === modelStart + 1,
        caseLabel + ': semantic object did not dispatch one bounded voxel model');

      var modelCall = modelCalls[modelStart];
      assert(modelCall.x === x && modelCall.y === rowY,
        caseLabel + ': voxel model origin differs from descriptor coordinates');
      assertRecognizableManifest(renderer, modelCall.parts, terrainType, caseLabel);
      assert(modelCall.options.elevation === renderer.TERRAIN_HEIGHT + 0.02,
        caseLabel + ': Poké Ball is not grounded above the terrain slab');

      assert(eventLog.length === 3 && eventLog[0] === 'pokeBall' &&
        eventLog[1] === 'obstacle' && eventLog[2] === 'platform',
        caseLabel + ': ground cosmetic was not sorted before same-cell moving entities');

      var caseVisibility = visibilityCalls.slice(visibilityStart);
      var cosmeticVisibility = caseVisibility.filter(function (call) {
        return call.x === x && call.y === rowY && call.width === 1 &&
          call.depth === 1 && call.options && call.options.height === 0.8;
      });
      assert(cosmeticVisibility.length === 1 &&
        cosmeticVisibility[0].options.elevation === renderer.TERRAIN_HEIGHT &&
        cosmeticVisibility[0].options.margin === 128,
        caseLabel + ': descriptor did not use the one-cell Poké Ball culling contract');

      treatmentSignatures[terrainType] = JSON.stringify(
        renderer.getPokeBallContrastPalette(terrainType)
      );
    }

    assert(semanticCalls.length === caseCount,
      'Expected exactly one semantic Poké Ball for all 120 visible descriptors');
    assert(modelCalls.length === caseCount,
      'Expected exactly one bounded voxel model for all 120 visible descriptors');
    assert(treatmentSignatures.GRASS !== treatmentSignatures.ROAD &&
      treatmentSignatures.GRASS !== treatmentSignatures.TRAIN_TRACK &&
      treatmentSignatures.ROAD !== treatmentSignatures.TRAIN_TRACK,
      'Eligible terrain types do not have distinct fixed contrast treatments');

    var culledValue = descriptor(300, 'ROAD', 4, 1);
    var culledRow = {
      y: 300,
      type: 'ROAD',
      decorations: Object.freeze([]),
      obstacles: [],
      platforms: [],
      cosmetics: Object.freeze({ pokeBall: culledValue })
    };
    game.world.terrainRows.clear();
    game.world.terrainRows.set(culledRow.y, culledRow);
    visibilityResult = false;
    eventLog = [];
    var culledSemanticStart = semanticCalls.length;
    var culledVisibilityStart = visibilityCalls.length;
    game.renderObstaclesAndPlatforms();
    assert(semanticCalls.length === culledSemanticStart && eventLog.length === 0,
      'Off-canvas descriptor was not culled before semantic drawing');
    var culledChecks = visibilityCalls.slice(culledVisibilityStart);
    assert(culledChecks.length === 1 && culledChecks[0].width === 1 &&
      culledChecks[0].depth === 1 && culledChecks[0].options.height === 0.8,
      'Off-canvas descriptor did not receive exactly one bounded visibility check');

    var orderedValue = descriptor(12, 'TRAIN_TRACK', 2, 2);
    var orderedRow = {
      y: 12,
      type: 'TRAIN_TRACK',
      decorations: Object.freeze([]),
      obstacles: [{ type: 'TRAIN', x: 2, y: 12, width: 10, velocity: 1 }],
      platforms: [],
      cosmetics: Object.freeze({ pokeBall: orderedValue })
    };
    game.world.terrainRows.clear();
    game.world.terrainRows.set(orderedRow.y, orderedRow);
    visibilityResult = true;
    eventLog = [];
    renderer.clear = function () { eventLog.push('clear'); };
    renderer.centerCameraOnPlayer = function () { eventLog.push('camera'); };
    game.renderClouds = function () { eventLog.push('clouds'); };
    game.renderTerrain = function () { eventLog.push('terrain'); };
    game.renderLowDecorations = function () { eventLog.push('lowDecorations'); };
    game.renderSideShoulders = function () { eventLog.push('sideOcclusion'); };
    renderer.drawGroundShadow = function () { eventLog.push('playerShadow'); };
    renderer.drawVoxelPikachu = function () { eventLog.push('player'); return 1; };
    game.renderUI = function () { eventLog.push('ui'); };
    game.player.getCurrentPosition = function () { return { x: 2, y: 12 }; };
    game.player.getVisualState = function () {
      return { facing: { dx: 0, dy: 1 }, hopHeight: 0 };
    };

    game.render();

    var expectedOrder = [
      'clear', 'camera', 'clouds', 'terrain', 'lowDecorations',
      'pokeBall', 'obstacle', 'sideOcclusion',
      'playerShadow', 'player', 'ui'
    ];
    assert(JSON.stringify(eventLog) === JSON.stringify(expectedOrder),
      'Frame order did not preserve scene-before-side-occlusion-before-Player phases: ' +
        JSON.stringify(eventLog));
    assert(renderer.RENDER_PHASE_ORDER.join('>') ===
      'clouds>terrain>lowDecorations>depthSortedScene>sideOcclusion>player>ui',
      'Renderer phase contract changed while integrating Poké Balls');

    renderer.drawStage2Model = originalStage2Model;
    renderer.isWorldFootprintVisible = originalVisibility;
    game.renderObstacle = originalRenderObstacle;
    game.renderPlatform = originalRenderPlatform;

    var canvasValue = descriptor(24, 'GRASS', 0, 0);
    var canvasOwner = { y: 24, type: 'GRASS' };
    var canvasManifest = renderer.buildPokeBallManifest(canvasValue, canvasOwner);
    var fillStart = __fills.length;
    var stackStart = __canvasStack.length;
    assert(originalPokeBall.call(renderer, canvasValue, canvasOwner) === 1,
      'Real Canvas path did not produce one semantic Poké Ball');
    assert(__fills.length - fillStart === canvasManifest.length * 3,
      'Real Canvas path did not draw exactly three faces per bounded voxel part');
    assert(__canvasStack.length === stackStart,
      'Real Canvas path leaked Canvas state');
    assert(__contextRequests.length === 1 && __contextRequests[0] === '2d',
      'Poké Ball rendering requested anything other than the existing Canvas 2D context');
  `;

  var __rendererSource = rendererSource;
  var __gameSource = gameSource;
  eval(source + '\n' + assertions);

  return 'PASS: ' + propertyLabel + '; 120 deterministic visible descriptors across GRASS/ROAD/TRAIN_TRACK, one <=10-part semantic object each, four contrast regions, culling, Canvas-only rendering, and scene/side/Player order';
}
