ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const productionSource = [
    'generator.js',
    'collision.js',
    'game.js'
  ].map(function (script) {
    return readUtf8(root + '/' + script);
  }).join('\n;\n');

  const assertions = `
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    function assertClose(actual, expected, message) {
      var tolerance = 1e-12;
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
        throw new Error(message + ': expected ' + expected + ', got ' + actual);
      }
    }

    function seededRandom(seed) {
      var state = seed >>> 0;
      return function () {
        state += 0x6D2B79F5;
        var value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    }

    function traceRandom(values) {
      var index = 0;
      var calls = [];
      return {
        random: function () {
          var value = values[index % values.length];
          calls.push(value);
          index++;
          return value;
        },
        calls: calls
      };
    }

    function expectedSpeed(rowType, spawnScore) {
      var normalized = Number.isFinite(spawnScore) && spawnScore >= 0
        ? Math.floor(spawnScore) : 0;
      var config = SCORE_SPEED_CONFIG[rowType];
      var tier = Math.floor(normalized / 25);
      return Math.min(config.cap, config.base * (1 + 0.10 * tier));
    }

    function assertCanonicalRow(row, rowType, spawnScore, caseLabel) {
      var normalized = Number.isFinite(spawnScore) && spawnScore >= 0
        ? Math.floor(spawnScore) : 0;
      var expectedTier = Math.floor(normalized / 25);
      var expected = expectedSpeed(rowType, normalized);
      var entities = rowType === 'ROAD' ? row.obstacles : row.platforms;

      assert(row.type === rowType, caseLabel + ' row type changed');
      assert(row.metadata.spawnScore === normalized,
        caseLabel + ' did not retain normalized spawnScore');
      assert(row.metadata.speedTier === expectedTier,
        caseLabel + ' did not retain exact 25-point speedTier');
      assert(row.metadata.direction === -1 || row.metadata.direction === 1,
        caseLabel + ' direction was not a movement sign');
      assertClose(row.metadata.lockedRowSpeed, expected,
        caseLabel + ' lockedRowSpeed was not score-derived');
      assertClose(row.metadata.speed, expected,
        caseLabel + ' compatibility speed differed from lockedRowSpeed');
      assert(entities.length > 0, caseLabel + ' generated no moving entities');
      entities.forEach(function (entity, entityIndex) {
        assertClose(entity.velocity, row.metadata.direction * expected,
          caseLabel + ' entity ' + entityIndex + ' velocity was not canonical');
      });
    }

    // Feature: score-scaled-movement-and-side-occlusion,
    // Property 1: Score-derived row speed is deterministic, tiered, and capped.
    // **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 7.1, 7.2**
    for (var caseIndex = 0; caseIndex < 256; caseIndex++) {
      var scoreRandom = seededRandom(0x51C0DE + caseIndex * 7919);
      var spawnScore = Math.floor(scoreRandom() * 5001);
      var road = generateRoad(caseIndex, spawnScore, seededRandom(caseIndex + 101));
      var river = generateRiver(-caseIndex, spawnScore, seededRandom(caseIndex + 10001));
      var expectedTier = Math.floor(spawnScore / 25);

      assert(calculateSpeedTier(spawnScore) === expectedTier,
        'Property 1 case ' + caseIndex + ' calculated the wrong tier');
      assertClose(calculateScoreScaledSpeed('ROAD', spawnScore),
        expectedSpeed('ROAD', spawnScore),
        'Property 1 case ' + caseIndex + ' calculated the wrong Road speed');
      assertClose(calculateScoreScaledSpeed('RIVER', spawnScore),
        expectedSpeed('RIVER', spawnScore),
        'Property 1 case ' + caseIndex + ' calculated the wrong River speed');
      assertCanonicalRow(road, 'ROAD', spawnScore,
        'Property 1 Road case ' + caseIndex);
      assertCanonicalRow(river, 'RIVER', spawnScore,
        'Property 1 River case ' + caseIndex);
      assert(road.metadata.lockedRowSpeed <= 0.0144,
        'Property 1 Road cap exceeded in case ' + caseIndex);
      assert(river.metadata.lockedRowSpeed <= 0.0105,
        'Property 1 River cap exceeded in case ' + caseIndex);
    }

    var roadMatrix = [
      [0, 0.0064],
      [24, 0.0064],
      [25, 0.00704],
      [324, 0.01408],
      [325, 0.0144],
      [350, 0.0144]
    ];
    roadMatrix.forEach(function (entry) {
      assertClose(calculateScoreScaledSpeed('ROAD', entry[0]), entry[1],
        'Road boundary matrix failed at Score ' + entry[0]);
      assertClose(generateRoad(1, entry[0], function () { return 0.25; })
        .metadata.lockedRowSpeed, entry[1],
        'Generated Road boundary failed at Score ' + entry[0]);
    });

    var riverMatrix = [
      [0, 0.0049],
      [24, 0.0049],
      [25, 0.00539],
      [299, 0.01029],
      [300, 0.0105],
      [325, 0.0105]
    ];
    riverMatrix.forEach(function (entry) {
      assertClose(calculateScoreScaledSpeed('RIVER', entry[0]), entry[1],
        'River boundary matrix failed at Score ' + entry[0]);
      assertClose(generateRiver(2, entry[0], function () { return 0.75; })
        .metadata.lockedRowSpeed, entry[1],
        'Generated River boundary failed at Score ' + entry[0]);
    });

    assert(Object.isFrozen(SCORE_SPEED_CONFIG), 'Score speed config must be immutable');
    assert(Object.isFrozen(SCORE_SPEED_CONFIG.ROAD) && Object.isFrozen(SCORE_SPEED_CONFIG.RIVER),
      'Per-row score speed configs must be immutable');
    assert(SCORE_SPEED_CONFIG.pointsPerTier === 25,
      'Speed tiers no longer use exactly 25 Score points');
    assertClose(SCORE_SPEED_CONFIG.tierGrowth, 0.10,
      'Speed tiers no longer grow by exactly 10% of baseline');
    assertClose(SCORE_SPEED_CONFIG.ROAD.base, 0.0064, 'Road baseline changed');
    assertClose(SCORE_SPEED_CONFIG.ROAD.cap, 0.0144, 'Road cap changed');
    assertClose(SCORE_SPEED_CONFIG.RIVER.base, 0.0049, 'River baseline changed');
    assertClose(SCORE_SPEED_CONFIG.RIVER.cap, 0.0105, 'River cap changed');

    var malformedScores = [undefined, null, NaN, Infinity, -Infinity, -1, -25, '25', {}, []];
    malformedScores.forEach(function (score, malformedIndex) {
      assert(calculateSpeedTier(score) === 0,
        'Malformed score did not normalize to tier zero at index ' + malformedIndex);
      assertClose(calculateScoreScaledSpeed('ROAD', score), 0.0064,
        'Malformed Road score did not normalize at index ' + malformedIndex);
      assertClose(calculateScoreScaledSpeed('RIVER', score), 0.0049,
        'Malformed River score did not normalize at index ' + malformedIndex);
      assertCanonicalRow(generateRoad(10, score, seededRandom(200 + malformedIndex)),
        'ROAD', 0, 'Malformed Road score ' + malformedIndex);
      assertCanonicalRow(generateRiver(11, score, seededRandom(300 + malformedIndex)),
        'RIVER', 0, 'Malformed River score ' + malformedIndex);
    });
    assert(calculateSpeedTier(49.999) === 1,
      'Finite nonnegative direct-call scores were not floored');
    assertCanonicalRow(generateRoad(12, 49.999, seededRandom(400)),
      'ROAD', 49, 'Fractional Road score');
    assertCanonicalRow(generateRiver(13, 49.999, seededRandom(401)),
      'RIVER', 49, 'Fractional River score');

    var unsupportedThrew = false;
    try {
      calculateScoreScaledSpeed('TRAIN_TRACK', 100);
    } catch (error) {
      unsupportedThrew = error instanceof TypeError &&
        error.message.indexOf('Unsupported score-scaled row type') !== -1;
    }
    assert(unsupportedThrew, 'Unsupported row type did not throw a clear TypeError');

    var roadValues = [0.1, 0.8, 0.3, 0.2, 0.4, 0.6, 0.7, 0.9];
    var legacyRoadTrace = traceRandom(roadValues);
    var newRoadTrace = traceRandom(roadValues);
    var cappedRoadTrace = traceRandom(roadValues);
    var legacyRoad = generateRoad(20, legacyRoadTrace.random);
    var newRoad = generateRoad(20, 0, newRoadTrace.random);
    var cappedRoad = generateRoad(20, 100000, cappedRoadTrace.random);
    assertCanonicalRow(legacyRoad, 'ROAD', 0, 'Legacy Road signature');
    assertCanonicalRow(newRoad, 'ROAD', 0, 'New Road signature');
    assert(legacyRoadTrace.calls.length === 5,
      'Legacy Road consumed an unexpected RNG call count');
    assert(newRoadTrace.calls.length === legacyRoadTrace.calls.length &&
      cappedRoadTrace.calls.length === legacyRoadTrace.calls.length,
      'Road score calculation added or removed an RNG sample');
    assert(JSON.stringify(newRoadTrace.calls) === JSON.stringify(legacyRoadTrace.calls) &&
      JSON.stringify(cappedRoadTrace.calls) === JSON.stringify(legacyRoadTrace.calls),
      'Road score calculation changed RNG trace order or membership');

    var riverValues = [
      0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4,
      0.5, 0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77
    ];
    var legacyRiverTrace = traceRandom(riverValues);
    var newRiverTrace = traceRandom(riverValues);
    var cappedRiverTrace = traceRandom(riverValues);
    var legacyRiver = generateRiver(21, legacyRiverTrace.random);
    var newRiver = generateRiver(21, 0, newRiverTrace.random);
    generateRiver(21, 100000, cappedRiverTrace.random);
    assertCanonicalRow(legacyRiver, 'RIVER', 0, 'Legacy River signature');
    assertCanonicalRow(newRiver, 'RIVER', 0, 'New River signature');
    assert(legacyRiverTrace.calls.length === 16,
      'Legacy River consumed an unexpected RNG call count');
    assert(newRiverTrace.calls.length === legacyRiverTrace.calls.length &&
      cappedRiverTrace.calls.length === legacyRiverTrace.calls.length,
      'River score calculation added or removed an RNG sample');
    assert(JSON.stringify(newRiverTrace.calls) === JSON.stringify(legacyRiverTrace.calls) &&
      JSON.stringify(cappedRiverTrace.calls) === JSON.stringify(legacyRiverTrace.calls),
      'River score calculation changed RNG trace order or membership');

    [0, 1, 24].forEach(function (earlyScore) {
      var slowRandomRoad = generateRoad(30, earlyScore, function () { return 0; });
      var fastRandomRoad = generateRoad(30, earlyScore, function () { return 0.999999; });
      var slowRandomRiver = generateRiver(31, earlyScore, function () { return 0; });
      var fastRandomRiver = generateRiver(31, earlyScore, function () { return 0.999999; });
      assertClose(slowRandomRoad.metadata.lockedRowSpeed, 0.0064,
        'Early Road speed was not the exact baseline at Score ' + earlyScore);
      assertClose(fastRandomRoad.metadata.lockedRowSpeed,
        slowRandomRoad.metadata.lockedRowSpeed,
        'Early Road speed still depended on RNG at Score ' + earlyScore);
      assertClose(slowRandomRiver.metadata.lockedRowSpeed, 0.0049,
        'Early River speed was not the exact baseline at Score ' + earlyScore);
      assertClose(fastRandomRiver.metadata.lockedRowSpeed,
        slowRandomRiver.metadata.lockedRowSpeed,
        'Early River speed still depended on RNG at Score ' + earlyScore);
    });

    // Feature: score-scaled-movement-and-side-occlusion,
    // Property 2: Row speed remains locked for the row lifetime.
    // **Validates: Requirements 1.5, 1.6, 2.5, 2.6, 7.3**
    var roadDirectionMask = 0;
    var riverDirectionMask = 0;
    var rowsWithDifferentCurrentScoreSpeed = 0;
    for (var lifetimeCase = 0; lifetimeCase < 128; lifetimeCase++) {
      var lifetimeSpawnScore = (lifetimeCase * 37) % 401;
      var lockedRoad = generateRoad(
        1000 + lifetimeCase,
        lifetimeSpawnScore,
        seededRandom(0x20AD0000 + lifetimeCase)
      );
      var lockedRiver = generateRiver(
        -1000 - lifetimeCase,
        lifetimeSpawnScore,
        seededRandom(0x21AE0000 + lifetimeCase)
      );
      var lockedRows = [lockedRoad, lockedRiver];
      var movementRandomCalls = 0;
      var lifetimeGame = Object.create(Game.prototype);
      lifetimeGame.world = {
        terrainRows: new Map([
          [lockedRoad.y, lockedRoad],
          [lockedRiver.y, lockedRiver]
        ])
      };
      lifetimeGame.gameState = { score: lifetimeSpawnScore };
      lifetimeGame.random = function () {
        movementRandomCalls++;
        return 0.999999;
      };

      var mutatedScore = lifetimeCase % 2 === 0
        ? lifetimeSpawnScore + 325
        : (lifetimeSpawnScore === 0 ? 350 : 0);
      lifetimeGame.gameState.score = mutatedScore;
      assert(mutatedScore !== lifetimeSpawnScore,
        'Property 2 case ' + lifetimeCase + ' did not mutate current Score');

      var expectedPositions = [];
      lockedRows.forEach(function (row, rowIndex) {
        var rowType = row.type;
        var originalLockedSpeed = row.metadata.lockedRowSpeed;
        var originalDirection = row.metadata.direction;
        var originalSpawnScore = row.metadata.spawnScore;
        var entities = rowType === 'ROAD' ? row.obstacles : row.platforms;
        var currentScoreSpeed = calculateScoreScaledSpeed(rowType, mutatedScore);

        if (rowType === 'ROAD') {
          roadDirectionMask |= originalDirection === -1 ? 1 : 2;
        } else {
          riverDirectionMask |= originalDirection === -1 ? 1 : 2;
        }
        if (Math.abs(currentScoreSpeed - originalLockedSpeed) > 1e-12) {
          rowsWithDifferentCurrentScoreSpeed++;
        }
        assert(entities.length > 1,
          'Property 2 ' + rowType + ' case ' + lifetimeCase +
          ' did not contain multiple entities');

        expectedPositions[rowIndex] = [];
        entities.forEach(function (entity, entityIndex) {
          entity.x = -8 + entityIndex * 3;
          expectedPositions[rowIndex][entityIndex] = entity.x;
          entity.velocity = originalDirection * originalLockedSpeed *
            (entityIndex + 2);
        });

        row.__property2Snapshot = {
          lockedSpeed: originalLockedSpeed,
          direction: originalDirection,
          spawnScore: originalSpawnScore,
          currentScoreSpeed: currentScoreSpeed
        };
      });

      var updateDeltas = [
        0,
        1 + (lifetimeCase % 13),
        2 + ((lifetimeCase * 5) % 17),
        5 + ((lifetimeCase * 11) % 24)
      ];
      updateDeltas.forEach(function (delta, deltaIndex) {
        lifetimeGame.updateMovingEntities(delta);

        lockedRows.forEach(function (row, rowIndex) {
          var snapshot = row.__property2Snapshot;
          var entities = row.type === 'ROAD' ? row.obstacles : row.platforms;
          assertClose(row.metadata.lockedRowSpeed, snapshot.lockedSpeed,
            'Property 2 ' + row.type + ' case ' + lifetimeCase +
            ' changed lockedRowSpeed after Score mutation at delta ' + deltaIndex);
          assert(row.metadata.direction === snapshot.direction,
            'Property 2 ' + row.type + ' case ' + lifetimeCase +
            ' changed direction during its lifetime');
          assert(row.metadata.spawnScore === snapshot.spawnScore,
            'Property 2 ' + row.type + ' case ' + lifetimeCase +
            ' replaced its original Spawn Score');

          entities.forEach(function (entity, entityIndex) {
            var signedLockedSpeed = snapshot.direction * snapshot.lockedSpeed;
            expectedPositions[rowIndex][entityIndex] += signedLockedSpeed * delta;
            assertClose(entity.velocity, signedLockedSpeed,
              'Property 2 ' + row.type + ' case ' + lifetimeCase +
              ' entity ' + entityIndex + ' rerolled/recalculated velocity');
            assertClose(entity.x, expectedPositions[rowIndex][entityIndex],
              'Property 2 ' + row.type + ' case ' + lifetimeCase +
              ' entity ' + entityIndex + ' did not move once from locked speed');
            if (Math.abs(snapshot.currentScoreSpeed - snapshot.lockedSpeed) > 1e-12) {
              assert(Math.abs(entity.velocity) !== snapshot.currentScoreSpeed,
                'Property 2 ' + row.type + ' case ' + lifetimeCase +
                ' entity ' + entityIndex + ' used current-Score speed');
            }
          });
        });
      });

      lockedRows.forEach(function (row) {
        delete row.__property2Snapshot;
      });
      assert(movementRandomCalls === 0,
        'Property 2 case ' + lifetimeCase +
        ' sampled RNG while moving an existing Road/River row');
    }
    assert(roadDirectionMask === 3,
      'Property 2 Road cases did not cover both movement directions');
    assert(riverDirectionMask === 3,
      'Property 2 River cases did not cover both movement directions');
    assert(rowsWithDifferentCurrentScoreSpeed >= 128,
      'Property 2 did not sufficiently distinguish locked speed from current-Score speed');

    assertClose(INITIAL_SPEED_RANGES.TRAIN.min, 0.0255, 'Train minimum speed changed');
    assertClose(INITIAL_SPEED_RANGES.TRAIN.max, 0.0425, 'Train maximum speed changed');
    function activatedTrainForScore(spawnScore, samples) {
      var track = generateTrainTrack(40, function () { return 0.5; });
      track.metadata.spawnScore = spawnScore;
      var trace = traceRandom(samples);
      activateTrain(track, trace.random);
      return { train: track.obstacles[0], calls: trace.calls };
    }
    var lowScoreTrain = activatedTrainForScore(0, [0.75, 0.25, 0.5]);
    var highScoreTrain = activatedTrainForScore(100000, [0.75, 0.25, 0.5]);
    assert(lowScoreTrain.calls.length === 3 && highScoreTrain.calls.length === 3,
      'Train activation RNG contract changed');
    assertClose(lowScoreTrain.train.velocity, highScoreTrain.train.velocity,
      'Train speed became dependent on Score');
    assert(Math.abs(lowScoreTrain.train.velocity) >= INITIAL_SPEED_RANGES.TRAIN.min &&
      Math.abs(lowScoreTrain.train.velocity) <= INITIAL_SPEED_RANGES.TRAIN.max,
      'Train speed left its independent configured range');
    assert(Math.abs(lowScoreTrain.train.velocity) !== 0.0144 &&
      Math.abs(lowScoreTrain.train.velocity) !== 0.0105,
      'Train was incorrectly subjected to a Road/River speed cap');

    function deterministicPartitions(total, seed, partCount) {
      var random = seededRandom(seed);
      var remaining = total;
      var partitions = [];

      for (var partIndex = 0; partIndex < partCount - 1; partIndex++) {
        var partsLeft = partCount - partIndex;
        var average = remaining / partsLeft;
        var multiplier = 0.5 + random();
        var part = Math.max(1, Math.floor(average * multiplier));
        var maximum = remaining - (partsLeft - 1);
        part = Math.min(part, maximum);
        partitions.push(part);
        remaining -= part;
      }

      partitions.push(remaining);
      return partitions;
    }

    function createTrainPropertyScenario(y, score, samples) {
      var randomTrace = traceRandom(samples);
      var track = generateTrainTrack(y, randomTrace.random);
      var game = Object.create(Game.prototype);
      game.world = { terrainRows: new Map([[track.y, track]]) };
      game.random = randomTrace.random;
      game.visualSeed = 'property-3-' + y;
      game.gameState = { score: score };
      return { game: game, track: track, randomTrace: randomTrace };
    }

    function assertTrainPairEqual(left, right, label) {
      assert(left.track.metadata.trainState === right.track.metadata.trainState,
        label + ' lifecycle state depended on Score');
      assertClose(left.track.metadata.idleRemaining,
        right.track.metadata.idleRemaining,
        label + ' idle interval depended on Score');
      assertClose(left.track.metadata.warningElapsed,
        right.track.metadata.warningElapsed,
        label + ' warning elapsed time depended on Score');
      assert(left.track.metadata.warningLightOn ===
        right.track.metadata.warningLightOn,
        label + ' warning-light parity depended on Score');
      assert(left.track.metadata.completedEvents ===
        right.track.metadata.completedEvents,
        label + ' completed event count depended on Score');
      assert(left.track.obstacles.length === right.track.obstacles.length,
        label + ' active Train count depended on Score');

      if (left.track.obstacles.length === 1) {
        var leftTrain = left.track.obstacles[0];
        var rightTrain = right.track.obstacles[0];
        assertClose(leftTrain.x, rightTrain.x,
          label + ' Train position depended on Score');
        assertClose(leftTrain.velocity, rightTrain.velocity,
          label + ' Train velocity depended on Score');
        assert(leftTrain.width === rightTrain.width,
          label + ' Train width depended on Score');
      }
    }

    // Feature: score-scaled-movement-and-side-occlusion,
    // Property 3: Train lifecycle is score-independent.
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 7.4**
    assert(TRAIN_TRACK_CONFIG.idleMin === 2500,
      'Property 3 Train idle minimum changed');
    assert(TRAIN_TRACK_CONFIG.idleMax === 7000,
      'Property 3 Train idle maximum changed');
    assert(TRAIN_TRACK_CONFIG.warningDuration === 3000,
      'Property 3 Train warning duration changed');
    assert(TRAIN_TRACK_CONFIG.flashInterval === 350,
      'Property 3 warning-light interval changed');

    var trainDirectionMask = 0;
    var trainSpeedMinimumSeen = Infinity;
    var trainSpeedMaximumSeen = -Infinity;
    for (var trainCase = 0; trainCase < 128; trainCase++) {
      var propertyRandom = seededRandom(0x7A1A0000 + trainCase * 3571);
      var idleSample = propertyRandom();
      var directionSample = trainCase % 2 === 0 ? 0.25 : 0.75;
      var speedSample = trainCase === 0 ? 0 :
        (trainCase === 127 ? 0.999999999999 : propertyRandom());
      var widthSample = propertyRandom();
      var resetIdleSample = propertyRandom();
      var samples = [
        idleSample,
        directionSample,
        speedSample,
        widthSample,
        resetIdleSample
      ];
      var lowScore = (trainCase * 29) % 351;
      var highScore = 100000 + trainCase * 97;
      var lowScenario = createTrainPropertyScenario(
        3000 + trainCase,
        lowScore,
        samples
      );
      var highScenario = createTrainPropertyScenario(
        3000 + trainCase,
        highScore,
        samples
      );
      var scenarios = [lowScenario, highScenario];
      var expectedIdle = TRAIN_TRACK_CONFIG.idleMin +
        idleSample * (TRAIN_TRACK_CONFIG.idleMax - TRAIN_TRACK_CONFIG.idleMin);

      scenarios.forEach(function (scenario, scenarioIndex) {
        assert(scenario.track.metadata.trainState === 'IDLE',
          'Property 3 case ' + trainCase + ' did not begin IDLE');
        assertClose(scenario.track.metadata.idleRemaining, expectedIdle,
          'Property 3 case ' + trainCase + ' sampled the wrong idle interval');
        assert(scenario.track.metadata.idleRemaining >= TRAIN_TRACK_CONFIG.idleMin &&
          scenario.track.metadata.idleRemaining <= TRAIN_TRACK_CONFIG.idleMax,
          'Property 3 case ' + trainCase + ' idle interval left configured range');
        assert(scenario.track.obstacles.length === 0,
          'Property 3 case ' + trainCase + ' spawned before warning');
      });
      assertTrainPairEqual(lowScenario, highScenario,
        'Property 3 initial case ' + trainCase);

      var idlePartitions = deterministicPartitions(
        expectedIdle,
        0x1D1E0000 + trainCase,
        3 + (trainCase % 5)
      );
      var idleElapsed = 0;
      idlePartitions.forEach(function (delta, partitionIndex) {
        scenarios.forEach(function (scenario, scenarioIndex) {
          scenario.game.gameState.score = scenarioIndex === 0
            ? lowScore + partitionIndex
            : highScore + partitionIndex * 25;
          scenario.game.updateMovingEntities(delta);
        });
        idleElapsed += delta;

        if (partitionIndex < idlePartitions.length - 1) {
          scenarios.forEach(function (scenario) {
            assert(scenario.track.metadata.trainState === 'IDLE',
              'Property 3 case ' + trainCase +
              ' left IDLE before cumulative idle interval');
            assertClose(scenario.track.metadata.idleRemaining,
              expectedIdle - idleElapsed,
              'Property 3 case ' + trainCase +
              ' did not accumulate idle partitions');
          });
        } else {
          scenarios.forEach(function (scenario) {
            assert(scenario.track.metadata.trainState === 'WARNING',
              'Property 3 case ' + trainCase +
              ' did not enter warning at cumulative idle interval');
            assert(scenario.track.metadata.warningElapsed === 0 &&
              scenario.track.metadata.warningLightOn === true,
              'Property 3 case ' + trainCase +
              ' warning did not begin at lit parity');
          });
        }
        assertTrainPairEqual(lowScenario, highScenario,
          'Property 3 idle partition ' + partitionIndex +
          ' case ' + trainCase);
      });

      var warningPartitions = [350, 350].concat(deterministicPartitions(
        TRAIN_TRACK_CONFIG.warningDuration - 701,
        0x3A2B0000 + trainCase,
        3 + (trainCase % 6)
      ));
      var warningElapsed = 0;
      warningPartitions.forEach(function (delta, partitionIndex) {
        scenarios.forEach(function (scenario, scenarioIndex) {
          scenario.game.gameState.score = scenarioIndex === 0
            ? lowScore + 325 + partitionIndex
            : highScore - partitionIndex;
          scenario.game.updateMovingEntities(delta);
        });
        warningElapsed += delta;
        var expectedLightOn = Math.floor(
          warningElapsed / TRAIN_TRACK_CONFIG.flashInterval
        ) % 2 === 0;

        scenarios.forEach(function (scenario) {
          assert(scenario.track.metadata.trainState === 'WARNING',
            'Property 3 case ' + trainCase +
            ' activated before 3000 cumulative warning milliseconds');
          assertClose(scenario.track.metadata.warningElapsed, warningElapsed,
            'Property 3 case ' + trainCase +
            ' did not accumulate warning partitions');
          assert(scenario.track.metadata.warningLightOn === expectedLightOn,
            'Property 3 case ' + trainCase +
            ' violated 350ms warning-light parity at ' + warningElapsed + 'ms');
          assert(scenario.track.obstacles.length === 0,
            'Property 3 case ' + trainCase +
            ' spawned a Train before warning completion');
        });
        assertTrainPairEqual(lowScenario, highScenario,
          'Property 3 warning partition ' + partitionIndex +
          ' case ' + trainCase);
      });
      assert(warningElapsed === TRAIN_TRACK_CONFIG.warningDuration - 1,
        'Property 3 case ' + trainCase +
        ' warning partitions did not total 2999ms');

      scenarios.forEach(function (scenario, scenarioIndex) {
        scenario.game.gameState.score = scenarioIndex === 0 ? 0 : 1000000;
        scenario.game.updateMovingEntities(1);
      });
      assertTrainPairEqual(lowScenario, highScenario,
        'Property 3 activation case ' + trainCase);

      scenarios.forEach(function (scenario) {
        var train = scenario.track.obstacles[0];
        var clampedSpeedSample = Math.min(
          Math.max(speedSample, 0),
          0.999999999999
        );
        var expectedTrainSpeed = INITIAL_SPEED_RANGES.TRAIN.min +
          clampedSpeedSample *
            (INITIAL_SPEED_RANGES.TRAIN.max - INITIAL_SPEED_RANGES.TRAIN.min);
        var expectedDirection = directionSample < 0.5 ? -1 : 1;

        assert(scenario.track.metadata.trainState === 'ACTIVE' && train,
          'Property 3 case ' + trainCase +
          ' did not activate at 3000 cumulative warning milliseconds');
        assert(scenario.track.metadata.warningElapsed ===
          TRAIN_TRACK_CONFIG.warningDuration,
          'Property 3 case ' + trainCase +
          ' did not retain the completed warning duration');
        assertClose(Math.abs(train.velocity), expectedTrainSpeed,
          'Property 3 case ' + trainCase +
          ' Train speed did not match its independent random sample');
        assert(train.velocity * expectedDirection > 0,
          'Property 3 case ' + trainCase + ' Train direction changed');
        assert(Math.abs(train.velocity) >= INITIAL_SPEED_RANGES.TRAIN.min &&
          Math.abs(train.velocity) <= INITIAL_SPEED_RANGES.TRAIN.max,
          'Property 3 case ' + trainCase +
          ' Train speed left 0.0255-0.0425 range');
        assert(Math.abs(train.velocity) > SCORE_SPEED_CONFIG.ROAD.cap &&
          Math.abs(train.velocity) > SCORE_SPEED_CONFIG.RIVER.cap,
          'Property 3 case ' + trainCase +
          ' Train received Road/River score scaling');
        assert(scenario.track.metadata.direction === expectedDirection,
          'Property 3 case ' + trainCase +
          ' metadata direction did not match active Train');
        assertClose(scenario.track.metadata.speed, expectedTrainSpeed,
          'Property 3 case ' + trainCase +
          ' metadata speed differed from active Train');
        assert(scenario.randomTrace.calls.length === 4,
          'Property 3 case ' + trainCase +
          ' activation changed Train RNG call membership');

        trainDirectionMask |= expectedDirection === -1 ? 1 : 2;
        trainSpeedMinimumSeen = Math.min(trainSpeedMinimumSeen,
          Math.abs(train.velocity));
        trainSpeedMaximumSeen = Math.max(trainSpeedMaximumSeen,
          Math.abs(train.velocity));
      });

      var activeDeltas = [
        1 + (trainCase % 7),
        5 + ((trainCase * 3) % 11),
        9 + ((trainCase * 5) % 17)
      ];
      activeDeltas.forEach(function (delta, partitionIndex) {
        var expectedPositions = scenarios.map(function (scenario) {
          var train = scenario.track.obstacles[0];
          return train.x + train.velocity * delta;
        });
        scenarios.forEach(function (scenario, scenarioIndex) {
          scenario.game.gameState.score = scenarioIndex === 0
            ? trainCase + partitionIndex
            : 2000000 - trainCase - partitionIndex;
          scenario.game.updateMovingEntities(delta);
          assertClose(scenario.track.obstacles[0].x,
            expectedPositions[scenarioIndex],
            'Property 3 case ' + trainCase +
            ' active partition did not move by Train velocity');
          assert(scenario.randomTrace.calls.length === 4,
            'Property 3 case ' + trainCase +
            ' active movement rerolled Train speed');
        });
        assertTrainPairEqual(lowScenario, highScenario,
          'Property 3 active partition ' + partitionIndex +
          ' case ' + trainCase);
      });

      var direction = lowScenario.track.metadata.direction;
      var boundaryX = direction > 0
        ? TRAIN_TRACK_CONFIG.worldEdge
        : -TRAIN_TRACK_CONFIG.worldEdge - lowScenario.track.obstacles[0].width;
      scenarios.forEach(function (scenario) {
        scenario.track.obstacles[0].x = boundaryX;
      });
      assertTrainPairEqual(lowScenario, highScenario,
        'Property 3 edge boundary case ' + trainCase);

      var exitedTrainReferences = scenarios.map(function (scenario) {
        return scenario.track.obstacles[0];
      });
      scenarios.forEach(function (scenario, scenarioIndex) {
        scenario.game.gameState.score = scenarioIndex === 0 ? 350 : 9999999;
        scenario.game.updateMovingEntities(1);
      });
      assertTrainPairEqual(lowScenario, highScenario,
        'Property 3 completion case ' + trainCase);

      scenarios.forEach(function (scenario, scenarioIndex) {
        assert(scenario.track.metadata.trainState === 'IDLE',
          'Property 3 case ' + trainCase +
          ' did not complete after crossing configured edge');
        assert(scenario.track.obstacles.length === 0,
          'Property 3 case ' + trainCase +
          ' retained a completed active Train');
        assert(scenario.track.metadata.completedEvents === 1,
          'Property 3 case ' + trainCase +
          ' did not count exactly one completed event');
        assert(scenario.track.metadata.idleRemaining >=
          TRAIN_TRACK_CONFIG.idleMin &&
          scenario.track.metadata.idleRemaining <= TRAIN_TRACK_CONFIG.idleMax,
          'Property 3 case ' + trainCase +
          ' reset idle interval left configured range');
        assert(scenario.randomTrace.calls.length === 5,
          'Property 3 case ' + trainCase +
          ' completion changed Train RNG call membership');
        assert(exitedTrainReferences[scenarioIndex].x !== -25 &&
          exitedTrainReferences[scenarioIndex].x !== 25,
          'Property 3 case ' + trainCase +
          ' wrapped active Train instead of completing event');
      });
    }
    assert(trainDirectionMask === 3,
      'Property 3 deterministic cases did not cover both Train directions');
    assertClose(trainSpeedMinimumSeen, INITIAL_SPEED_RANGES.TRAIN.min,
      'Property 3 deterministic cases did not cover Train minimum speed');
    assert(trainSpeedMaximumSeen <= INITIAL_SPEED_RANGES.TRAIN.max &&
      trainSpeedMaximumSeen > INITIAL_SPEED_RANGES.TRAIN.max - 1e-10,
      'Property 3 deterministic cases did not cover Train maximum speed');

    // Feature: score-scaled-movement-and-side-occlusion,
    // Property 11: Car and Platform wrap behavior is unchanged.
    // **Validates: Requirements 6.1**
    var wrapCoverage = {
      positiveCrossing: 0,
      negativeCrossing: 0,
      positiveNonCrossing: 0,
      negativeNonCrossing: 0,
      exactThreshold: 0,
      interior: 0
    };
    for (var wrapCase = 0; wrapCase < 192; wrapCase++) {
      var wrapDirection = wrapCase % 2 === 0 ? 1 : -1;
      var wrapMode = Math.floor(wrapCase / 2) % 3;
      var wrapSpeed = (1 + (Math.floor(wrapCase / 6) % 8)) / 1024;
      var wrapDelta = Math.pow(2, Math.floor(wrapCase / 48) % 4);
      var wrapDisplacement = wrapSpeed * wrapDelta;
      var wrapEpsilon = (1 + (wrapCase % 4)) / 2048;
      var wrapGap = (1 + (wrapCase % 7)) / 16;
      var wrapVelocity = wrapDirection * wrapSpeed;
      var wrapStartX;
      var wrapExpectedX;
      var shouldWrap = wrapMode === 0;

      if (shouldWrap) {
        wrapStartX = wrapDirection > 0
          ? 20 - wrapDisplacement + wrapEpsilon
          : -20 + wrapDisplacement - wrapEpsilon;
        wrapExpectedX = wrapDirection > 0 ? -25 : 25;
        if (wrapDirection > 0) {
          wrapCoverage.positiveCrossing++;
        } else {
          wrapCoverage.negativeCrossing++;
        }
      } else if (wrapMode === 1) {
        wrapStartX = wrapDirection > 0
          ? 20 - wrapDisplacement
          : -20 + wrapDisplacement;
        wrapExpectedX = wrapDirection > 0 ? 20 : -20;
        wrapCoverage.exactThreshold++;
        if (wrapDirection > 0) {
          wrapCoverage.positiveNonCrossing++;
        } else {
          wrapCoverage.negativeNonCrossing++;
        }
      } else {
        wrapStartX = wrapDirection > 0
          ? 20 - wrapDisplacement - wrapGap
          : -20 + wrapDisplacement + wrapGap;
        wrapExpectedX = wrapStartX + wrapVelocity * wrapDelta;
        wrapCoverage.interior++;
        if (wrapDirection > 0) {
          wrapCoverage.positiveNonCrossing++;
        } else {
          wrapCoverage.negativeNonCrossing++;
        }
      }

      var wrapCar = {
        x: wrapStartX,
        y: 5000 + wrapCase * 2,
        width: 1 + (wrapCase % 3),
        velocity: wrapVelocity,
        type: 'CAR'
      };
      var wrapPlatform = {
        x: wrapStartX,
        y: wrapCar.y + 1,
        width: 1 + ((wrapCase * 3) % 4),
        velocity: wrapVelocity,
        type: wrapCase % 2 === 0 ? 'LOG' : 'LILY_PAD'
      };
      var originalCarWidth = wrapCar.width;
      var originalPlatformWidth = wrapPlatform.width;
      var roadRow = {
        y: wrapCar.y,
        type: 'ROAD',
        obstacles: [wrapCar],
        platforms: [],
        metadata: {
          direction: wrapDirection,
          lockedRowSpeed: wrapSpeed
        }
      };
      var riverRow = {
        y: wrapPlatform.y,
        type: 'RIVER',
        obstacles: [],
        platforms: [wrapPlatform],
        metadata: {
          direction: wrapDirection,
          lockedRowSpeed: wrapSpeed
        }
      };
      var wrapGame = Object.create(Game.prototype);
      wrapGame.world = {
        terrainRows: new Map([
          [roadRow.y, roadRow],
          [riverRow.y, riverRow]
        ])
      };
      wrapGame.random = function () {
        throw new Error('Property 11 movement unexpectedly sampled RNG');
      };

      [wrapCar, wrapPlatform].forEach(function (entity, entityIndex) {
        var directMovement = calculateEntityMovement(entity, wrapDelta);
        assert(directMovement.wrapped === shouldWrap,
          'Property 11 case ' + wrapCase + ' entity ' + entityIndex +
          ' reported the wrong wrap state');
        assertClose(directMovement.x, wrapExpectedX,
          'Property 11 case ' + wrapCase + ' entity ' + entityIndex +
          ' calculated the wrong next position');
      });

      wrapGame.updateMovingEntities(wrapDelta);

      [wrapCar, wrapPlatform].forEach(function (entity, entityIndex) {
        assertClose(entity.velocity, wrapVelocity,
          'Property 11 case ' + wrapCase + ' entity ' + entityIndex +
          ' changed signed row velocity');
        assertClose(entity.x, wrapExpectedX,
          'Property 11 case ' + wrapCase + ' entity ' + entityIndex +
          (shouldWrap ? ' did not reset at the opposite edge' :
            ' did not advance exactly once by velocity times delta'));
      });
      assert(wrapCar.width === originalCarWidth,
        'Property 11 case ' + wrapCase + ' changed Car width');
      assert(wrapPlatform.width === originalPlatformWidth,
        'Property 11 case ' + wrapCase + ' changed Platform width');
    }
    assert(wrapCoverage.positiveCrossing === 32 &&
      wrapCoverage.negativeCrossing === 32,
      'Property 11 did not cover 32 strict crossings in each direction');
    assert(wrapCoverage.positiveNonCrossing === 64 &&
      wrapCoverage.negativeNonCrossing === 64,
      'Property 11 did not cover 64 non-crossings in each direction');
    assert(wrapCoverage.exactThreshold === 64 && wrapCoverage.interior === 64,
      'Property 11 did not cover exact-threshold and interior movement equally');
  `;

  eval('var window = { addEventListener: function () {} };\n' +
    productionSource + '\n' + assertions);
  return 'PASS: Properties 1-3 and 11; 256 score cases, 128 paired Road/River locked-lifetime cases, 128 paired Train lifecycle cases, and 192 paired Car/Platform wrap cases';
}
