ObjC.import('Foundation');

// Feature: pokemon-reskin-and-pokeballs, Property 1: One Player render produces one complete voxel Pikachu

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const propertyLabel = 'Feature: pokemon-reskin-and-pokeballs, Property 1: One Player render produces one complete voxel Pikachu';
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

  var __activePikachu = false;
  var __pikachuFillCount = 0;
  var __pikachuCanvasMethods = [];
  var __canvasStateStack = [];
  var __contextRequests = [];
  var __context = {
    fillStyle: '',
    globalAlpha: 1,
    clearRect: function () {},
    beginPath: function () {
      if (__activePikachu) __pikachuCanvasMethods.push('beginPath');
    },
    moveTo: function () {
      if (__activePikachu) __pikachuCanvasMethods.push('moveTo');
    },
    lineTo: function () {
      if (__activePikachu) __pikachuCanvasMethods.push('lineTo');
    },
    closePath: function () {
      if (__activePikachu) __pikachuCanvasMethods.push('closePath');
    },
    fill: function () {
      if (__activePikachu) {
        __pikachuCanvasMethods.push('fill');
        __pikachuFillCount++;
      }
    },
    save: function () {
      if (__activePikachu) __pikachuCanvasMethods.push('save');
      __canvasStateStack.push({
        fillStyle: this.fillStyle,
        globalAlpha: this.globalAlpha
      });
    },
    restore: function () {
      if (__activePikachu) __pikachuCanvasMethods.push('restore');
      var state = __canvasStateStack.pop();
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
      throw new Error('Pikachu rendering attempted to create an external asset element');
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
    throw new Error('Pikachu rendering attempted to construct an image asset');
  };
  var fetch = function () {
    throw new Error('Pikachu rendering attempted a network fetch');
  };
  var XMLHttpRequest = function () {
    throw new Error('Pikachu rendering attempted a network request');
  };

  const assertions = `
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    function paletteEquals(left, right) {
      return left === right || (left && right &&
        left.top === right.top && left.left === right.left &&
        left.right === right.right);
    }
    function partsWith(parts, semantic) {
      return parts.filter(function (part) { return part.semantic === semantic; });
    }
    function assertPalette(part, palette, message) {
      assert(paletteEquals(part.palette, palette), message);
    }
    function assertCompleteManifest(parts, renderer, caseLabel) {
      assert(Array.isArray(parts), caseLabel + ': semantic manifest is not an array');
      assert(parts.length > 0 && parts.length <= 32,
        caseLabel + ': manifest exceeded the 32-part bound');
      assert(parts.every(function (part) {
        return Object.isFrozen(part) && renderer.isValidPikachuPart(part);
      }), caseLabel + ': manifest contains a mutable or invalid production part');

      var palettes = renderer.PALETTES.pikachu;
      var feet = partsWith(parts, 'foot');
      var legs = partsWith(parts, 'leg');
      var bodies = partsWith(parts, 'body');
      var bellies = partsWith(parts, 'belly');
      var arms = partsWith(parts, 'arm');
      var heads = partsWith(parts, 'head');
      assert(feet.length === 2 && legs.length === 2 && bodies.length === 1 &&
        bellies.length === 1 && arms.length === 2 && heads.length === 1,
        caseLabel + ': yellow full-body inventory is incomplete');
      feet.forEach(function (part) {
        assertPalette(part, palettes.yellowShadow,
          caseLabel + ': a foot is not shaded yellow');
      });
      legs.concat(bodies).concat(arms).forEach(function (part) {
        assertPalette(part, palettes.yellow,
          caseLabel + ': a body/limb part is not yellow');
      });
      bellies.concat(heads).forEach(function (part) {
        assertPalette(part, palettes.yellowHighlight,
          caseLabel + ': belly/head highlight is not yellow');
      });

      ['left', 'right'].forEach(function (side) {
        var ear = parts.filter(function (part) {
          return part.semantic === 'ear' && part.side === side;
        });
        var tip = parts.filter(function (part) {
          return part.semantic === 'earTip' && part.side === side;
        });
        assert(ear.length === 2 && tip.length === 1,
          caseLabel + ': ' + side + ' long black-tipped ear is incomplete');
        assert(Math.max.apply(null, ear.concat(tip).map(function (part) {
          return part.elevation + part.height;
        })) > heads[0].elevation + heads[0].height,
          caseLabel + ': ' + side + ' ear is not raised above the head');
        assertPalette(tip[0], palettes.black,
          caseLabel + ': ' + side + ' ear tip is not black');
      });

      var cheeks = partsWith(parts, 'cheek');
      var eyes = partsWith(parts, 'eye');
      var noses = partsWith(parts, 'nose');
      assert(cheeks.length === 2 && eyes.length === 2 && noses.length === 1,
        caseLabel + ': face is missing cheeks, eyes, or nose');
      cheeks.forEach(function (part) {
        assert(part.surface === 'front', caseLabel + ': cheek is not forward-facing');
        assertPalette(part, palettes.red, caseLabel + ': cheek is not red');
      });
      eyes.concat(noses).forEach(function (part) {
        assert(part.surface === 'front', caseLabel + ': dark face part is not forward-facing');
        assertPalette(part, palettes.dark, caseLabel + ': eye/nose is not dark');
      });

      var markings = partsWith(parts, 'backMarking');
      assert(markings.length >= 2, caseLabel + ': brown back markings are incomplete');
      markings.forEach(function (part) {
        assert(part.surface === 'rear', caseLabel + ': back marking is not rearward');
        assertPalette(part, palettes.brown, caseLabel + ': back marking is not brown');
      });

      var tail = partsWith(parts, 'tail');
      var requiredTailRoles = ['tailRoot', 'tailLower', 'tailMiddle', 'tailUpper', 'tailTip'];
      assert(tail.length >= 5, caseLabel + ': lightning-bolt tail is not segmented');
      requiredTailRoles.forEach(function (role) {
        assert(tail.some(function (part) { return part.role === role; }),
          caseLabel + ': lightning-bolt tail is missing ' + role);
      });
      assert(tail.every(function (part) { return part.surface === 'rear'; }),
        caseLabel + ': lightning-bolt tail is not rearward');
      assertPalette(tail.filter(function (part) {
        return part.role === 'tailRoot';
      })[0], palettes.brown, caseLabel + ': tail root is not brown');
      assert(tail.some(function (part) {
        return paletteEquals(part.palette, palettes.yellow) ||
          paletteEquals(part.palette, palettes.yellowHighlight) ||
          paletteEquals(part.palette, palettes.yellowShadow);
      }), caseLabel + ': lightning-bolt tail has no yellow segments');

      parts.forEach(function (part) {
        assert(part.palette && ['top', 'left', 'right'].every(function (face) {
          return typeof part.palette[face] === 'string' && part.palette[face].length > 0;
        }), caseLabel + ': part lacks a complete Canvas voxel palette');
      });
    }

    assert(typeof Renderer.prototype.drawVoxelPikachu === 'function',
      'Pikachu semantic draw helper is missing');
    assert(typeof Renderer.prototype.buildPikachuManifest === 'function',
      'Pikachu semantic manifest builder is missing');
    assert(typeof Renderer.prototype.drawVoxelChicken === 'function',
      'Historical chicken compatibility helper was unexpectedly removed');
    assert(Game.prototype.render.toString().indexOf('drawVoxelPikachu') >= 0,
      'Production Player phase does not dispatch Pikachu');
    assert(Game.prototype.render.toString().indexOf('drawVoxelChicken') < 0,
      'Production Player phase still contains chicken dispatch');

    var forbiddenAssetPattern = /drawImage|createImageBitmap|new\\s+Image|fetch\\s*\\(|XMLHttpRequest|WebGL|getContext\\s*\\(\\s*['\"]webgl|<img|https?:\\/\\//;
    assert(!forbiddenAssetPattern.test(__rendererSource),
      'Renderer introduces a non-Canvas voxel or external asset path');
    assert(!forbiddenAssetPattern.test(__gameSource),
      'Production dispatch introduces a non-Canvas voxel or external asset path');

    var game = new Game({
      visualSeed: 'property-1-production-model',
      random: function () { return 0; }
    });
    game.world.terrainRows.clear();
    game.clouds = Object.freeze([]);
    game.renderUI = function () {};

    var renderer = game.renderer;
    var originalPikachu = renderer.drawVoxelPikachu;
    var originalChicken = renderer.drawVoxelChicken;
    var originalStage2Model = renderer.drawStage2Model;
    var originalVoxelBlock = renderer.drawVoxelBlock;
    var semanticDispatches = [];
    var chickenDispatches = 0;
    var stageDispatches = [];
    var voxelCalls = [];

    renderer.drawVoxelPikachu = function (x, y, visualState) {
      var dispatch = { x: x, y: y, visualState: visualState, result: null };
      semanticDispatches.push(dispatch);
      __activePikachu = true;
      try {
        dispatch.result = originalPikachu.call(this, x, y, visualState);
        return dispatch.result;
      } finally {
        __activePikachu = false;
      }
    };
    renderer.drawVoxelChicken = function () {
      chickenDispatches++;
      throw new Error('Production Player phase dispatched the chicken');
    };
    renderer.drawStage2Model = function (x, y, parts, options) {
      if (__activePikachu) {
        stageDispatches.push({ x: x, y: y, parts: parts, options: options });
      }
      return originalStage2Model.call(this, x, y, parts, options);
    };
    renderer.drawVoxelBlock = function (x, y, width, depth, height, palette, elevation) {
      if (__activePikachu) {
        voxelCalls.push({
          x: x, y: y, width: width, depth: depth, height: height,
          palette: palette, elevation: elevation
        });
      }
      return originalVoxelBlock.call(
        this, x, y, width, depth, height, palette, elevation
      );
    };

    var facings = [
      Object.freeze({ dx: 0, dy: 1 }),
      Object.freeze({ dx: 1, dy: 0 }),
      Object.freeze({ dx: 0, dy: -1 }),
      Object.freeze({ dx: -1, dy: 0 })
    ];
    var caseCount = 128;
    var totalParts = 0;

    for (var caseIndex = 0; caseIndex < caseCount; caseIndex++) {
      var position = Object.freeze({
        x: (((caseIndex * 17) % 61) - 30) / 2,
        y: (((caseIndex * 29) % 257) - 128) / 4
      });
      var visualState = Object.freeze({
        facing: facings[caseIndex % facings.length],
        hopHeight: ((caseIndex * 13) % 41) / 40
      });
      assert(Number.isFinite(position.x) && Number.isFinite(position.y) &&
        Number.isFinite(visualState.hopHeight),
        'Deterministic generator produced a non-finite case');

      game.player.getCurrentPosition = function () { return position; };
      game.player.getVisualState = function () { return visualState; };

      var semanticStart = semanticDispatches.length;
      var stageStart = stageDispatches.length;
      var voxelStart = voxelCalls.length;
      var fillStart = __pikachuFillCount;
      var methodStart = __pikachuCanvasMethods.length;
      var stackDepth = __canvasStateStack.length;

      game.render();

      var caseLabel = 'case ' + caseIndex;
      assert(semanticDispatches.length === semanticStart + 1,
        caseLabel + ': production phase did not dispatch exactly one Pikachu');
      assert(chickenDispatches === 0,
        caseLabel + ': production phase dispatched a chicken');
      var semanticCall = semanticDispatches[semanticStart];
      assert(semanticCall.x === position.x && semanticCall.y === position.y &&
        semanticCall.visualState === visualState,
        caseLabel + ': production dispatch changed Player render input');
      assert(semanticCall.result === 1,
        caseLabel + ': production model did not return one semantic Pikachu');

      assert(stageDispatches.length === stageStart + 1,
        caseLabel + ': Pikachu did not use exactly one Stage 2 voxel model dispatch');
      var stageCall = stageDispatches[stageStart];
      assert(stageCall.x === position.x && stageCall.y === position.y,
        caseLabel + ': Stage 2 model origin changed');
      assertCompleteManifest(stageCall.parts, renderer, caseLabel);
      assert(stageCall.parts.length <= 32,
        caseLabel + ': Stage 2 dispatch exceeded 32 voxel parts');

      var caseVoxels = voxelCalls.length - voxelStart;
      var caseFills = __pikachuFillCount - fillStart;
      assert(caseVoxels === stageCall.parts.length,
        caseLabel + ': semantic parts did not map one-to-one to voxel calls');
      assert(caseFills === caseVoxels * 3,
        caseLabel + ': each voxel did not draw exactly three Canvas faces');
      assert(__canvasStateStack.length === stackDepth,
        caseLabel + ': Canvas state was not balanced');

      var caseMethods = __pikachuCanvasMethods.slice(methodStart);
      var allowedMethods = ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill'];
      assert(caseMethods.length > 0 && caseMethods.every(function (method) {
        return allowedMethods.indexOf(method) >= 0;
      }), caseLabel + ': model used a non-Canvas-voxel primitive');
      assert(caseMethods[0] === 'save' &&
        caseMethods[caseMethods.length - 1] === 'restore',
        caseLabel + ': Canvas voxel drawing was not state-guarded');

      totalParts += stageCall.parts.length;
    }

    assert(semanticDispatches.length === caseCount,
      'Expected exactly one semantic Pikachu dispatch in all 128 cases');
    assert(stageDispatches.length === caseCount,
      'Expected exactly one bounded model dispatch in all 128 cases');
    assert(chickenDispatches === 0,
      'Production rendering dispatched the compatibility chicken');
    assert(voxelCalls.length === totalParts && totalParts > 0,
      'Voxel instrumentation did not cover every semantic model part');
    assert(__pikachuFillCount === voxelCalls.length * 3,
      'Canvas face instrumentation did not cover every voxel face');
    assert(__contextRequests.length === 1 && __contextRequests[0] === '2d',
      'Renderer requested a context other than the existing Canvas 2D context');

    renderer.drawVoxelPikachu = originalPikachu;
    renderer.drawVoxelChicken = originalChicken;
    renderer.drawStage2Model = originalStage2Model;
    renderer.drawVoxelBlock = originalVoxelBlock;
  `;

  var __rendererSource = rendererSource;
  var __gameSource = gameSource;
  eval(source + '\n' + assertions);

  return 'PASS: ' + propertyLabel + '; 128 deterministic finite Player states, one Pikachu each, 0 chicken dispatches, complete <=32-part semantic manifests, and Canvas-only voxel faces';
}
