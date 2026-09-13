ObjC.import('Foundation');

// Feature: pokemon-reskin-and-pokeballs, Property 9: Retained-row ownership preserves cosmetic lifetime
// **Validates: Requirements 4.6, 4.7, 4.8, 5.2, 8.6**

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const propertyLabel = 'Feature: pokemon-reskin-and-pokeballs, Property 9: Retained-row ownership preserves cosmetic lifetime';
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
      if (!condition) throw new Error(message);
    }

    function canonical(value) {
      return JSON.stringify(value);
    }

    function incrementCount(counts, key) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    function selectionRandom(terrainType, caseIndex) {
      var selections = {
        GRASS: 0.10,
        ROAD: 0.50,
        RIVER: 0.80,
        TRAIN_TRACK: 0.95
      };
      var first = true;
      var state = (0xA341316C ^ Math.imul(caseIndex + 1, 0x9E3779B1)) >>> 0;

      return function () {
        if (first) {
          first = false;
          return selections[terrainType];
        }
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
      };
    }

    function findEligibleSeed(caseIndex, rowY, terrainType) {
      if (terrainType === 'RIVER') {
        return 'property-9-river-seed:' + caseIndex;
      }
      for (var attempt = 0; attempt < 10000; attempt++) {
        var visualSeed = 'property-9-seed:' + caseIndex + ':' + attempt;
        if (isPokeBallEligible(visualSeed, rowY, terrainType)) {
          return visualSeed;
        }
      }
      throw new Error('Unable to find deterministic eligible seed for case ' + caseIndex);
    }

    function installRenderStubs(game, renderCounts) {
      game.renderer.clear = function () {};
      game.renderer.centerCameraOnPlayer = function () {};
      game.renderer.renderFramePhases = function (phases) {
        phases.clouds();
        phases.terrain();
        phases.lowDecorations();
        phases.depthSortedScene();
        phases.sideOcclusion();
        phases.player();
        phases.ui();
      };
      game.renderer.drawCloud = function () {};
      game.renderer.drawTerrainSlab = function () {};
      game.renderer.drawTrainTrackDetails = function () {};
      game.renderer.drawWarningSignal = function () {};
      game.renderer.drawGrassDecoration = function () {};
      game.renderer.isWorldFootprintVisible = function () { return true; };
      game.renderer.getSideOcclusionLayout = function () { return null; };
      game.renderer.drawSideShoulders = function () {};
      game.renderer.drawVoxelCar = function () {};
      game.renderer.drawVoxelTrain = function () {};
      game.renderer.drawVoxelLog = function () {};
      game.renderer.drawVoxelLilyPad = function () {};
      game.renderer.drawBlockingProp = function () {};
      game.renderer.drawGroundShadow = function () {};
      game.renderer.drawVoxelPikachu = function () { return 1; };
      game.renderer.drawVoxelPokeBall = function (descriptor) {
        incrementCount(renderCounts, descriptor);
        return 1;
      };
    }

    function assertFrozenCosmetics(row, expectDescriptor, context) {
      assert(row && row.cosmetics, context + ': row has no cosmetic container');
      assert(Object.isFrozen(row.cosmetics),
        context + ': cosmetic container is not frozen');
      assert(Object.keys(row.cosmetics).length === 1 &&
        Object.prototype.hasOwnProperty.call(row.cosmetics, 'pokeBall'),
        context + ': cosmetic container is not the one-member row-owned shape');

      if (expectDescriptor) {
        assert(row.cosmetics.pokeBall !== null,
          context + ': eligible row did not receive a descriptor');
        assert(Object.isFrozen(row.cosmetics.pokeBall),
          context + ': descriptor is not frozen');
      } else {
        assert(row.cosmetics.pokeBall === null,
          context + ': River row received a descriptor');
      }
    }

    function createHistoricalRow(y, terrainType) {
      return {
        y: y,
        type: terrainType,
        obstacles: [],
        platforms: [],
        metadata: terrainType === 'TRAIN_TRACK'
          ? { warningLightOn: false }
          : {}
      };
    }

    var game = new Game({
      visualSeed: 'property-9-bootstrap',
      random: function () { return 0; }
    });
    game.world.terrainRows.clear();
    game.player.isMoving = false;
    game.player.animationProgress = 0;

    var attachCallsByRow = new Map();
    var generationCallsByRow = new Map();
    var renderCountsByDescriptor = new Map();
    var originalAttachRowCosmetics = attachRowCosmetics;
    var originalGeneratePokeBallDescriptor = generatePokeBallDescriptor;

    attachRowCosmetics = function (row, visualSeed) {
      incrementCount(attachCallsByRow, row);
      return originalAttachRowCosmetics(row, visualSeed);
    };
    generatePokeBallDescriptor = function (row, visualSeed) {
      incrementCount(generationCallsByRow, row);
      return originalGeneratePokeBallDescriptor(row, visualSeed);
    };

    installRenderStubs(game, renderCountsByDescriptor);

    var PROPERTY_CASE_COUNT = 128;
    var terrainTypes = ['GRASS', 'ROAD', 'RIVER', 'TRAIN_TRACK'];
    var terrainCoverage = {};
    var descriptorCases = 0;
    var nullOutcomeCases = 0;
    var historicalFixtureChecks = 0;
    var renderPasses = 0;

    for (var caseIndex = 0; caseIndex < PROPERTY_CASE_COUNT; caseIndex++) {
      var terrainType = terrainTypes[caseIndex % terrainTypes.length];
      var rowY = 1000 + caseIndex * 100;
      var visualSeed = findEligibleSeed(caseIndex, rowY, terrainType);
      var expectDescriptor = terrainType !== 'RIVER';
      var caseLabel = 'Property 9 case ' + caseIndex + ' (' + terrainType + ', y=' + rowY + ')';
      terrainCoverage[terrainType] = (terrainCoverage[terrainType] || 0) + 1;

      game.world.terrainRows.clear();
      game.visualSeed = visualSeed;
      game.gameState.state = 'PLAYING';
      game.gameState.score = (caseIndex * 17) % 401;
      game.gameState.maxYReached = 0;
      game.random = selectionRandom(terrainType, caseIndex);

      var createdRow = game.createTerrainRow(rowY);
      assert(createdRow.type === terrainType,
        caseLabel + ': controlled creation produced ' + createdRow.type);
      assert(!game.world.terrainRows.has(rowY),
        caseLabel + ': row entered World before creation-time attachment could be inspected');
      assert(attachCallsByRow.get(createdRow) === 1,
        caseLabel + ': creation boundary did not invoke attachment exactly once');
      assert(generationCallsByRow.get(createdRow) === 1,
        caseLabel + ': creation boundary did not derive the cosmetic outcome exactly once');
      assertFrozenCosmetics(createdRow, expectDescriptor, caseLabel + ' creation');

      var retainedContainer = createdRow.cosmetics;
      var retainedDescriptor = retainedContainer.pokeBall;
      var retainedValue = canonical(retainedDescriptor);
      if (retainedDescriptor === null) nullOutcomeCases++;
      else descriptorCases++;

      game.world.addTerrainRow(createdRow);
      assert(game.world.getTerrainAt(0, rowY) === createdRow,
        caseLabel + ': World did not retain the owner row identity');

      game.player.x = terrainType === 'RIVER' && createdRow.platforms.length > 0
        ? createdRow.platforms[0].x
        : 15;
      game.player.y = rowY;
      game.player.startPos = { x: game.player.x, y: rowY };
      game.player.targetPos = { x: game.player.x, y: rowY };

      game.update(0);
      game.updateMovingEntities(16 + (caseIndex % 17));
      assert(game.world.getTerrainAt(0, rowY) === createdRow,
        caseLabel + ': retained update replaced the owner row');
      assert(createdRow.cosmetics === retainedContainer,
        caseLabel + ': retained update replaced the frozen cosmetic container');
      assert(createdRow.cosmetics.pokeBall === retainedDescriptor,
        caseLabel + ': retained update rerolled or relocated the descriptor');
      assert(attachCallsByRow.get(createdRow) === 1 &&
        generationCallsByRow.get(createdRow) === 1,
        caseLabel + ': update regenerated cosmetic state');

      var drawsBeforeRender = retainedDescriptor === null
        ? 0
        : (renderCountsByDescriptor.get(retainedDescriptor) || 0);
      game.render();
      game.render();
      renderPasses += 2;
      assert(createdRow.cosmetics === retainedContainer &&
        createdRow.cosmetics.pokeBall === retainedDescriptor,
        caseLabel + ': render changed retained cosmetic reference identity');
      assert(attachCallsByRow.get(createdRow) === 1 &&
        generationCallsByRow.get(createdRow) === 1,
        caseLabel + ': render regenerated cosmetic state');
      if (retainedDescriptor !== null) {
        assert((renderCountsByDescriptor.get(retainedDescriptor) || 0) ===
          drawsBeforeRender + 2,
          caseLabel + ': retained descriptor was not read exactly once per render');
      }

      game.cleanupOldTerrain(rowY + GAMEPLAY_CONFIG.rowsBehind + 1);
      assert(!game.world.terrainRows.has(rowY) &&
        game.world.getTerrainAt(0, rowY) === null,
        caseLabel + ': cleanup did not remove cosmetic state with its owner row');
      assert(attachCallsByRow.get(createdRow) === 1 &&
        generationCallsByRow.get(createdRow) === 1,
        caseLabel + ': cleanup regenerated cosmetic state');

      game.world.terrainRows.clear();
      game.visualSeed = visualSeed;
      game.gameState.score = (caseIndex * 17) % 401;
      game.random = selectionRandom(terrainType, caseIndex);
      var regeneratedRow = game.createTerrainRow(rowY);
      assert(regeneratedRow !== createdRow,
        caseLabel + ': regeneration reused the cleaned owner row identity');
      assert(regeneratedRow.type === terrainType,
        caseLabel + ': regeneration changed terrain type');
      assert(attachCallsByRow.get(regeneratedRow) === 1 &&
        generationCallsByRow.get(regeneratedRow) === 1,
        caseLabel + ': regenerated row did not receive one creation-time outcome');
      assertFrozenCosmetics(regeneratedRow, expectDescriptor,
        caseLabel + ' regeneration');
      assert(regeneratedRow.cosmetics !== retainedContainer,
        caseLabel + ': regenerated row reused the cleaned cosmetic container identity');
      assert(canonical(regeneratedRow.cosmetics.pokeBall) === retainedValue,
        caseLabel + ': equivalent Cosmetic Key inputs changed descriptor value');
      if (retainedDescriptor !== null) {
        assert(regeneratedRow.cosmetics.pokeBall !== retainedDescriptor,
          caseLabel + ': regenerated row reused cleaned descriptor identity');
      }

      game.world.addTerrainRow(regeneratedRow);
      var regeneratedContainer = regeneratedRow.cosmetics;
      var regeneratedDescriptor = regeneratedContainer.pokeBall;
      var regeneratedGenerationCount = generationCallsByRow.get(regeneratedRow);
      game.render();
      renderPasses++;
      assert(regeneratedRow.cosmetics === regeneratedContainer &&
        regeneratedRow.cosmetics.pokeBall === regeneratedDescriptor,
        caseLabel + ': regenerated retained row lost reference identity during render');
      assert(generationCallsByRow.get(regeneratedRow) === regeneratedGenerationCount,
        caseLabel + ': regenerated row rerolled during render');
      game.cleanupOldTerrain(rowY + GAMEPLAY_CONFIG.rowsBehind + 1);
      assert(!game.world.terrainRows.has(rowY),
        caseLabel + ': regenerated owner row did not clean up');

      var historicalRow = createHistoricalRow(rowY + 50000, terrainType);
      var historicalSnapshot = canonical(historicalRow);
      var attachCountBeforeHistoricalRender = attachCallsByRow.get(historicalRow) || 0;
      var generationCountBeforeHistoricalRender = generationCallsByRow.get(historicalRow) || 0;
      assert(!Object.prototype.hasOwnProperty.call(historicalRow, 'cosmetics') &&
        !Object.prototype.hasOwnProperty.call(historicalRow, 'decorations'),
        caseLabel + ': historical fixture unexpectedly had feature fields');
      assert(game.getValidPokeBallDescriptor(historicalRow) === null,
        caseLabel + ': historical row without cosmetics did not read as no Poké Ball');

      game.world.terrainRows.clear();
      game.world.addTerrainRow(historicalRow);
      game.render();
      renderPasses++;
      assert(canonical(historicalRow) === historicalSnapshot,
        caseLabel + ': rendering mutated a historical fixture');
      assert(!Object.prototype.hasOwnProperty.call(historicalRow, 'cosmetics') &&
        !Object.prototype.hasOwnProperty.call(historicalRow, 'decorations'),
        caseLabel + ': rendering migrated a historical fixture in place');
      assert((attachCallsByRow.get(historicalRow) || 0) === attachCountBeforeHistoricalRender &&
        (generationCallsByRow.get(historicalRow) || 0) === generationCountBeforeHistoricalRender,
        caseLabel + ': historical rendering attempted cosmetic attachment or generation');
      historicalFixtureChecks++;
      game.world.terrainRows.clear();
    }

    terrainTypes.forEach(function (terrainType) {
      assert(terrainCoverage[terrainType] === PROPERTY_CASE_COUNT / terrainTypes.length,
        'Property 9 did not evenly cover ' + terrainType);
    });
    assert(descriptorCases === 96,
      'Expected 96 eligible retained-row descriptor cases, got ' + descriptorCases);
    assert(nullOutcomeCases === 32,
      'Expected 32 River null-outcome cases, got ' + nullOutcomeCases);
    assert(historicalFixtureChecks === PROPERTY_CASE_COUNT,
      'Historical fixture compatibility did not run for every sequence');
    assert(renderPasses === PROPERTY_CASE_COUNT * 4,
      'Each sequence did not execute retained, regenerated, and historical renders');

    return 'PASS: Feature: pokemon-reskin-and-pokeballs, Property 9: Retained-row ownership preserves cosmetic lifetime; ' +
      PROPERTY_CASE_COUNT + ' deterministic creation/update/render/cleanup/regeneration sequences, ' +
      descriptorCases + ' frozen descriptor lifecycles, ' + nullOutcomeCases +
      ' River null outcomes, and ' + historicalFixtureChecks +
      ' historical fixtures preserved';
  `;

  var __stack = [];
  var __context = {
    fillStyle: '', globalAlpha: 1, font: '', textAlign: '',
    clearRect: function () {}, fillRect: function () {}, fillText: function () {},
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    closePath: function () {}, fill: function () {},
    save: function () {
      __stack.push({ fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
    },
    restore: function () {
      var state = __stack.pop();
      if (state) {
        this.fillStyle = state.fillStyle;
        this.globalAlpha = state.globalAlpha;
      }
    }
  };
  var __canvas = {
    width: 800,
    height: 600,
    getContext: function () { return __context; }
  };
  var console = { log: function () {}, error: function () {} };
  var document = {
    getElementById: function (id) { return id === 'gameCanvas' ? __canvas : null; }
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

  return eval('(function () {\n' + source + '\n;\n' + assertions + '\n})()');
}
