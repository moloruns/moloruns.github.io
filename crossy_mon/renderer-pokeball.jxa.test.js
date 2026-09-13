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
    function snapshot(value) { return JSON.stringify(value); }
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

    var renderer = new Renderer(__canvas);
    assert(typeof renderer.validatePokeBallDescriptor === 'function',
      'Poké Ball descriptor validator is missing');
    assert(typeof renderer.getPokeBallContrastPalette === 'function',
      'Poké Ball contrast palette selector is missing');
    assert(typeof renderer.buildPokeBallManifest === 'function',
      'Poké Ball manifest builder is missing');
    assert(typeof renderer.drawVoxelPokeBall === 'function',
      'Poké Ball draw helper is missing');

    var terrainTypes = ['GRASS', 'ROAD', 'TRAIN_TRACK'];
    var paletteSignatures = {};
    terrainTypes.forEach(function (terrainType) {
      var treatment = renderer.getPokeBallContrastPalette(terrainType);
      assert(treatment && Object.isFrozen(treatment),
        terrainType + ' contrast treatment is missing or mutable');
      ['red', 'white', 'band', 'buttonHousing', 'button', 'highlight'].forEach(function (name) {
        var palette = treatment[name];
        assert(palette && Object.isFrozen(palette),
          terrainType + ' ' + name + ' palette is missing or mutable');
        ['top', 'left', 'right'].forEach(function (face) {
          assert(typeof palette[face] === 'string' && palette[face].length > 0,
            terrainType + ' ' + name + ' palette is missing ' + face);
        });
      });
      assert(treatment.red.top !== treatment.white.top &&
        treatment.white.top !== treatment.band.top &&
        treatment.band.top !== treatment.button.top,
        terrainType + ' required Poké Ball regions are not contrasting');
      paletteSignatures[terrainType] = snapshot(treatment);
    });
    assert(paletteSignatures.GRASS !== paletteSignatures.ROAD &&
      paletteSignatures.ROAD !== paletteSignatures.TRAIN_TRACK &&
      paletteSignatures.GRASS !== paletteSignatures.TRAIN_TRACK,
      'Eligible terrains do not have distinct fixed contrast treatments');
    assert(renderer.getPokeBallContrastPalette('RIVER') === null,
      'RIVER unexpectedly has a Poké Ball contrast treatment');

    var originalRandom = Math.random;
    Math.random = function () { throw new Error('Poké Ball rendering consumed randomness'); };
    var originalDrawStage2Model = renderer.drawStage2Model;
    var drawCalls = [];
    renderer.drawStage2Model = function (x, y, parts, options) {
      drawCalls.push({ x: x, y: y, parts: parts, options: options });
      return parts.length;
    };

    var caseCount = 0;
    terrainTypes.forEach(function (terrainType, terrainIndex) {
      for (var variant = 0; variant < 3; variant++) {
        for (var x = -15; x <= 15; x += 2) {
          var rowY = -90 + caseCount;
          var owner = Object.freeze({ y: rowY, type: terrainType });
          var value = descriptor(rowY, terrainType, x, variant);
          var beforeDescriptor = snapshot(value);
          var beforeOwner = snapshot(owner);
          var validated = renderer.validatePokeBallDescriptor(value, owner);
          assert(validated === value, 'Valid descriptor identity was not preserved');

          var manifest = renderer.buildPokeBallManifest(value, owner);
          assert(Object.isFrozen(manifest) && manifest.length >= 7 && manifest.length <= 10,
            'Poké Ball manifest is not frozen and bounded to ten parts');
          assert(manifest.every(function (part) {
            return Object.isFrozen(part) && renderer.isValidPokeBallPart(part) &&
              part.x >= 0 && part.y >= 0 && part.x + part.width <= 1 &&
              part.y + part.depth <= 1;
          }), 'Poké Ball manifest contains a mutable, malformed, or out-of-cell part');

          var semantics = manifest.map(function (part) { return part.semantic; });
          ['upperHalf', 'lowerHalf', 'centerBand', 'buttonHousing', 'centerButton'].forEach(
            function (semantic) {
              assert(semantics.indexOf(semantic) >= 0,
                'Poké Ball manifest is missing ' + semantic);
            });
          assert(semantics.filter(function (semantic) { return semantic === 'upperHalf'; }).length >= 2 &&
            semantics.filter(function (semantic) { return semantic === 'lowerHalf'; }).length >= 2,
            'Poké Ball upper or lower body mass is incomplete');

          var callStart = drawCalls.length;
          assert(renderer.drawVoxelPokeBall(value, owner) === 1,
            'Valid descriptor did not map to exactly one semantic object');
          assert(drawCalls.length === callStart + 1,
            'Valid descriptor did not dispatch exactly one bounded model');
          var call = drawCalls[callStart];
          assert(call.x === x && call.y === rowY && call.parts.length === manifest.length,
            'Poké Ball draw changed descriptor coordinates or part count');
          assert(call.options.elevation === renderer.TERRAIN_HEIGHT + 0.02,
            'Poké Ball model is not ground-anchored above the terrain slab');
          assert(snapshot(value) === beforeDescriptor && snapshot(owner) === beforeOwner,
            'Poké Ball validation or drawing mutated descriptor/owner state');
          caseCount++;
        }
      }
    });
    assert(caseCount === 144,
      'Focused validation did not cover the expected 144 eligible descriptor cases');

    var baseline = {
      id: 'pokeball:7', type: 'POKE_BALL', x: 0, y: 7,
      terrainType: 'GRASS', blocking: false, variant: 0, schemaVersion: 1
    };
    var malformed = [
      null,
      [],
      Object.assign({}, baseline, { schemaVersion: 2 }),
      Object.assign({}, baseline, { type: 'POKEBALL' }),
      Object.assign({}, baseline, { blocking: true }),
      Object.assign({}, baseline, { x: -16 }),
      Object.assign({}, baseline, { x: 16 }),
      Object.assign({}, baseline, { x: 0.5 }),
      Object.assign({}, baseline, { y: Infinity }),
      Object.assign({}, baseline, { terrainType: 'RIVER' }),
      Object.assign({}, baseline, { variant: -1 }),
      Object.assign({}, baseline, { variant: 3 }),
      Object.assign({}, baseline, { variant: 0.5 }),
      Object.assign({}, baseline, { id: 'pokeball:8' }),
      Object.assign({}, baseline, { collected: false })
    ];
    malformed.forEach(function (value, index) {
      var callStart = drawCalls.length;
      assert(renderer.validatePokeBallDescriptor(value, { y: 7, type: 'GRASS' }) === null,
        'Malformed descriptor ' + index + ' passed validation');
      assert(renderer.drawVoxelPokeBall(value, { y: 7, type: 'GRASS' }) === 0 &&
        drawCalls.length === callStart,
        'Malformed descriptor ' + index + ' was not a zero-count draw no-op');
    });

    var valid = descriptor(7, 'GRASS', 0, 0);
    [
      null,
      { y: 8, type: 'GRASS' },
      { y: 7, type: 'ROAD' },
      { y: 7.5, type: 'GRASS' },
      { y: 7, type: 'RIVER' }
    ].forEach(function (owner, index) {
      var callStart = drawCalls.length;
      assert(renderer.validatePokeBallDescriptor(valid, owner) === null,
        'Malformed/mismatched owner ' + index + ' passed validation');
      assert(renderer.drawVoxelPokeBall(valid, owner) === 0 && drawCalls.length === callStart,
        'Malformed/mismatched owner ' + index + ' was not safely omitted');
    });
    assert(renderer.drawVoxelPokeBall(valid) === 1,
      'Validated descriptor-only drawing is not supported at the renderer boundary');

    renderer.drawStage2Model = originalDrawStage2Model;
    Math.random = originalRandom;
    var actual = descriptor(12, 'TRAIN_TRACK', 3, 0);
    var actualBefore = snapshot(actual);
    assert(renderer.drawVoxelPokeBall(actual, { y: 12, type: 'TRAIN_TRACK' }) === 1,
      'Real Canvas voxel path did not draw one valid Poké Ball');
    assert(__fills.length === 21,
      'Seven-part Poké Ball did not use exactly three Canvas faces per voxel');
    assert(snapshot(actual) === actualBefore,
      'Real Canvas voxel path mutated the descriptor');
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
  return 'PASS: Poké Ball schema/owner validation, 144 eligible draws, <=10-part manifests, terrain contrast, malformed omission, Canvas voxels, and non-mutation';
}
