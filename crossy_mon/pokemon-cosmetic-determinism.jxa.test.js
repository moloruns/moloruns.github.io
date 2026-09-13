ObjC.import('Foundation');

// Feature: pokemon-reskin-and-pokeballs, Property 7: Pickup derivation is deterministic and order-independent
// **Validates: Requirements 4.1, 4.2, 4.9, 9.6**

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const propertyLabel = 'Feature: pokemon-reskin-and-pokeballs, Property 7: Pickup derivation is deterministic and order-independent';
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  var pickupApi;

  eval('(function () {\n' + readUtf8(root + '/generator.js') + '\n;pickupApi = {' +
    'config: PICKUP_COSMETIC_CONFIG,' +
    'deriveKey: derivePickupCosmeticKey,' +
    'eligibilityBucket: getPickupEligibilityBucket,' +
    'isEligible: isPickupEligible,' +
    'typeBucket: getPickupTypeBucket,' +
    'getType: getPickupType,' +
    'rankCandidates: rankPickupPlacementCandidates,' +
    'selectPlacement: selectPickupPlacement,' +
    'generateDescriptor: generatePickupDescriptor,' +
    'createState: createPickupState,' +
    'attachState: attachRowPickupState' +
  '};\n})();');

  function assert(condition, message) {
    if (!condition) throw new Error(propertyLabel + ': ' + message);
  }

  function canonical(value) {
    return JSON.stringify(value);
  }

  function cloneDecorations(decorations, reverseOrder) {
    const copy = decorations.map(function (decoration) {
      return Object.freeze({
        id: decoration.id,
        type: decoration.type,
        x: decoration.x,
        y: decoration.y,
        blocking: decoration.blocking,
        variant: decoration.variant,
        paletteIndex: decoration.paletteIndex
      });
    });
    if (reverseOrder) copy.reverse();
    return Object.freeze(copy);
  }

  function buildDecorations(caseIndex, rowY) {
    const cells = [-15, -11, -6, -1, 4, 10, 15];
    const types = ['TREE', 'ROCK', 'FLOWER', 'GRASS_TUFT'];
    const count = caseIndex % 8;
    const records = [];

    for (let index = 0; index < count; index++) {
      const cellIndex = (caseIndex * 3 + index * 5) % cells.length;
      const type = types[(caseIndex + index) % types.length];
      records.push(Object.freeze({
        id: 'scenery:' + caseIndex + ':' + index,
        type: type,
        x: cells[cellIndex],
        y: rowY,
        blocking: type === 'TREE' || type === 'ROCK',
        variant: (caseIndex + index) % 3,
        paletteIndex: (caseIndex * 2 + index) % 3
      }));
    }

    return Object.freeze(records);
  }

  function buildRow(rowY, terrainType, decorations, reverseOrder) {
    return {
      y: rowY,
      type: terrainType,
      decorations: cloneDecorations(decorations, reverseOrder)
    };
  }

  function allPermutations(values) {
    const results = [];

    function visit(prefix, remaining) {
      if (remaining.length === 0) {
        results.push(prefix);
        return;
      }
      for (let index = 0; index < remaining.length; index++) {
        visit(
          prefix.concat([remaining[index]]),
          remaining.slice(0, index).concat(remaining.slice(index + 1))
        );
      }
    }

    visit([], values);
    return results;
  }

  function findControlledSeed(caseIndex, rowY, terrainType, targetTypeBucket) {
    for (let attempt = 0; attempt < 20000; attempt++) {
      const candidateSeed = 'property-7-seed:' + caseIndex + ':' + attempt;
      if (
        pickupApi.isEligible(candidateSeed, rowY, terrainType) &&
        pickupApi.typeBucket(candidateSeed, rowY, terrainType) === targetTypeBucket
      ) {
        return candidateSeed;
      }
    }
    throw new Error(propertyLabel + ': unable to find eligible type bucket ' +
      targetTypeBucket + ' for case ' + caseIndex);
  }

  function snapshot(row, visualSeed) {
    const variantKey = pickupApi.deriveKey(
      visualSeed,
      row.y,
      row.type,
      'variant'
    );
    return {
      eligibilityBucket: pickupApi.eligibilityBucket(visualSeed, row.y, row.type),
      eligible: pickupApi.isEligible(visualSeed, row.y, row.type),
      typeBucket: pickupApi.typeBucket(visualSeed, row.y, row.type),
      pickupType: pickupApi.getType(visualSeed, row.y, row.type),
      candidateRanking: pickupApi.rankCandidates(visualSeed, row.y, row.type),
      selectedCell: pickupApi.selectPlacement(row, visualSeed),
      variantKey: variantKey,
      variant: variantKey === null ? null : variantKey % pickupApi.config.variantCount,
      descriptor: pickupApi.generateDescriptor(row, visualSeed)
    };
  }

  function assertEquivalent(left, right, context) {
    assert(left.eligibilityBucket === right.eligibilityBucket,
      context + ': eligibility bucket changed');
    assert(left.eligible === right.eligible,
      context + ': eligibility decision changed');
    assert(left.typeBucket === right.typeBucket,
      context + ': Pickup Type bucket changed');
    assert(left.pickupType === right.pickupType,
      context + ': Pickup Type changed');
    assert(canonical(left.candidateRanking) === canonical(right.candidateRanking),
      context + ': candidate ranking changed');
    assert(left.selectedCell === right.selectedCell,
      context + ': selected cell changed');
    assert(left.variantKey === right.variantKey && left.variant === right.variant,
      context + ': visual variant changed');
    assert(canonical(left.descriptor) === canonical(right.descriptor),
      context + ': descriptor value changed');
  }

  function assertImmutableDescriptor(descriptor, context) {
    assert(descriptor !== null, context + ': expected an eligible descriptor');
    assert(Object.isFrozen(descriptor), context + ': descriptor is not frozen');

    let xMutationThrew = false;
    let typeMutationThrew = false;
    try {
      (function () {
        'use strict';
        descriptor.x = descriptor.x === 15 ? 14 : descriptor.x + 1;
      })();
    } catch (error) {
      xMutationThrew = true;
    }
    try {
      (function () {
        'use strict';
        descriptor.type = 'MASTER_BALL';
      })();
    } catch (error) {
      typeMutationThrew = true;
    }
    assert(xMutationThrew && typeMutationThrew,
      context + ': frozen descriptor accepted mutation');
  }

  function assertInitialState(state, context) {
    assert(state && typeof state === 'object' && !Array.isArray(state),
      context + ': missing Pickup State');
    assert(Object.keys(state).length === 2 &&
      Object.prototype.hasOwnProperty.call(state, 'descriptor') &&
      Object.prototype.hasOwnProperty.call(state, 'consumed'),
    context + ': Pickup State schema changed');
    assert(state.consumed === false,
      context + ': initial Pickup State was consumed');
    assertImmutableDescriptor(state.descriptor, context + ' descriptor');
  }

  const terrainTypes = ['GRASS', 'ROAD', 'TRAIN_TRACK'];
  const pickupTypes = ['POKE_BALL', 'GREAT_BALL', 'QUICK_BALL', 'HEAVY_BALL'];
  const caseCount = 120;
  const orderPermutations = allPermutations([0, 1, 2, 3]);
  const uniqueOrders = new Set(orderPermutations.map(function (order) {
    return order.join(',');
  }));
  assert(orderPermutations.length === 24 && uniqueOrders.size === 24,
    'expected all 24 permutations of target plus three unrelated rows');

  const originalRandom = Math.random;
  let randomCalls = 0;
  const usedSeeds = new Set();
  const seenTerrainTypes = new Set();
  const seenPickupTypes = new Set();
  const pickupTypeCounts = Object.create(null);
  let positiveRows = 0;
  let negativeRows = 0;
  let permutationChecks = 0;
  let regenerationChecks = 0;

  Math.random = function () {
    randomCalls++;
    throw new Error(propertyLabel + ': pickup derivation consumed Math.random');
  };

  try {
    for (let caseIndex = 0; caseIndex < caseCount; caseIndex++) {
      const terrainType = terrainTypes[caseIndex % terrainTypes.length];
      const targetTypeBucket = caseIndex % pickupTypes.length;
      const expectedPickupType = pickupTypes[targetTypeBucket];
      const rowY = caseIndex % 2 === 0 ? -(caseIndex + 1) : caseIndex + 1;
      const decorations = buildDecorations(caseIndex, rowY);
      const visualSeed = findControlledSeed(
        caseIndex,
        rowY,
        terrainType,
        targetTypeBucket
      );

      usedSeeds.add(visualSeed);
      seenTerrainTypes.add(terrainType);
      seenPickupTypes.add(expectedPickupType);
      pickupTypeCounts[expectedPickupType] =
        (pickupTypeCounts[expectedPickupType] || 0) + 1;
      if (rowY > 0) positiveRows++;
      if (rowY < 0) negativeRows++;

      const baselineRow = buildRow(rowY, terrainType, decorations, false);
      const repeatedRow = buildRow(rowY, terrainType, decorations, false);
      const reorderedSceneryRow = buildRow(rowY, terrainType, decorations, true);
      const baseline = snapshot(baselineRow, visualSeed);
      const repeated = snapshot(repeatedRow, visualSeed);
      const reorderedScenery = snapshot(reorderedSceneryRow, visualSeed);
      const caseLabel = 'case ' + caseIndex + ' (' + terrainType + ', y=' + rowY +
        ', type=' + expectedPickupType + ')';

      assert(baseline.eligible, caseLabel + ': controlled seed was not eligible');
      assert(baseline.typeBucket === targetTypeBucket,
        caseLabel + ': controlled Pickup Type bucket changed');
      assert(baseline.pickupType === expectedPickupType,
        caseLabel + ': controlled Pickup Type changed');
      assert(baseline.candidateRanking.length === 31,
        caseLabel + ': candidate ranking did not contain all 31 cells');
      assert(baseline.selectedCell >= -15 && baseline.selectedCell <= 15,
        caseLabel + ': selected cell left the playable span');
      assert(baseline.descriptor.type === expectedPickupType,
        caseLabel + ': descriptor did not include the controlled Pickup Type');
      assert(baseline.descriptor.variant === baseline.variant,
        caseLabel + ': descriptor variant did not match its stable variant key');
      assertImmutableDescriptor(baseline.descriptor, caseLabel + ' baseline');
      assertEquivalent(baseline, repeated, caseLabel + ' repeated generation');
      assertEquivalent(baseline, reorderedScenery,
        caseLabel + ' equivalent reordered scenery');

      const retainedRows = new Map();
      const retainedRow = buildRow(rowY, terrainType, decorations, false);
      pickupApi.attachState(retainedRow, visualSeed);
      retainedRows.set(rowY, retainedRow);
      assertInitialState(retainedRow.cosmetics, caseLabel + ' retained state');
      const retainedState = retainedRow.cosmetics;
      const retainedDescriptor = retainedState.descriptor;
      const retainedDescriptorValue = canonical(retainedDescriptor);

      pickupApi.attachState(retainedRow, visualSeed);
      assert(retainedRow.cosmetics === retainedState,
        caseLabel + ': idempotent retained-row attachment replaced Pickup State');
      assert(retainedRow.cosmetics.descriptor === retainedDescriptor,
        caseLabel + ': idempotent retained-row attachment replaced descriptor');

      retainedRows.delete(rowY);
      assert(!retainedRows.has(rowY), caseLabel + ': cleanup did not remove the row');

      const regeneratedRow = buildRow(rowY, terrainType, decorations, true);
      pickupApi.attachState(regeneratedRow, visualSeed);
      assertInitialState(regeneratedRow.cosmetics, caseLabel + ' regenerated state');
      assert(regeneratedRow.cosmetics !== retainedState,
        caseLabel + ': regeneration unexpectedly reused Pickup State identity');
      assert(regeneratedRow.cosmetics.descriptor !== retainedDescriptor,
        caseLabel + ': regeneration unexpectedly reused descriptor identity');
      assert(canonical(regeneratedRow.cosmetics.descriptor) === retainedDescriptorValue,
        caseLabel + ': cleanup/regeneration changed descriptor value');
      assertEquivalent(baseline, snapshot(regeneratedRow, visualSeed),
        caseLabel + ' cleanup/regeneration');
      regenerationChecks++;

      const rowSpecs = [
        {
          target: true,
          y: rowY,
          type: terrainType,
          decorations: decorations
        },
        {
          target: false,
          y: rowY - 1001,
          type: terrainTypes[(caseIndex + 1) % terrainTypes.length],
          decorations: buildDecorations(caseIndex + 31, rowY - 1001)
        },
        {
          target: false,
          y: rowY + 2003,
          type: terrainTypes[(caseIndex + 2) % terrainTypes.length],
          decorations: buildDecorations(caseIndex + 67, rowY + 2003)
        },
        {
          target: false,
          y: rowY - 3007,
          type: terrainTypes[caseIndex % terrainTypes.length],
          decorations: buildDecorations(caseIndex + 101, rowY - 3007)
        }
      ];

      orderPermutations.forEach(function (order, orderIndex) {
        let targetOutcome = null;
        order.forEach(function (specIndex, sequenceIndex) {
          const spec = rowSpecs[specIndex];
          const row = buildRow(
            spec.y,
            spec.type,
            spec.decorations,
            (orderIndex + sequenceIndex) % 2 === 1
          );
          const outcome = snapshot(row, visualSeed);
          if (spec.target) targetOutcome = outcome;
        });
        assert(targetOutcome !== null,
          caseLabel + ': target row missing from order permutation ' + order.join(','));
        assertEquivalent(baseline, targetOutcome,
          caseLabel + ' unrelated row order ' + order.join(','));
        permutationChecks++;
      });
    }
  } finally {
    Math.random = originalRandom;
  }

  assert(randomCalls === 0, 'pickup helpers advanced Math.random');
  assert(usedSeeds.size === caseCount,
    'expected one distinct Visual Seed per deterministic case');
  assert(positiveRows === caseCount / 2 && negativeRows === caseCount / 2,
    'cases did not evenly cover positive and negative row coordinates');
  terrainTypes.forEach(function (terrainType) {
    assert(seenTerrainTypes.has(terrainType),
      'cases did not cover eligible terrain type ' + terrainType);
  });
  pickupTypes.forEach(function (pickupType) {
    assert(seenPickupTypes.has(pickupType),
      'cases did not cover Pickup Type ' + pickupType);
    assert(pickupTypeCounts[pickupType] === caseCount / pickupTypes.length,
      pickupType + ' did not receive exactly ' +
        (caseCount / pickupTypes.length) + ' controlled cases');
  });
  assert(permutationChecks === caseCount * 24,
    'did not evaluate every unrelated-row order permutation');
  assert(regenerationChecks === caseCount,
    'did not evaluate cleanup/regeneration for every deterministic case');

  return 'PASS: ' + propertyLabel + '; 120 deterministic eligible cases ' +
    '(30 per Pickup Type), 2880 exhaustive unrelated-row permutations, 120 ' +
    'cleanup/regeneration checks, immutable descriptors, 0 Math.random calls';
}
