ObjC.import('Foundation');

// Feature: pokemon-reskin-and-pokeballs, Property 12: Poké Ball rendering is safe and non-mutating
// **Validates: Requirements 6.5, 6.6, 8.9**

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const propertyLabel = 'Feature: pokemon-reskin-and-pokeballs, Property 12: Poké Ball rendering is safe and non-mutating';
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const scripts = [
    'player.js', 'world.js', 'generator.js', 'collision.js',
    'renderer.js', 'input.js', 'game.js'
  ];
  const source = scripts.map(function (script) {
    return readUtf8(root + '/' + script);
  }).join('\n;\n');

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

    function descriptor(y, terrainType, x, variant) {
      return deepFreeze({
        id: 'pokeball:' + y,
        type: 'POKE_BALL',
        x: x,
        y: y,
        terrainType: terrainType,
        blocking: false,
        variant: variant,
        schemaVersion: 1
      });
    }

    function copyDescriptor(value, changes) {
      var copy = {
        id: value.id,
        type: value.type,
        x: value.x,
        y: value.y,
        terrainType: value.terrainType,
        blocking: value.blocking,
        variant: value.variant,
        schemaVersion: value.schemaVersion
      };
      Object.keys(changes || {}).forEach(function (key) {
        copy[key] = changes[key];
      });
      return copy;
    }

    function decoration(y, x, blocking) {
      return {
        id: 'decoration:' + y + ':' + x,
        type: blocking ? 'TREE' : 'FLOWER',
        x: x,
        y: y,
        blocking: blocking,
        variant: 0,
        paletteIndex: 0
      };
    }

    function makeMalformedInput(caseIndex, y, terrainType, x) {
      var mode = caseIndex % 20;
      var base = descriptor(y, terrainType, x, caseIndex % 3);
      var value;
      var decorations = [];
      var omitDecorations = false;

      switch (mode) {
        case 0:
          value = null;
          break;
        case 1:
          value = [];
          break;
        case 2:
          value = copyDescriptor(base, { schemaVersion: 2 });
          break;
        case 3:
          value = copyDescriptor(base, { type: 'POKEBALL' });
          break;
        case 4:
          value = copyDescriptor(base, { blocking: true });
          break;
        case 5:
          value = copyDescriptor(base, { x: -16 });
          break;
        case 6:
          value = copyDescriptor(base, { x: 16 });
          break;
        case 7:
          value = copyDescriptor(base, { x: 0.5 });
          break;
        case 8:
          value = copyDescriptor(base, { y: Infinity, id: 'pokeball:Infinity' });
          break;
        case 9:
          value = copyDescriptor(base, { y: y + 1, id: 'pokeball:' + (y + 1) });
          break;
        case 10:
          value = copyDescriptor(base, { terrainType: 'RIVER' });
          break;
        case 11:
          value = copyDescriptor(base, { variant: -1 });
          break;
        case 12:
          value = copyDescriptor(base, { variant: 3 });
          break;
        case 13:
          value = copyDescriptor(base, { variant: 0.5 });
          break;
        case 14:
          value = copyDescriptor(base, { id: 'pokeball:' + (y + 50) });
          break;
        case 15:
          value = copyDescriptor(base, { collected: false });
          break;
        case 16:
          value = copyDescriptor(base, {});
          delete value.variant;
          break;
        case 17:
          value = base;
          decorations = [decoration(y, x, false)];
          break;
        case 18:
          value = base;
          decorations = [decoration(y, x === 15 ? 14 : x + 1, false)];
          decorations[0].blocking = 'not-a-boolean';
          break;
        default:
          value = base;
          omitDecorations = true;
          break;
      }

      return {
        mode: mode,
        descriptor: deepFreeze(value),
        decorations: deepFreeze(decorations),
        omitDecorations: omitDecorations,
        rendererCount: mode >= 17 ? 1 : 0
      };
    }

    function makeRow(y, terrainType, pokeBall, decorations, options) {
      var settings = options || {};
      var row = {
        y: y,
        type: terrainType,
        obstacles: settings.obstacles || [],
        platforms: settings.platforms || [],
        metadata: settings.metadata || { fixture: 'property-12' },
        cosmetics: Object.freeze({ pokeBall: pokeBall })
      };
      if (!settings.omitDecorations) row.decorations = decorations || [];
      return deepFreeze(row);
    }

    var renderer = new Renderer(__canvas);
    assert(typeof renderer.drawVoxelPokeBall === 'function',
      'Poké Ball draw helper is missing');
    assert(typeof renderer.validatePokeBallDescriptor === 'function',
      'Poké Ball descriptor validator is missing');
    assert(typeof Game.prototype.getValidPokeBallDescriptor === 'function',
      'Game descriptor guard is missing');
    assert(typeof Game.prototype.renderObstaclesAndPlatforms === 'function',
      'Game scene renderer is missing');

    var originalPokeBallDraw = renderer.drawVoxelPokeBall;
    var activeSceneEvents = null;
    renderer.drawVoxelPokeBall = function (value, ownerRow) {
      if (activeSceneEvents) activeSceneEvents.push('pokeball:' + ownerRow.y);
      return originalPokeBallDraw.call(this, value, ownerRow);
    };
    renderer.drawVoxelCar = function (car) {
      if (activeSceneEvents) activeSceneEvents.push('car:' + car.y);
      return 1;
    };

    var originalMathRandom = Math.random;
    var activeMathTrace = null;
    var caseCount = 128;
    var validVisibleObjects = 0;
    var malformedSceneOmissions = 0;
    var offCanvasSceneOmissions = 0;
    var laterSceneItems = 0;
    var directOneMappings = 0;
    var directZeroMappings = 0;

    try {
      Math.random = function () {
        activeMathTrace.push('Math.random');
        return 0.5;
      };

      for (var caseIndex = 0; caseIndex < caseCount; caseIndex++) {
        var terrainTypes = ['GRASS', 'ROAD', 'TRAIN_TRACK'];
        var validType = terrainTypes[caseIndex % terrainTypes.length];
        var malformedType = terrainTypes[(caseIndex + 1) % terrainTypes.length];
        var offCanvasType = terrainTypes[(caseIndex + 2) % terrainTypes.length];
        var validX = (caseIndex % 17) - 8;
        var malformedX = ((caseIndex * 5) % 17) - 8;
        var offCanvasX = (caseIndex % 31) - 15;
        var visibleDescriptor = descriptor(2, validType, validX, caseIndex % 3);
        var malformedInput = makeMalformedInput(
          caseIndex,
          1,
          malformedType,
          malformedX
        );
        var distantY = 10000 + caseIndex;
        var offCanvasDescriptor = descriptor(
          distantY,
          offCanvasType,
          offCanvasX,
          (caseIndex + 1) % 3
        );

        var visibleRow = makeRow(2, validType, visibleDescriptor, []);
        var malformedRow = makeRow(
          1,
          malformedType,
          malformedInput.descriptor,
          malformedInput.decorations,
          { omitDecorations: malformedInput.omitDecorations }
        );
        var offCanvasRow = makeRow(
          distantY,
          offCanvasType,
          offCanvasDescriptor,
          []
        );
        var car = deepFreeze({
          id: 'later-car-' + caseIndex,
          type: 'CAR',
          x: 0,
          y: 0,
          width: 2,
          velocity: caseIndex % 2 === 0 ? 0.01 : -0.01,
          visual: { paletteIndex: caseIndex % 6 }
        });
        var laterRow = makeRow(0, 'ROAD', null, [], {
          obstacles: [car],
          metadata: { direction: 1, lockedRowSpeed: 0.01 }
        });

        assert(Object.isFrozen(visibleDescriptor) &&
          Object.isFrozen(offCanvasDescriptor),
          'case ' + caseIndex + ' did not freeze valid descriptors');
        if (malformedInput.descriptor &&
            typeof malformedInput.descriptor === 'object') {
          assert(Object.isFrozen(malformedInput.descriptor),
            'case ' + caseIndex + ' did not freeze malformed descriptor input');
        }
        [visibleRow, malformedRow, offCanvasRow, laterRow].forEach(
          function (row, rowIndex) {
            assert(Object.isFrozen(row) && Object.isFrozen(row.cosmetics),
              'case ' + caseIndex + ' row/cosmetic state ' + rowIndex +
              ' is not frozen');
          });

        var gameRandomTrace = Object.freeze(['game-seed:' + caseIndex]);
        activeMathTrace = Object.freeze(['math-seed:' + caseIndex]);
        var game = Object.create(Game.prototype);
        game.renderer = renderer;
        game.random = function () {
          gameRandomTrace.push('Game.random');
          return 0.5;
        };
        game.world = {
          terrainRows: new Map([
            [2, visibleRow],
            [1, malformedRow],
            [distantY, offCanvasRow],
            [0, laterRow]
          ])
        };
        game.gameState = deepFreeze({
          state: caseIndex % 7 === 0 ? 'GAME_OVER' : 'PLAYING',
          score: caseIndex * 3,
          maxYReached: caseIndex,
          lastFrameTime: caseIndex * 16
        });
        var gameplayState = deepFreeze({
          player: {
            x: (caseIndex % 31) - 15,
            y: caseIndex,
            facing: { dx: 0, dy: 1 },
            isJumping: false
          },
          collision: caseIndex % 2 === 0 ? 'SAFE' : 'CAR_COLLISION',
          inventory: [],
          collected: [],
          soundCalls: [],
          animationTriggers: [],
          trainLifecycle: { phase: 'IDLE', completedEvents: caseIndex % 4 }
        });

        renderer.cameraX = (caseIndex % 7) - 3;
        renderer.cameraY = (caseIndex % 5) - 2;
        __context.fillStyle = '#case-' + caseIndex;
        __context.globalAlpha = 0.35 + (caseIndex % 5) * 0.1;

        var descriptorsBefore = snapshot({
          visible: visibleDescriptor,
          malformed: malformedInput.descriptor,
          offCanvas: offCanvasDescriptor
        });
        var cosmeticStateBefore = snapshot({
          visible: visibleRow.cosmetics,
          malformed: malformedRow.cosmetics,
          offCanvas: offCanvasRow.cosmetics,
          later: laterRow.cosmetics
        });
        var worldBefore = snapshot(Array.from(game.world.terrainRows.values()));
        var gameStateBefore = snapshot(game.gameState);
        var gameplayBefore = snapshot(gameplayState);
        var cameraBefore = snapshot({ x: renderer.cameraX, y: renderer.cameraY });
        var mathTraceBefore = snapshot(activeMathTrace);
        var gameTraceBefore = snapshot(gameRandomTrace);
        var canvasBefore = snapshot({
          fillStyle: __context.fillStyle,
          globalAlpha: __context.globalAlpha
        });

        var saveStart = __saveCount;
        var restoreStart = __restoreCount;
        var visibleDirect = renderer.drawVoxelPokeBall(visibleDescriptor, visibleRow);
        var malformedDirect = renderer.drawVoxelPokeBall(
          malformedInput.descriptor,
          malformedRow
        );
        var offCanvasDirect = renderer.drawVoxelPokeBall(
          offCanvasDescriptor,
          offCanvasRow
        );
        assert(visibleDirect === 1,
          'case ' + caseIndex + ' valid descriptor did not map to one object');
        assert(malformedDirect === malformedInput.rendererCount,
          'case ' + caseIndex + ' malformed/owner-invalid input mapped to ' +
          malformedDirect + ' objects instead of ' + malformedInput.rendererCount);
        assert(offCanvasDirect === 1,
          'case ' + caseIndex + ' valid off-canvas descriptor was not a valid one-object model before culling');
        directOneMappings += visibleDirect + malformedDirect + offCanvasDirect;
        if (malformedDirect === 0) directZeroMappings++;

        activeSceneEvents = [];
        var sceneSaveStart = __saveCount;
        var sceneRestoreStart = __restoreCount;
        game.renderObstaclesAndPlatforms();
        assert(activeSceneEvents.length === 2 &&
          activeSceneEvents[0] === 'pokeball:2' &&
          activeSceneEvents[1] === 'car:0',
          'case ' + caseIndex + ' did not omit unsafe inputs and continue to the later scene item: ' +
          activeSceneEvents.join(','));
        assert(__saveCount === sceneSaveStart + 1 &&
          __restoreCount === sceneRestoreStart + 1,
          'case ' + caseIndex + ' scene did not draw exactly one Canvas-state-guarded Poké Ball');
        activeSceneEvents = null;

        assert(__saveCount === __restoreCount && __stack.length === 0,
          'case ' + caseIndex + ' leaked Canvas save/restore state');
        assert(__saveCount > saveStart && __restoreCount > restoreStart,
          'case ' + caseIndex + ' did not exercise the real Canvas draw path');
        assert(snapshot({
          fillStyle: __context.fillStyle,
          globalAlpha: __context.globalAlpha
        }) === canvasBefore,
          'case ' + caseIndex + ' leaked Canvas drawing state');
        assert(snapshot({
          visible: visibleDescriptor,
          malformed: malformedInput.descriptor,
          offCanvas: offCanvasDescriptor
        }) === descriptorsBefore,
          'case ' + caseIndex + ' mutated a descriptor');
        assert(snapshot({
          visible: visibleRow.cosmetics,
          malformed: malformedRow.cosmetics,
          offCanvas: offCanvasRow.cosmetics,
          later: laterRow.cosmetics
        }) === cosmeticStateBefore,
          'case ' + caseIndex + ' mutated Cosmetic State');
        assert(snapshot(Array.from(game.world.terrainRows.values())) === worldBefore,
          'case ' + caseIndex + ' mutated row-owned World data');
        assert(snapshot(game.gameState) === gameStateBefore &&
          snapshot(gameplayState) === gameplayBefore,
          'case ' + caseIndex + ' mutated Gameplay State');
        assert(snapshot({ x: renderer.cameraX, y: renderer.cameraY }) === cameraBefore,
          'case ' + caseIndex + ' mutated camera state');
        assert(snapshot(activeMathTrace) === mathTraceBefore &&
          snapshot(gameRandomTrace) === gameTraceBefore,
          'case ' + caseIndex + ' consumed or changed a random trace');

        validVisibleObjects++;
        malformedSceneOmissions++;
        offCanvasSceneOmissions++;
        laterSceneItems++;
      }
    } finally {
      Math.random = originalMathRandom;
      activeSceneEvents = null;
    }

    assert(validVisibleObjects === caseCount,
      'not every valid visible descriptor produced one scene object');
    assert(malformedSceneOmissions === caseCount,
      'not every malformed descriptor was safely omitted from the scene');
    assert(offCanvasSceneOmissions === caseCount,
      'not every off-canvas descriptor was culled from the scene');
    assert(laterSceneItems === caseCount,
      'not every later scene item rendered after unsafe omission');
    assert(directOneMappings === 128 * 2 + 18,
      'unexpected direct one-object mapping total: ' + directOneMappings);
    assert(directZeroMappings === 110,
      'unexpected direct zero-object mapping total: ' + directZeroMappings);
    assert(__saveCount === __restoreCount && __stack.length === 0,
      'final Canvas state is unbalanced');
  `;

  var __fills = [];
  var __currentPath = [];
  var __stack = [];
  var __saveCount = 0;
  var __restoreCount = 0;
  var __context = {
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: '',
    clearRect: function () {},
    fillRect: function () {},
    fillText: function () {},
    beginPath: function () { __currentPath = []; },
    moveTo: function (x, y) { __currentPath.push({ x: x, y: y }); },
    lineTo: function (x, y) { __currentPath.push({ x: x, y: y }); },
    closePath: function () {},
    fill: function () { __fills.push(this.fillStyle); },
    save: function () {
      __saveCount++;
      __stack.push({
        fillStyle: this.fillStyle,
        globalAlpha: this.globalAlpha,
        font: this.font,
        textAlign: this.textAlign
      });
    },
    restore: function () {
      __restoreCount++;
      var state = __stack.pop();
      if (!state) throw new Error('Canvas restore called without a matching save');
      this.fillStyle = state.fillStyle;
      this.globalAlpha = state.globalAlpha;
      this.font = state.font;
      this.textAlign = state.textAlign;
    }
  };
  var __canvas = {
    width: 800,
    height: 600,
    getContext: function (kind) {
      if (kind !== '2d') throw new Error('Unexpected Canvas context: ' + kind);
      return __context;
    }
  };
  var console = { log: function () {}, error: function () {} };
  var document = {
    getElementById: function (id) {
      return id === 'gameCanvas' ? __canvas : null;
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

  eval(source + '\n' + assertions);
  return 'PASS: ' + propertyLabel + '; 128 deterministic valid/malformed/off-canvas mixtures; 128 valid visible objects, 128 malformed omissions, 128 off-canvas omissions, 128 later scene items; balanced Canvas state; frozen descriptors, Cosmetic State, Gameplay State, camera state, and random traces unchanged';
}
