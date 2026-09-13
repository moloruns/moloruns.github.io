ObjC.import('Foundation');

// Feature: pokemon-reskin-and-pokeballs, Property 5: Eligibility and four-type shares are exact
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.9, 9.2, 9.3**

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const propertyLabel = 'Feature: pokemon-reskin-and-pokeballs, Property 5: Eligibility and four-type shares are exact';
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  var pickupApi;

  eval('(function () {\n' + readUtf8(root + '/generator.js') + '\n;pickupApi = {' +
    'config: PICKUP_COSMETIC_CONFIG,' +
    'pickupTypes: PICKUP_TYPES,' +
    'createPickupState: createPickupState,' +
    'getEligibilityBucket: getPickupEligibilityBucket,' +
    'getType: getPickupType,' +
    'getTypeBucket: getPickupTypeBucket,' +
    'isEligible: isPickupEligible,' +
    'isSupportedType: isSupportedPickupType' +
  '};\n})();');

  function assert(condition, message) {
    if (!condition) throw new Error(propertyLabel + ': ' + message);
  }

  function assertZeroOrOneDescriptor(
    row,
    visualSeed,
    expectedDescriptor,
    expectedType,
    label
  ) {
    const pickupState = pickupApi.createPickupState(row, visualSeed);
    assert(pickupState && typeof pickupState === 'object' &&
      !Array.isArray(pickupState),
    label + ' did not produce one Pickup State object');

    const stateKeys = Object.keys(pickupState).sort();
    assert(stateKeys.length === 2 && stateKeys[0] === 'consumed' &&
      stateKeys[1] === 'descriptor',
    label + ' produced Pickup State outside the descriptor/consumed schema');
    assert(pickupState.consumed === false,
      label + ' did not begin unconsumed');

    const descriptorCount = pickupState.descriptor === null ? 0 : 1;
    assert(descriptorCount <= 1,
      label + ' produced more than one Pickup Descriptor');
    assert((descriptorCount === 1) === expectedDescriptor,
      label + ' descriptor cardinality did not match eligibility');

    if (descriptorCount === 1) {
      const descriptor = pickupState.descriptor;
      assert(descriptor && typeof descriptor === 'object' &&
        !Array.isArray(descriptor) && Object.isFrozen(descriptor),
      label + ' produced a non-singular or mutable descriptor');
      assert(descriptor.type === expectedType &&
        pickupApi.isSupportedType(descriptor.type),
      label + ' produced unsupported or wrong Pickup Type ' + descriptor.type);
      assert(descriptor.terrainType === row.type && descriptor.y === row.y,
        label + ' produced a descriptor for the wrong row identity');
    }

    return descriptorCount;
  }

  function findSeedForBuckets(
    terrainType,
    rowY,
    targetEligibilityBucket,
    targetTypeBucket
  ) {
    const searchLimit = 200000;
    for (let candidate = 0; candidate < searchLimit; candidate++) {
      const visualSeed = 'property-5:' + terrainType + ':' + rowY + ':' +
        targetEligibilityBucket + ':' + targetTypeBucket + ':' + candidate;
      if (
        pickupApi.getEligibilityBucket(visualSeed, rowY, terrainType) ===
          targetEligibilityBucket &&
        pickupApi.getTypeBucket(visualSeed, rowY, terrainType) === targetTypeBucket
      ) {
        return visualSeed;
      }
    }
    throw new Error(propertyLabel + ': unable to control ' + terrainType +
      ' row ' + rowY + ' to eligibility/type buckets ' +
      targetEligibilityBucket + '/' + targetTypeBucket + ' within ' +
      searchLimit + ' seeds');
  }

  const eligibleTerrainTypes = ['GRASS', 'ROAD', 'TRAIN_TRACK'];
  const expectedPickupTypes = [
    'POKE_BALL',
    'GREAT_BALL',
    'QUICK_BALL',
    'HEAVY_BALL'
  ];
  const unsupportedTerrainTypes = [
    'DESERT',
    'WATER',
    'UNKNOWN',
    '',
    null,
    undefined,
    0,
    {},
    []
  ];
  const unsupportedPickupTypes = [
    'MASTER_BALL',
    'THUNDER',
    'ULTRA_BALL',
    'POKEBALL',
    'great_ball',
    '',
    null,
    undefined,
    0,
    {},
    []
  ];

  assert(JSON.stringify(pickupApi.pickupTypes) ===
    JSON.stringify(expectedPickupTypes),
  'supported Pickup Type domain or fixed bucket order changed');
  assert(pickupApi.config.eligibilityBucketCount === 100 &&
    pickupApi.config.eligibleBucketCount === 10,
  'eligibility domain is not exactly 10 of 100 buckets');
  assert(pickupApi.config.typeBucketCount === 4,
    'Pickup Type decision domain is not exactly four buckets');

  unsupportedPickupTypes.forEach(function (pickupType) {
    assert(!pickupApi.isSupportedType(pickupType),
      'unsupported Pickup Type was accepted: ' + String(pickupType));
  });

  const controlledCases = [];
  const typeDecisionCounts = {
    POKE_BALL: 0,
    GREAT_BALL: 0,
    QUICK_BALL: 0,
    HEAVY_BALL: 0
  };
  const descriptorTypeCounts = {
    POKE_BALL: 0,
    GREAT_BALL: 0,
    QUICK_BALL: 0,
    HEAVY_BALL: 0
  };
  const terrainDescriptorCounts = {
    GRASS: 0,
    ROAD: 0,
    TRAIN_TRACK: 0
  };
  let descriptorCount = 0;
  let riverExclusionCount = 0;
  let unsupportedTerrainExclusionCount = 0;
  let randomCalls = 0;

  const originalRandom = Math.random;
  Math.random = function () {
    randomCalls++;
    throw new Error(propertyLabel + ': pickup generation consumed Math.random');
  };

  try {
    eligibleTerrainTypes.forEach(function (terrainType, terrainIndex) {
      for (let eligibilityBucket = 0; eligibilityBucket < 100; eligibilityBucket++) {
        for (let typeBucket = 0; typeBucket < 4; typeBucket++) {
          const rowY = terrainIndex * 10000 + typeBucket * 100 +
            eligibilityBucket - 50;
          const visualSeed = findSeedForBuckets(
            terrainType,
            rowY,
            eligibilityBucket,
            typeBucket
          );
          const expectedEligible = eligibilityBucket <= 9;
          const expectedType = expectedPickupTypes[typeBucket];
          const label = terrainType + ' eligibility/type buckets ' +
            eligibilityBucket + '/' + typeBucket + ', row ' + rowY;

          assert(pickupApi.getEligibilityBucket(
            visualSeed,
            rowY,
            terrainType
          ) === eligibilityBucket,
          label + ' did not retain its controlled eligibility bucket');
          assert(pickupApi.isEligible(visualSeed, rowY, terrainType) ===
            expectedEligible,
          label + ' eligibility did not match the exact 0..9 boundary');
          assert(pickupApi.getTypeBucket(visualSeed, rowY, terrainType) ===
            typeBucket,
          label + ' did not retain its controlled type bucket');
          assert(pickupApi.getType(visualSeed, rowY, terrainType) === expectedType,
            label + ' type bucket did not map to ' + expectedType);

          typeDecisionCounts[expectedType]++;
          const row = { y: rowY, type: terrainType, decorations: [] };
          const outcome = assertZeroOrOneDescriptor(
            row,
            visualSeed,
            expectedEligible,
            expectedType,
            label
          );
          descriptorCount += outcome;
          terrainDescriptorCounts[terrainType] += outcome;
          if (outcome === 1) descriptorTypeCounts[expectedType]++;

          controlledCases.push({
            visualSeed: visualSeed,
            rowY: rowY,
            eligibilityBucket: eligibilityBucket,
            typeBucket: typeBucket
          });
        }
      }

      assert(terrainDescriptorCounts[terrainType] === 40,
        terrainType + ' produced ' + terrainDescriptorCounts[terrainType] +
        ' descriptors across 400 controlled cases instead of exactly 40');
    });

    controlledCases.forEach(function (controlledCase) {
      const riverLabel = 'RIVER exclusion for eligibility/type buckets ' +
        controlledCase.eligibilityBucket + '/' + controlledCase.typeBucket +
        ', row ' + controlledCase.rowY;
      assert(pickupApi.getEligibilityBucket(
        controlledCase.visualSeed,
        controlledCase.rowY,
        'RIVER'
      ) === null, riverLabel + ' entered the eligibility domain');
      assert(pickupApi.getTypeBucket(
        controlledCase.visualSeed,
        controlledCase.rowY,
        'RIVER'
      ) === null, riverLabel + ' entered the type domain');
      assert(!pickupApi.isEligible(
        controlledCase.visualSeed,
        controlledCase.rowY,
        'RIVER'
      ), riverLabel + ' was eligible');
      assertZeroOrOneDescriptor(
        { y: controlledCase.rowY, type: 'RIVER', decorations: [] },
        controlledCase.visualSeed,
        false,
        null,
        riverLabel
      );
      riverExclusionCount++;

      unsupportedTerrainTypes.forEach(function (terrainType) {
        const unsupportedLabel = 'unsupported terrain ' + String(terrainType) +
          ' for eligibility/type buckets ' + controlledCase.eligibilityBucket +
          '/' + controlledCase.typeBucket + ', row ' + controlledCase.rowY;
        assert(pickupApi.getEligibilityBucket(
          controlledCase.visualSeed,
          controlledCase.rowY,
          terrainType
        ) === null, unsupportedLabel + ' entered the eligibility domain');
        assert(pickupApi.getTypeBucket(
          controlledCase.visualSeed,
          controlledCase.rowY,
          terrainType
        ) === null, unsupportedLabel + ' entered the type domain');
        assert(!pickupApi.isEligible(
          controlledCase.visualSeed,
          controlledCase.rowY,
          terrainType
        ), unsupportedLabel + ' was eligible');
        assertZeroOrOneDescriptor(
          { y: controlledCase.rowY, type: terrainType, decorations: [] },
          controlledCase.visualSeed,
          false,
          null,
          unsupportedLabel
        );
        unsupportedTerrainExclusionCount++;
      });
    });
  } finally {
    Math.random = originalRandom;
  }

  assert(randomCalls === 0, 'pickup helpers advanced Math.random');
  assert(controlledCases.length === 1200,
    'did not exhaust the 100 x 4 bucket domain on all three eligible terrains');
  assert(descriptorCount === 120,
    'expected exactly 120 descriptors across 1200 controlled cases, got ' +
      descriptorCount);

  expectedPickupTypes.forEach(function (pickupType) {
    assert(typeDecisionCounts[pickupType] === 300,
      pickupType + ' did not own exactly one of four controlled type buckets');
    assert(descriptorTypeCounts[pickupType] === 30,
      pickupType + ' produced ' + descriptorTypeCounts[pickupType] +
      ' eligible descriptors instead of the exact equal share of 30');
  });

  assert(riverExclusionCount === controlledCases.length,
    'not every controlled case excluded RIVER');
  assert(unsupportedTerrainExclusionCount ===
    controlledCases.length * unsupportedTerrainTypes.length,
  'not every controlled case excluded every unsupported terrain');

  return 'PASS: ' + propertyLabel + '; 1200 controlled eligibility/type cases, ' +
    '120 descriptors (30 per supported type), 1200 River and ' +
    unsupportedTerrainExclusionCount + ' unsupported-terrain exclusions, ' +
    unsupportedPickupTypes.length + ' unsupported types excluded, 0 Math.random calls';
}
