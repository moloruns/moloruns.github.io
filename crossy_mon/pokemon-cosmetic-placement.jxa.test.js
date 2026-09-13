ObjC.import('Foundation');

// Feature: pokemon-reskin-and-pokeballs, Property 6: Placement is bounded, playable, and unoccupied
// **Validates: Requirements 3.5, 3.6, 3.7, 3.8, 9.4, 9.5**

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const propertyLabel = 'Feature: pokemon-reskin-and-pokeballs, Property 6: Placement is bounded, playable, and unoccupied';
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  var generatorApi;

  eval('(function () {\n' + readUtf8(root + '/generator.js') + '\n;generatorApi = {' +
    'config: PICKUP_COSMETIC_CONFIG,' +
    'pickupTypes: PICKUP_TYPES,' +
    'generatePickupDescriptor: generatePickupDescriptor,' +
    'getPickupType: getPickupType,' +
    'isPickupEligible: isPickupEligible,' +
    'rankPickupPlacementCandidates: rankPickupPlacementCandidates,' +
    'selectPickupPlacement: selectPickupPlacement,' +
    'swapVisualHash: function (replacement) {' +
      'var previous = visualHash;' +
      'visualHash = replacement;' +
      'return previous;' +
    '}' +
  '};\n})();');

  const config = generatorApi.config;
  const pickupTypes = generatorApi.pickupTypes;
  const generatePickupDescriptor = generatorApi.generatePickupDescriptor;
  const getPickupType = generatorApi.getPickupType;
  const isPickupEligible = generatorApi.isPickupEligible;
  const rankPickupPlacementCandidates = generatorApi.rankPickupPlacementCandidates;
  const selectPickupPlacement = generatorApi.selectPickupPlacement;
  const swapVisualHash = generatorApi.swapVisualHash;

  function assert(condition, message) {
    if (!condition) throw new Error(propertyLabel + ': ' + message);
  }

  function decoration(type, x, y) {
    return {
      id: 'decoration:' + y + ':' + x + ':' + type,
      type: type,
      x: x,
      y: y,
      blocking: type === 'TREE' || type === 'ROCK'
    };
  }

  function occupiedCells(decorations) {
    const occupied = Object.create(null);
    decorations.forEach(function (record) {
      occupied[record.x] = true;
    });
    return occupied;
  }

  function findEligibleSeedForType(start, rowY, terrainType, expectedType) {
    for (let offset = 0; offset < 100000; offset++) {
      const seed = start + offset;
      if (isPickupEligible(seed, rowY, terrainType) &&
          getPickupType(seed, rowY, terrainType) === expectedType) {
        return seed;
      }
    }
    throw new Error(propertyLabel + ': unable to find deterministic eligible seed for ' +
      expectedType);
  }

  let measuredCalls = 0;
  let maximumChecks = 0;
  function measureCandidateChecks(callback) {
    const originalHas = Set.prototype.has;
    let checks = 0;
    let value;
    Set.prototype.has = function (candidate) {
      checks++;
      return originalHas.call(this, candidate);
    };
    try {
      value = callback();
    } finally {
      Set.prototype.has = originalHas;
    }
    measuredCalls++;
    maximumChecks = Math.max(maximumChecks, checks);
    assert(checks <= 31, 'placement exceeded 31 candidate checks with ' + checks);
    return { value: value, checks: checks };
  }

  function assertSafeDescriptor(result, row, expectedType, message) {
    const descriptor = result.value;
    const occupied = occupiedCells(row.decorations);
    assert(descriptor !== null, message + ': expected a descriptor');
    assert(Object.isFrozen(descriptor), message + ': descriptor is not immutable');
    assert(descriptor.type === expectedType,
      message + ': expected ' + expectedType + ', got ' + descriptor.type);
    assert(pickupTypes.indexOf(descriptor.type) >= 0,
      message + ': descriptor type is unsupported');
    assert(Number.isInteger(descriptor.x), message + ': x is not an integer');
    assert(descriptor.x >= config.minX && descriptor.x <= config.maxX,
      message + ': x is outside -15..15');
    assert(descriptor.y === row.y && descriptor.terrainType === row.type,
      message + ': descriptor does not match its owner row');
    assert(!occupied[descriptor.x], message + ': descriptor overlaps scenery at x=' + descriptor.x);
    assert(result.checks >= 1 && result.checks <= 31,
      message + ': successful placement used an invalid check count ' + result.checks);
  }

  assert(config.minX === -15 && config.maxX === 15,
    'production playable cosmetic span is not -15..15');
  assert(pickupTypes.length === 4 &&
    pickupTypes[0] === 'POKE_BALL' &&
    pickupTypes[1] === 'GREAT_BALL' &&
    pickupTypes[2] === 'QUICK_BALL' &&
    pickupTypes[3] === 'HEAVY_BALL',
  'production pickup type domain is not the required four-type mapping');

  const terrainTypes = ['GRASS', 'ROAD', 'TRAIN_TRACK'];
  const decorationTypes = ['TREE', 'ROCK', 'FLOWER', 'GRASS_TUFT'];
  const seenDecorationTypes = Object.create(null);
  const generatedTypeCounts = Object.create(null);
  const generatedCaseCount = 160;
  let emptyOccupancyCases = 0;
  let partialOccupancyCases = 0;

  pickupTypes.forEach(function (pickupType) {
    generatedTypeCounts[pickupType] = 0;
  });

  for (let caseIndex = 0; caseIndex < generatedCaseCount; caseIndex++) {
    const expectedType = pickupTypes[caseIndex % pickupTypes.length];
    const terrainType = terrainTypes[caseIndex % terrainTypes.length];
    const rowY = caseIndex % 2 === 0 ? caseIndex + 1 : -(caseIndex + 1);
    const occupancyCount = caseIndex % 17;
    const decorations = [];

    for (let ordinal = 0; ordinal < occupancyCount; ordinal++) {
      const type = decorationTypes[(caseIndex + ordinal) % decorationTypes.length];
      const x = ((caseIndex * 7 + ordinal * 11) % 31) - 15;
      decorations.push(decoration(type, x, rowY));
      seenDecorationTypes[type] = true;
    }

    if (occupancyCount === 0) emptyOccupancyCases++;
    else partialOccupancyCases++;

    const row = { y: rowY, type: terrainType, decorations: decorations };
    const seed = findEligibleSeedForType(
      caseIndex * 10007,
      rowY,
      terrainType,
      expectedType
    );
    const result = measureCandidateChecks(function () {
      return generatePickupDescriptor(row, seed);
    });
    assertSafeDescriptor(result, row, expectedType, 'generated case ' + caseIndex);
    generatedTypeCounts[expectedType]++;
  }

  decorationTypes.forEach(function (type) {
    assert(seenDecorationTypes[type], 'generated cases did not include ' + type);
  });
  pickupTypes.forEach(function (pickupType) {
    assert(generatedTypeCounts[pickupType] === generatedCaseCount / pickupTypes.length,
      pickupType + ' did not receive equal generated occupancy coverage');
  });
  assert(emptyOccupancyCases > 0, 'generated cases did not include empty occupancy');
  assert(partialOccupancyCases > 0, 'generated cases did not include partial occupancy');

  let oneFreeBoundaryCaseCount = 0;
  function runOneFreeBoundaryCase(freeX, rowY, terrainType, expectedType, seedStart) {
    const decorations = [];
    for (let x = -15; x <= 15; x++) {
      if (x !== freeX) {
        const type = decorationTypes[(x + 15) % decorationTypes.length];
        decorations.push(decoration(type, x, rowY));
      }
    }
    const row = { y: rowY, type: terrainType, decorations: decorations };
    const seed = findEligibleSeedForType(seedStart, rowY, terrainType, expectedType);
    const result = measureCandidateChecks(function () {
      return generatePickupDescriptor(row, seed);
    });
    assertSafeDescriptor(result, row, expectedType,
      'one-free boundary x=' + freeX + ', type=' + expectedType);
    assert(result.value.x === freeX,
      'one-free boundary case selected ' + result.value.x + ' instead of ' + freeX);
    oneFreeBoundaryCaseCount++;
  }

  pickupTypes.forEach(function (pickupType, typeIndex) {
    runOneFreeBoundaryCase(
      -15,
      -501 - typeIndex,
      terrainTypes[typeIndex % terrainTypes.length],
      pickupType,
      700001 + typeIndex * 10000
    );
    runOneFreeBoundaryCase(
      15,
      502 + typeIndex,
      terrainTypes[(typeIndex + 1) % terrainTypes.length],
      pickupType,
      800001 + typeIndex * 10000
    );
  });

  let exhaustedCaseCount = 0;
  pickupTypes.forEach(function (pickupType, typeIndex) {
    const exhaustedY = 601 + typeIndex;
    const exhaustedDecorations = [];
    for (let exhaustedX = -15; exhaustedX <= 15; exhaustedX++) {
      exhaustedDecorations.push(decoration(
        decorationTypes[(exhaustedX + 15) % decorationTypes.length],
        exhaustedX,
        exhaustedY
      ));
    }
    const exhaustedRow = {
      y: exhaustedY,
      type: terrainTypes[typeIndex % terrainTypes.length],
      decorations: exhaustedDecorations
    };
    const exhaustedSeed = findEligibleSeedForType(
      900001 + typeIndex * 10000,
      exhaustedY,
      exhaustedRow.type,
      pickupType
    );
    const exhaustedResult = measureCandidateChecks(function () {
      return generatePickupDescriptor(exhaustedRow, exhaustedSeed);
    });
    assert(exhaustedResult.value === null,
      'fully occupied span produced a ' + pickupType + ' descriptor');
    assert(exhaustedResult.checks === 31,
      'fully occupied span for ' + pickupType + ' did not terminate after exactly 31 checks');
    exhaustedCaseCount++;
  });

  const malformedRows = [
    { row: null, seed: 1000000 },
    { row: {}, seed: 1000001 },
    { row: { y: 1.5, type: 'GRASS', decorations: [] }, seed: 1000002 },
    { row: { y: 2, type: 'RIVER', decorations: [] }, seed: 1000003 },
    { row: { y: 3, type: 'UNSUPPORTED', decorations: [] }, seed: 1000004 },
    {
      row: { y: 4, type: 'GRASS' },
      seed: findEligibleSeedForType(1010000, 4, 'GRASS', 'POKE_BALL')
    },
    {
      row: { y: 5, type: 'GRASS', decorations: null },
      seed: findEligibleSeedForType(1020000, 5, 'GRASS', 'GREAT_BALL')
    },
    {
      row: { y: 6, type: 'GRASS', decorations: {} },
      seed: findEligibleSeedForType(1030000, 6, 'GRASS', 'QUICK_BALL')
    }
  ];

  const malformedScenery = [
    null,
    [],
    { x: 0, y: 700 },
    { type: '', x: 0, y: 700 },
    { type: 'TREE', x: NaN, y: 700 },
    { type: 'TREE', x: 0.5, y: 700 },
    { type: 'TREE', x: -16, y: 700 },
    { type: 'TREE', x: 16, y: 700 },
    { type: 'TREE', x: 0 },
    { type: 'TREE', x: 0, y: 700.5 },
    { type: 'TREE', x: 0, y: 701 }
  ];

  let malformedCaseCount = 0;
  malformedRows.forEach(function (testCase, index) {
    const result = measureCandidateChecks(function () {
      return generatePickupDescriptor(testCase.row, testCase.seed);
    });
    assert(result.value === null, 'malformed row case ' + index + ' produced a descriptor');
    assert(result.checks === 0, 'malformed row case ' + index + ' scanned candidates');
    malformedCaseCount++;
  });

  malformedScenery.forEach(function (record, index) {
    const rowY = 700;
    const terrainType = terrainTypes[index % terrainTypes.length];
    const expectedType = pickupTypes[index % pickupTypes.length];
    const row = { y: rowY, type: terrainType, decorations: [record] };
    const seed = findEligibleSeedForType(
      1100000 + index * 100,
      rowY,
      terrainType,
      expectedType
    );
    const result = measureCandidateChecks(function () {
      return generatePickupDescriptor(row, seed);
    });
    assert(result.value === null,
      'malformed scenery case ' + index + ' produced a descriptor');
    assert(result.checks === 0,
      'malformed scenery case ' + index + ' scanned candidates');
    malformedCaseCount++;
  });

  const originalVisualHash = swapVisualHash(function () { return 0; });
  swapVisualHash(originalVisualHash);
  const malformedHashValues = [NaN, -1, 0x100000000, 1.5, null, undefined, '7'];
  malformedHashValues.forEach(function (malformedHash, index) {
    const previousHash = swapVisualHash(function () { return malformedHash; });
    try {
      const row = { y: 800 + index, type: 'ROAD', decorations: [] };
      const result = measureCandidateChecks(function () {
        return selectPickupPlacement(row, index);
      });
      assert(result.value === null,
        'malformed hash case ' + index + ' produced a placement');
      assert(result.checks === 0,
        'malformed hash case ' + index + ' scanned candidates');
      assert(rankPickupPlacementCandidates(index, row.y, row.type).length === 0,
        'malformed hash case ' + index + ' produced a candidate ranking');
    } finally {
      swapVisualHash(previousHash);
    }
    malformedCaseCount++;
  });

  const recoveryRow = { y: 999, type: 'GRASS', decorations: [] };
  const recoveryResult = measureCandidateChecks(function () {
    return selectPickupPlacement(recoveryRow, 'continued-execution');
  });
  assert(Number.isInteger(recoveryResult.value) &&
    recoveryResult.value >= -15 && recoveryResult.value <= 15,
    'valid placement did not continue after malformed inputs');

  assert(maximumChecks === 31,
    'test did not exercise the hard 31-check bound; observed ' + maximumChecks);

  return 'PASS: ' + propertyLabel + '; ' + generatedCaseCount +
    ' deterministic occupancy cases (40 per Pickup Type), ' +
    oneFreeBoundaryCaseCount + ' one-free boundary cases, ' +
    exhaustedCaseCount + ' full-span exhaustion cases, ' +
    malformedCaseCount + ' malformed row/scenery/hash cases, ' + measuredCalls +
    ' instrumented placement calls, maximum 31 candidate checks';
}
