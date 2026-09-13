ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const generatorSource = readUtf8(root + '/generator.js');

  const assertions = `
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    function assertEqualJson(actual, expected, message) {
      var actualJson = JSON.stringify(actual);
      var expectedJson = JSON.stringify(expected);
      if (actualJson !== expectedJson) {
        throw new Error(message + '\\nexpected: ' + expectedJson + '\\nactual:   ' + actualJson);
      }
    }

    function createTaggedGameplayRandom(seed) {
      var state = seed >>> 0;
      var trace = [];

      function nextValue() {
        state = (state + 0x6D2B79F5) >>> 0;
        var value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      }

      return {
        trace: trace,
        forConsumer: function (consumer) {
          return function () {
            var sampledValue = nextValue();
            trace.push({
              call: trace.length,
              consumer: consumer,
              value: sampledValue
            });
            return sampledValue;
          };
        }
      };
    }

    function cloneGameplayValue(value) {
      if (Array.isArray(value)) {
        return value.map(cloneGameplayValue);
      }
      if (!value || typeof value !== 'object') {
        return value;
      }

      var result = {};
      Object.keys(value).forEach(function (key) {
        result[key] = cloneGameplayValue(value[key]);
      });
      return result;
    }

    function withoutPickupState(row) {
      var result = {};
      Object.keys(row).forEach(function (key) {
        if (key !== 'cosmetics') {
          result[key] = cloneGameplayValue(row[key]);
        }
      });
      return result;
    }

    function attachPickupStateWithRandomForbidden(row, visualSeed) {
      var originalMathRandom = Math.random;
      Math.random = function () {
        throw new Error('Pickup State generation consumed Math.random');
      };
      try {
        return attachRowPickupState(row, visualSeed);
      } finally {
        Math.random = originalMathRandom;
      }
    }

    var supportedPickupTypes = [
      'POKE_BALL',
      'GREAT_BALL',
      'QUICK_BALL',
      'HEAVY_BALL'
    ];

    function inspectInitialPickupState(row, typeCounts, caseLabel) {
      assert(Object.prototype.hasOwnProperty.call(row, 'cosmetics'),
        caseLabel + ' did not attach row Pickup State');

      var pickupState = row.cosmetics;
      assert(pickupState && typeof pickupState === 'object' &&
        !Array.isArray(pickupState),
      caseLabel + ' attached a malformed Pickup State container');
      assert(Object.keys(pickupState).length === 2 &&
        Object.prototype.hasOwnProperty.call(pickupState, 'descriptor') &&
        Object.prototype.hasOwnProperty.call(pickupState, 'consumed'),
      caseLabel + ' attached fields outside { descriptor, consumed }');
      assert(pickupState.consumed === false,
        caseLabel + ' did not begin as an unconsumed Pickup State');

      if (pickupState.descriptor === null) {
        return 0;
      }

      var descriptor = pickupState.descriptor;
      assert(descriptor && typeof descriptor === 'object' &&
        !Array.isArray(descriptor) && Object.isFrozen(descriptor),
      caseLabel + ' attached a mutable or malformed Pickup Descriptor');
      assert(supportedPickupTypes.indexOf(descriptor.type) >= 0,
        caseLabel + ' generated unsupported Pickup Type ' + descriptor.type);
      assert(row.type === 'GRASS' || row.type === 'ROAD' ||
        row.type === 'TRAIN_TRACK',
      caseLabel + ' generated a Pickup Descriptor on ' + row.type);
      assert(descriptor.y === row.y && descriptor.terrainType === row.type,
        caseLabel + ' generated a Pickup Descriptor for another row');

      typeCounts[descriptor.type]++;
      return 1;
    }

    function spawnScoreFor(caseIndex, rowIndex) {
      var boundaries = [0, 1, 24, 25, 49, 50, 299, 300, 324, 325, 350, 500];
      if ((rowIndex + caseIndex) % 3 === 0) {
        return boundaries[(rowIndex * 5 + caseIndex) % boundaries.length];
      }
      return (Math.imul(caseIndex + 1, 137) + rowIndex * 29) % 501;
    }

    function generateScenario(caseIndex, pickupGenerationEnabled) {
      var randomSeed = (0x8F123BB5 ^ Math.imul(caseIndex + 1, 0x9E3779B1)) >>> 0;
      var gameplayRandom = createTaggedGameplayRandom(randomSeed);
      var visualSeed = 'property-8-visual-seed:' + caseIndex;
      var rows = new Map();
      var creationRows = [];
      var spawnScores = [];
      var trainRows = [];
      var activeTrainOutcomes = [];
      var completedTrainOutcomes = [];
      var pickupTypeCounts = {
        POKE_BALL: 0,
        GREAT_BALL: 0,
        QUICK_BALL: 0,
        HEAVY_BALL: 0
      };
      var pickupStateCount = 0;
      var pickupDescriptorCount = 0;
      var baseY = 3 + caseIndex * 41;
      var rowCount = 36;

      for (var rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        var y = baseY + rowIndex;
        var spawnScore = spawnScoreFor(caseIndex, rowIndex);
        var context = getTerrainSequenceContext(rows, y);
        var terrainType = selectNextTerrain(
          context.previousTerrain,
          context.consecutiveCount,
          gameplayRandom.forConsumer('terrain-selection'),
          context.consecutiveHazardCount,
          context.followingRiverCount,
          context.followingHazardCount
        );
        var row;

        if (terrainType === 'ROAD') {
          row = generateRoad(
            y,
            spawnScore,
            gameplayRandom.forConsumer('road-generation')
          );
        } else if (terrainType === 'RIVER') {
          row = generateRiver(
            y,
            spawnScore,
            gameplayRandom.forConsumer('river-generation')
          );
        } else if (terrainType === 'TRAIN_TRACK') {
          row = generateTrainTrack(
            y,
            gameplayRandom.forConsumer('train-track-generation')
          );
        } else {
          row = generateGrass(y, visualSeed, rows);
        }

        if (!Array.isArray(row.decorations)) {
          row.decorations = Object.freeze([]);
        }
        if (pickupGenerationEnabled) {
          attachPickupStateWithRandomForbidden(row, visualSeed);
          pickupStateCount++;
          pickupDescriptorCount += inspectInitialPickupState(
            row,
            pickupTypeCounts,
            'Case ' + caseIndex + ', row ' + rowIndex
          );
        } else {
          assert(!Object.prototype.hasOwnProperty.call(row, 'cosmetics'),
            'Pickup-free baseline attached Pickup State in Case ' + caseIndex +
            ', row ' + rowIndex);
        }

        rows.set(y, row);
        spawnScores.push(spawnScore);
        creationRows.push(withoutPickupState(row));
        if (row.type === 'TRAIN_TRACK') {
          trainRows.push(row);
        }
      }

      trainRows.forEach(function (track, trainIndex) {
        var activationDelta = track.metadata.idleRemaining +
          TRAIN_TRACK_CONFIG.warningDuration;
        updateTrainTrackLifecycle(
          track,
          activationDelta,
          gameplayRandom.forConsumer('train-lifecycle'),
          visualSeed
        );
        assert(track.metadata.trainState === 'ACTIVE',
          'Case ' + caseIndex + ', Train ' + trainIndex +
          ' did not reach the active outcome');
        assert(track.obstacles.length === 1 && track.obstacles[0].type === 'TRAIN',
          'Case ' + caseIndex + ', Train ' + trainIndex +
          ' did not create exactly one active Train');
        activeTrainOutcomes.push(withoutPickupState(track));

        updateTrainTrackLifecycle(
          track,
          10000000,
          gameplayRandom.forConsumer('train-lifecycle'),
          visualSeed
        );
        assert(track.metadata.trainState === 'IDLE' &&
          track.metadata.completedEvents === 1 && track.obstacles.length === 0,
          'Case ' + caseIndex + ', Train ' + trainIndex +
          ' did not reach the completed Train outcome');
        completedTrainOutcomes.push(withoutPickupState(track));
      });

      return {
        trace: gameplayRandom.trace,
        spawnScores: spawnScores,
        creationRows: creationRows,
        finalRows: Array.from(rows.values()).map(withoutPickupState),
        activeTrainOutcomes: activeTrainOutcomes,
        completedTrainOutcomes: completedTrainOutcomes,
        pickupStateCount: pickupStateCount,
        pickupDescriptorCount: pickupDescriptorCount,
        pickupTypeCounts: pickupTypeCounts
      };
    }

    function assertTraceNeutral(baseline, enabled, caseLabel) {
      assert(enabled.trace.length === baseline.trace.length,
        caseLabel + ' changed gameplay-random call count');

      for (var callIndex = 0; callIndex < baseline.trace.length; callIndex++) {
        var baselineCall = baseline.trace[callIndex];
        var enabledCall = enabled.trace[callIndex];
        assert(enabledCall.call === baselineCall.call,
          caseLabel + ' changed gameplay-random call order at call ' + callIndex);
        assert(enabledCall.value === baselineCall.value,
          caseLabel + ' changed sampled gameplay-random value at call ' + callIndex);
        assert(enabledCall.consumer === baselineCall.consumer,
          caseLabel + ' changed gameplay-random consumer membership at call ' + callIndex);
        assert(enabledCall.consumer.indexOf('pickup') === -1 &&
          enabledCall.consumer.indexOf('cosmetic') === -1,
        caseLabel + ' added a Pickup State gameplay-random consumer at call ' + callIndex);
      }
    }

    function assertGameplayRowsEqual(baseline, enabled, caseLabel) {
      assert(enabled.creationRows.length === baseline.creationRows.length,
        caseLabel + ' changed generated row count');

      for (var rowIndex = 0; rowIndex < baseline.creationRows.length; rowIndex++) {
        var baselineRow = baseline.creationRows[rowIndex];
        var enabledRow = enabled.creationRows[rowIndex];
        var rowLabel = caseLabel + ', row ' + rowIndex;

        assert(enabledRow.type === baselineRow.type,
          rowLabel + ' changed terrain type');
        assertEqualJson(enabledRow.obstacles, baselineRow.obstacles,
          rowLabel + ' changed obstacles, obstacle widths, or obstacle speeds');
        assertEqualJson(enabledRow.platforms, baselineRow.platforms,
          rowLabel + ' changed platforms, platform widths, or platform speeds');
        assertEqualJson(enabledRow.metadata, baselineRow.metadata,
          rowLabel + ' changed direction, speed, or Train metadata');
        assertEqualJson(enabledRow, baselineRow,
          rowLabel + ' changed gameplay row data after excluding only Pickup State');
      }

      assertEqualJson(enabled.finalRows, baseline.finalRows,
        caseLabel + ' changed final terrain, entity, platform, speed, direction, width, or Train state');
      assertEqualJson(enabled.activeTrainOutcomes, baseline.activeTrainOutcomes,
        caseLabel + ' changed active Train metadata, direction, speed, width, or outcome');
      assertEqualJson(enabled.completedTrainOutcomes, baseline.completedTrainOutcomes,
        caseLabel + ' changed completed Train metadata or outcome');
    }

    // Feature: pokemon-reskin-and-pokeballs, Property 8: Pickup generation is gameplay-random neutral
    // **Validates: Requirements 4.3, 4.4, 9.7**
    var PROPERTY_CASE_COUNT = 128;
    var ROWS_PER_CASE = 36;
    var totalRows = 0;
    var totalRandomCalls = 0;
    var totalPickupStates = 0;
    var totalPickupDescriptors = 0;
    var pickupTypeCoverage = {
      POKE_BALL: 0,
      GREAT_BALL: 0,
      QUICK_BALL: 0,
      HEAVY_BALL: 0
    };
    var terrainCoverage = {};
    var consumerCoverage = {};
    var totalTrainOutcomes = 0;

    for (var caseIndex = 0; caseIndex < PROPERTY_CASE_COUNT; caseIndex++) {
      var baseline = generateScenario(caseIndex, false);
      var enabled = generateScenario(caseIndex, true);
      var caseLabel = 'Property 8 case ' + caseIndex;

      assert(baseline.pickupStateCount === 0 &&
        baseline.pickupDescriptorCount === 0,
      caseLabel + ' pickup-free baseline was not pickup-free');
      assert(enabled.pickupStateCount === ROWS_PER_CASE,
        caseLabel + ' did not attach exactly one Pickup State per row');
      assertEqualJson(enabled.spawnScores, baseline.spawnScores,
        caseLabel + ' changed the deterministic spawn-score sequence');
      assertTraceNeutral(baseline, enabled, caseLabel);
      assertGameplayRowsEqual(baseline, enabled, caseLabel);

      baseline.creationRows.forEach(function (row) {
        terrainCoverage[row.type] = (terrainCoverage[row.type] || 0) + 1;
      });
      baseline.trace.forEach(function (entry) {
        consumerCoverage[entry.consumer] = true;
      });
      supportedPickupTypes.forEach(function (pickupType) {
        pickupTypeCoverage[pickupType] += enabled.pickupTypeCounts[pickupType];
      });
      totalRows += baseline.creationRows.length;
      totalRandomCalls += baseline.trace.length;
      totalPickupStates += enabled.pickupStateCount;
      totalPickupDescriptors += enabled.pickupDescriptorCount;
      totalTrainOutcomes += baseline.activeTrainOutcomes.length;
    }

    ['GRASS', 'ROAD', 'RIVER', 'TRAIN_TRACK'].forEach(function (terrainType) {
      assert(terrainCoverage[terrainType] > 0,
        'Property 8 generated no ' + terrainType + ' rows');
    });
    [
      'terrain-selection',
      'road-generation',
      'river-generation',
      'train-track-generation',
      'train-lifecycle'
    ].forEach(function (consumer) {
      assert(consumerCoverage[consumer] === true,
        'Property 8 did not exercise tagged consumer ' + consumer);
    });
    supportedPickupTypes.forEach(function (pickupType) {
      assert(pickupTypeCoverage[pickupType] > 0,
        'Property 8 generated no ' + pickupType + ' descriptors');
    });
    assert(totalPickupStates === PROPERTY_CASE_COUNT * ROWS_PER_CASE,
      'Property 8 did not validate one Pickup State for every generated row');
    assert(totalPickupDescriptors ===
      supportedPickupTypes.reduce(function (total, pickupType) {
        return total + pickupTypeCoverage[pickupType];
      }, 0),
    'Property 8 Pickup Type coverage did not account for every descriptor');
    assert(totalTrainOutcomes > 0,
      'Property 8 did not compare any active and completed Train outcomes');

    return 'PASS: Feature: pokemon-reskin-and-pokeballs, Property 8: Pickup generation is gameplay-random neutral; ' +
      PROPERTY_CASE_COUNT + ' paired deterministic sequences, ' + totalRows +
      ' generated rows, ' + totalPickupStates + ' Pickup States, ' +
      totalPickupDescriptors + ' descriptors (' +
      supportedPickupTypes.map(function (pickupType) {
        return pickupType + '=' + pickupTypeCoverage[pickupType];
      }).join(', ') + '), ' + totalRandomCalls +
      ' tagged gameplay-random calls, and ' + totalTrainOutcomes +
      ' active/completed Train outcome pairs matched after excluding only Pickup State';
  `;

  return eval('(function () {\n' + generatorSource + '\n;\n' + assertions + '\n})()');
}
