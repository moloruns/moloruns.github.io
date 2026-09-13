ObjC.import('Foundation');

// Feature: pokemon-reskin-and-pokeballs, Property 4: Malformed Pikachu parts fail locally
// **Validates: Requirements 1.6**

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const propertyLabel = 'Feature: pokemon-reskin-and-pokeballs, Property 4: Malformed Pikachu parts fail locally';
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const source = [
    readUtf8(root + '/player.js'),
    readUtf8(root + '/renderer.js')
  ].join('\n;\n');

  const assertions = `
    function assert(condition, message) {
      if (!condition) throw new Error(propertyLabel + ': ' + message);
    }

    function snapshot(value) {
      return JSON.stringify(value);
    }

    function deepFreeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
      return Object.freeze(value);
    }

    function validPart(caseIndex, ordinal, palette) {
      return Object.freeze({
        role: 'valid-' + caseIndex + '-' + ordinal,
        semantic: ordinal % 2 === 0 ? 'body' : 'feature',
        surface: ordinal % 2 === 0 ? 'center' : 'front',
        side: ordinal % 2 === 0 ? 'left' : 'right',
        x: 0.08 + ordinal * 0.17,
        y: 0.1 + ((caseIndex + ordinal) % 4) * 0.12,
        width: 0.1 + ordinal * 0.02,
        depth: 0.11 + ordinal * 0.015,
        height: 0.12 + ordinal * 0.025,
        elevation: ((caseIndex + ordinal) % 7) * 0.04,
        palette: palette
      });
    }

    function malformedPart(kind, template) {
      var part;
      switch (kind % 16) {
        case 0: return null;
        case 1: return 'not-a-part';
        case 2: return Object.assign({}, template, { role: '' });
        case 3: return Object.assign({}, template, { semantic: '' });
        case 4: return Object.assign({}, template, { x: NaN });
        case 5: return Object.assign({}, template, { y: Infinity });
        case 6: return Object.assign({}, template, { width: 0 });
        case 7: return Object.assign({}, template, { depth: -0.1 });
        case 8: return Object.assign({}, template, { height: 0 });
        case 9: return Object.assign({}, template, { elevation: -1 });
        case 10: return Object.assign({}, template, { elevation: NaN });
        case 11: return Object.assign({}, template, { palette: null });
        case 12: return Object.assign({}, template, {
          palette: { top: '', left: '#111111', right: '#222222' }
        });
        case 13: return Object.assign({}, template, {
          palette: { top: '#111111', left: 7, right: '#222222' }
        });
        case 14:
          part = Object.assign({}, template);
          delete part.role;
          return part;
        default:
          part = Object.assign({}, template);
          delete part.palette;
          return part;
      }
    }

    var renderer = new Renderer(__canvas);
    assert(typeof renderer.isValidPikachuPart === 'function',
      'Pikachu part validator is missing');
    assert(typeof renderer.drawVoxelPikachu === 'function',
      'Pikachu draw helper is missing');

    var originalBuildManifest = renderer.buildPikachuManifest;
    var originalDrawStage2Model = renderer.drawStage2Model;
    var originalDrawVoxelBlock = renderer.drawVoxelBlock;
    var stageCalls = [];
    var voxelCalls = [];

    renderer.drawStage2Model = function (x, y, parts, options) {
      stageCalls.push({ x: x, y: y, parts: parts.slice(), options: options });
      return originalDrawStage2Model.call(this, x, y, parts, options);
    };
    renderer.drawVoxelBlock = function () {
      voxelCalls.push(Array.prototype.slice.call(arguments));
      return originalDrawVoxelBlock.apply(this, arguments);
    };

    var caseCount = 128;
    var validPartsDrawn = 0;
    var malformedPartsOmitted = 0;
    var completedFrames = 0;

    for (var caseIndex = 0; caseIndex < caseCount; caseIndex++) {
      var player = new Player(
        (caseIndex % 31) - 15,
        caseIndex % 2 === 0 ? caseIndex : -caseIndex
      );
      if (caseIndex % 3 !== 0) {
        var directions = [
          { dx: 0, dy: 1 },
          { dx: 1, dy: 0 },
          { dx: 0, dy: -1 },
          { dx: -1, dy: 0 }
        ];
        var direction = directions[caseIndex % directions.length];
        player.move(direction.dx, direction.dy);
        player.update((caseIndex * 17) % 149);
      }

      var gameplayState = deepFreeze({
        state: caseIndex % 5 === 0 ? 'GAME_OVER' : 'PLAYING',
        score: caseIndex * 3,
        maxYReached: caseIndex,
        collision: caseIndex % 2 === 0 ? 'SAFE' : 'CAR_COLLISION',
        terrain: { retainedRows: 36, sequence: [caseIndex - 1, caseIndex, caseIndex + 1] },
        entities: [{ id: 'entity-' + caseIndex, x: caseIndex / 10, velocity: -0.01 }]
      });
      deepFreeze(player);

      var playerBefore = snapshot(player);
      var gameplayBefore = snapshot(gameplayState);
      var position = player.getCurrentPosition();
      var visualState = player.getVisualState();
      var palette = renderer.PALETTES.pikachu.yellow;
      var valid = [
        validPart(caseIndex, 0, palette),
        validPart(caseIndex, 1, renderer.PALETTES.pikachu.red),
        validPart(caseIndex, 2, renderer.PALETTES.pikachu.black),
        validPart(caseIndex, 3, renderer.PALETTES.pikachu.brown)
      ];
      var malformed = [
        malformedPart(caseIndex, valid[0]),
        malformedPart(caseIndex + 5, valid[1]),
        malformedPart(caseIndex + 11, valid[2]),
        malformedPart(caseIndex + 14, valid[3])
      ];
      var manifest = Object.freeze([
        malformed[0], valid[0], valid[1], malformed[1],
        valid[2], malformed[2], malformed[3], valid[3]
      ]);
      var expectedValid = manifest.filter(function (part) {
        return renderer.isValidPikachuPart(part);
      });
      var expectedMalformed = manifest.length - expectedValid.length;

      assert(expectedValid.length === 4 && expectedMalformed === 4,
        'case ' + caseIndex + ' is not a four-valid/four-malformed mixed manifest');

      renderer.buildPikachuManifest = function () { return manifest; };
      var stageStart = stageCalls.length;
      var voxelStart = voxelCalls.length;
      var fillStart = __fills.length;
      var saveStart = __saveCount;
      var restoreStart = __restoreCount;
      var frameCompleted = false;
      var semanticCount = 0;

      var executed = renderer.renderFramePhases({
        player: function () {
          semanticCount += renderer.drawVoxelPikachu(
            position.x,
            position.y,
            visualState
          );
        },
        ui: function () {
          frameCompleted = true;
        }
      });

      assert(frameCompleted && executed.join(',') === 'player,ui',
        'case ' + caseIndex + ' did not complete the frame after malformed parts');
      assert(semanticCount === 1,
        'case ' + caseIndex + ' did not render one semantic Pikachu from remaining parts');
      assert(stageCalls.length === stageStart + 1,
        'case ' + caseIndex + ' did not dispatch exactly one filtered model');

      var drawnParts = stageCalls[stageStart].parts;
      assert(drawnParts.length === expectedValid.length,
        'case ' + caseIndex + ' passed a malformed part to the model helper');
      expectedValid.forEach(function (part, index) {
        assert(drawnParts[index] === part,
          'case ' + caseIndex + ' did not preserve valid part ' + index);
      });
      malformed.forEach(function (part, index) {
        assert(drawnParts.indexOf(part) === -1,
          'case ' + caseIndex + ' rendered malformed part ' + index);
      });

      assert(voxelCalls.length === voxelStart + expectedValid.length,
        'case ' + caseIndex + ' did not draw every remaining valid part');
      assert(__fills.length === fillStart + expectedValid.length * 3,
        'case ' + caseIndex + ' did not complete Canvas voxel faces for valid parts');
      assert(__saveCount === saveStart + 1 && __restoreCount === restoreStart + 1 &&
        __saveCount === __restoreCount && __stack.length === 0,
        'case ' + caseIndex + ' leaked or unbalanced Canvas save/restore state');
      assert(snapshot(player) === playerBefore,
        'case ' + caseIndex + ' changed Player state');
      assert(snapshot(gameplayState) === gameplayBefore,
        'case ' + caseIndex + ' changed Gameplay State');

      validPartsDrawn += expectedValid.length;
      malformedPartsOmitted += expectedMalformed;
      completedFrames++;
    }

    renderer.buildPikachuManifest = originalBuildManifest;
    renderer.drawStage2Model = originalDrawStage2Model;
    renderer.drawVoxelBlock = originalDrawVoxelBlock;

    assert(completedFrames === caseCount,
      'not all deterministic malformed-part frames completed');
    assert(validPartsDrawn === caseCount * 4,
      'unexpected valid-part draw total');
    assert(malformedPartsOmitted === caseCount * 4,
      'unexpected malformed-part omission total');
    assert(__saveCount === __restoreCount && __stack.length === 0,
      'final Canvas state is unbalanced');
  `;

  var __fills = [];
  var __current = [];
  var __stack = [];
  var __saveCount = 0;
  var __restoreCount = 0;
  var __context = {
    fillStyle: '',
    globalAlpha: 1,
    clearRect: function () {},
    beginPath: function () { __current = []; },
    moveTo: function (x, y) { __current.push({ x: x, y: y }); },
    lineTo: function (x, y) { __current.push({ x: x, y: y }); },
    closePath: function () {},
    fill: function () { __fills.push(this.fillStyle); },
    save: function () {
      __saveCount++;
      __stack.push({ fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
    },
    restore: function () {
      __restoreCount++;
      var state = __stack.pop();
      if (!state) throw new Error('Canvas restore called without a matching save');
      this.fillStyle = state.fillStyle;
      this.globalAlpha = state.globalAlpha;
    }
  };
  var __canvas = {
    width: 800,
    height: 600,
    getContext: function () { return __context; }
  };

  eval(source + '\n' + assertions);
  return 'PASS: ' + propertyLabel + '; 128 deterministic mixed manifests, 512 malformed parts omitted, 512 valid parts drawn, 128 completed frames, balanced Canvas state, unchanged Player/Gameplay State';
}
