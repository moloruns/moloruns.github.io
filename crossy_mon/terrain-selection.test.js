#!/usr/bin/env node

/**
 * Focused statistical and deterministic validation for Task 20.1.
 * **Validates: Requirements 10.2**
 */
const assert = require('assert');
const {
  TERRAIN_SELECTION_CONFIG,
  getTerrainSequenceContext,
  selectNextTerrain
} = require('./generator.js');

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSequence(length, seed) {
  const random = seededRandom(seed);
  const rows = new Map();
  const types = [];

  for (let y = 0; y < length; y++) {
    const context = getTerrainSequenceContext(rows, y);
    const type = selectNextTerrain(
      context.previousTerrain,
      context.consecutiveCount,
      random,
      context.consecutiveHazardCount
    );
    rows.set(y, { y, type });
    types.push(type);
  }

  return types;
}

function countTypes(types) {
  return types.reduce((counts, type) => {
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
}

function riverRunLengths(types) {
  const runs = [];
  let length = 0;

  for (const type of types) {
    if (type === 'RIVER') {
      length++;
    } else if (length) {
      runs.push(length);
      length = 0;
    }
  }
  if (length) runs.push(length);

  return runs;
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('uses documented 34/40/16/10 base weights and 60% river continuation', () => {
  assert.deepStrictEqual(
    TERRAIN_SELECTION_CONFIG.weights,
    { GRASS: 34, ROAD: 40, RIVER: 16, TRAIN_TRACK: 10 }
  );
  assert.strictEqual(TERRAIN_SELECTION_CONFIG.riverContinuationChance, 0.60);
  assert.strictEqual(TERRAIN_SELECTION_CONFIG.maxConsecutiveRivers, 3);
  assert.strictEqual(TERRAIN_SELECTION_CONFIG.maxConsecutiveHazards, 3);
});

test('deterministic rolls cover every base terrain interval', () => {
  assert.strictEqual(selectNextTerrain('GRASS', 1, () => 0.10, 0), 'GRASS');
  assert.strictEqual(selectNextTerrain('GRASS', 1, () => 0.50, 0), 'ROAD');
  assert.strictEqual(selectNextTerrain('GRASS', 1, () => 0.80, 0), 'RIVER');
  assert.strictEqual(selectNextTerrain('GRASS', 1, () => 0.95, 0), 'TRAIN_TRACK');
});

test('roads exceed the prior 25% baseline and are the most common hazard', () => {
  const types = generateSequence(100000, 20250308);
  const counts = countTypes(types);
  const roadShare = counts.ROAD / types.length;

  assert.ok(roadShare > 0.25, `road share ${roadShare} did not exceed 25%`);
  assert.ok(counts.ROAD > counts.RIVER, 'roads should be more common than rivers');
  assert.ok(counts.ROAD > counts.TRAIN_TRACK, 'roads should be more common than tracks');
  assert.ok(counts.GRASS > 0, 'grass pacing rows must remain present');
});

test('a river guarantees row two and gives row three about a 60% chance', () => {
  const trials = 50000;
  const baseRandom = seededRandom(11);
  const optionalThirdRandom = seededRandom(12);
  let baseRivers = 0;
  let optionalThirdRivers = 0;

  for (let i = 0; i < trials; i++) {
    if (selectNextTerrain('GRASS', 1, baseRandom, 0) === 'RIVER') baseRivers++;
    assert.strictEqual(
      selectNextTerrain('RIVER', 1, () => {
        throw new Error('guaranteed second river consumed randomness');
      }, 1),
      'RIVER'
    );
    if (selectNextTerrain('RIVER', 2, optionalThirdRandom, 2) === 'RIVER') {
      optionalThirdRivers++;
    }
  }

  const baseRate = baseRivers / trials;
  const optionalThirdRate = optionalThirdRivers / trials;
  assert.ok(baseRate > 0.15 && baseRate < 0.17, `unexpected base river rate ${baseRate}`);
  assert.ok(
    optionalThirdRate > 0.58 && optionalThirdRate < 0.62,
    `unexpected optional third-river rate ${optionalThirdRate}`
  );
  assert.ok(optionalThirdRate > baseRate * 3, 'optional third-river increase is not significant');
});

test('every completed river stream is two or three rows', () => {
  const types = generateSequence(100000, 99);
  const runs = [];
  let currentRun = 0;

  for (const type of types) {
    if (type === 'RIVER') {
      currentRun++;
    } else if (currentRun) {
      runs.push(currentRun);
      currentRun = 0;
    }
  }

  assert.ok(runs.includes(2), 'expected at least one two-row river stream');
  assert.ok(runs.includes(3), 'expected at least one three-row river stream');
  assert.ok(runs.every(length => length === 2 || length === 3),
    `completed river stream outside 2-3 rows: ${runs.find(length => length < 2 || length > 3)}`);
  assert.ok(currentRun <= 3, `boundary-truncated river stream exceeded cap: ${currentRun}`);
});

test('river runs and all-hazard streaks never exceed three rows', () => {
  const types = generateSequence(100000, 314159);
  const runs = riverRunLengths(types);
  assert.ok(Math.max(...runs) <= 3, `river run exceeded cap: ${Math.max(...runs)}`);

  let hazardStreak = 0;
  let maxHazardStreak = 0;
  for (const type of types) {
    hazardStreak = type === 'GRASS' ? 0 : hazardStreak + 1;
    maxHazardStreak = Math.max(maxHazardStreak, hazardStreak);
  }
  assert.ok(maxHazardStreak <= 3, `hazard streak exceeded cap: ${maxHazardStreak}`);
});

test('three rivers deterministically force grass without consuming randomness', () => {
  let randomCalls = 0;
  const selected = selectNextTerrain('RIVER', 3, () => {
    randomCalls++;
    return 0;
  }, 3);

  assert.strictEqual(selected, 'GRASS');
  assert.strictEqual(randomCalls, 0);
});

test('world-row context uses prior rows for continuation and future rows only for caps', () => {
  const rows = new Map([
    [7, { y: 7, type: 'GRASS' }],
    [8, { y: 8, type: 'ROAD' }],
    [9, { y: 9, type: 'RIVER' }],
    [11, { y: 11, type: 'RIVER' }]
  ]);

  assert.deepStrictEqual(getTerrainSequenceContext(rows, 10), {
    previousTerrain: 'RIVER',
    consecutiveCount: 1,
    consecutiveHazardCount: 2,
    followingRiverCount: 1,
    followingHazardCount: 1
  });
  assert.deepStrictEqual(getTerrainSequenceContext(rows, 7), {
    previousTerrain: null,
    consecutiveCount: 0,
    consecutiveHazardCount: 0,
    followingRiverCount: 0,
    followingHazardCount: 2
  });

  const gapContext = getTerrainSequenceContext(new Map([
    [11, { y: 11, type: 'RIVER' }],
    [12, { y: 12, type: 'RIVER' }],
    [13, { y: 13, type: 'RIVER' }]
  ]), 10);
  assert.strictEqual(selectNextTerrain(
    gapContext.previousTerrain,
    gapContext.consecutiveCount,
    () => 0.8,
    gapContext.consecutiveHazardCount,
    gapContext.followingRiverCount,
    gapContext.followingHazardCount
  ), 'GRASS');
});

test('different seeded random sources produce different terrain sequences', () => {
  const first = generateSequence(200, 1);
  const second = generateSequence(200, 2);
  assert.notDeepStrictEqual(first, second);
  assert.ok(new Set(first).size > 1, 'terrain sequence should remain varied');
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures++;
    console.error(`✗ ${name}`);
    console.error(error.stack || error.message);
  }
}

if (failures) {
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} terrain selection checks passed`);
}
