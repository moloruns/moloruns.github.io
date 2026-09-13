ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  var terrainApi;
  eval('(function () {\n' + readUtf8(root + '/generator.js') + '\n;terrainApi = {' +
    'TERRAIN_SELECTION_CONFIG: TERRAIN_SELECTION_CONFIG,' +
    'getTerrainSequenceContext: getTerrainSequenceContext,' +
    'selectNextTerrain: selectNextTerrain' +
  '};\n})();');
  const TERRAIN_SELECTION_CONFIG = terrainApi.TERRAIN_SELECTION_CONFIG;
  const getTerrainSequenceContext = terrainApi.getTerrainSequenceContext;
  const selectNextTerrain = terrainApi.selectNextTerrain;

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return function () {
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
      rows.set(y, { y: y, type: type });
      types.push(type);
    }
    return types;
  }

  function countsFor(types) {
    const counts = { GRASS: 0, ROAD: 0, RIVER: 0, TRAIN_TRACK: 0 };
    types.forEach(function (type) { counts[type]++; });
    return counts;
  }

  const weights = TERRAIN_SELECTION_CONFIG.weights;
  assert(weights.GRASS === 34 && weights.ROAD === 40 &&
    weights.RIVER === 16 && weights.TRAIN_TRACK === 10,
  'Base terrain weights changed');
  assert(TERRAIN_SELECTION_CONFIG.riverContinuationChance === 0.60,
    'River continuation chance changed');

  assert(selectNextTerrain('GRASS', 1, function () { return 0.10; }, 0) === 'GRASS',
    'Grass interval failed');
  assert(selectNextTerrain('GRASS', 1, function () { return 0.50; }, 0) === 'ROAD',
    'Road interval failed');
  assert(selectNextTerrain('GRASS', 1, function () { return 0.80; }, 0) === 'RIVER',
    'River interval failed');
  assert(selectNextTerrain('GRASS', 1, function () { return 0.95; }, 0) === 'TRAIN_TRACK',
    'Train interval failed');

  const sequence = generateSequence(100000, 20250308);
  const counts = countsFor(sequence);
  assert(counts.ROAD / sequence.length > 0.25, 'Road share did not exceed prior 25%');
  assert(counts.ROAD > counts.RIVER && counts.ROAD > counts.TRAIN_TRACK,
    'Road was not the most common hazard');
  assert(counts.GRASS > 0, 'Grass pacing rows disappeared');

  const trials = 50000;
  const baseRandom = seededRandom(11);
  const optionalThirdRandom = seededRandom(12);
  let baseRivers = 0;
  let optionalThirdRivers = 0;
  for (let i = 0; i < trials; i++) {
    if (selectNextTerrain('GRASS', 1, baseRandom, 0) === 'RIVER') baseRivers++;
    assert(selectNextTerrain('RIVER', 1, function () {
      throw new Error('Guaranteed second river consumed randomness');
    }, 1) === 'RIVER', 'First river did not guarantee a second row');
    if (selectNextTerrain('RIVER', 2, optionalThirdRandom, 2) === 'RIVER') {
      optionalThirdRivers++;
    }
  }
  const baseRate = baseRivers / trials;
  const optionalThirdRate = optionalThirdRivers / trials;
  assert(baseRate > 0.15 && baseRate < 0.17, 'Base river rate outside tolerance');
  assert(optionalThirdRate > 0.58 && optionalThirdRate < 0.62,
    'Optional third-river rate outside tolerance');
  assert(optionalThirdRate > baseRate * 3, 'Optional third-river increase was not significant');

  let riverRun = 0;
  let maxRiverRun = 0;
  let hazardRun = 0;
  let maxHazardRun = 0;
  let sawTwo = false;
  let sawThree = false;
  sequence.forEach(function (type) {
    if (type === 'RIVER') {
      riverRun++;
    } else {
      if (riverRun > 0) {
        assert(riverRun === 2 || riverRun === 3,
          'Completed river run had invalid length ' + riverRun);
      }
      if (riverRun === 2) sawTwo = true;
      if (riverRun === 3) sawThree = true;
      maxRiverRun = Math.max(maxRiverRun, riverRun);
      riverRun = 0;
    }
    hazardRun = type === 'GRASS' ? 0 : hazardRun + 1;
    maxHazardRun = Math.max(maxHazardRun, hazardRun);
  });
  // A run ending at the inspected boundary may be waiting for its guaranteed
  // next generated row, but it must already respect the hard maximum.
  maxRiverRun = Math.max(maxRiverRun, riverRun);
  assert(riverRun <= 3, 'Boundary-truncated river run exceeded cap');
  assert(sawTwo && sawThree, 'Expected both two- and three-row river streams');
  assert(maxRiverRun <= 3, 'River run exceeded cap');
  assert(maxHazardRun <= 3, 'Mixed hazard run exceeded cap');

  let randomCalls = 0;
  assert(selectNextTerrain('RIVER', 3, function () {
    randomCalls++;
    return 0;
  }, 3) === 'GRASS', 'Three rivers did not force grass');
  assert(randomCalls === 0, 'Forced grass should not consume randomness');

  const contextRows = new Map([
    [7, { y: 7, type: 'GRASS' }],
    [8, { y: 8, type: 'ROAD' }],
    [9, { y: 9, type: 'RIVER' }],
    [11, { y: 11, type: 'RIVER' }]
  ]);
  const context = getTerrainSequenceContext(contextRows, 10);
  assert(context.previousTerrain === 'RIVER' && context.consecutiveCount === 1 &&
    context.consecutiveHazardCount === 2 && context.followingRiverCount === 1 &&
    context.followingHazardCount === 1, 'Bidirectional cap context derivation failed');
  const backwardContext = getTerrainSequenceContext(contextRows, 7);
  assert(backwardContext.previousTerrain === null &&
    backwardContext.followingHazardCount === 2,
    'Future rows incorrectly influenced continuation context');

  const gapRows = new Map([
    [11, { y: 11, type: 'RIVER' }],
    [12, { y: 12, type: 'RIVER' }],
    [13, { y: 13, type: 'RIVER' }]
  ]);
  const gapContext = getTerrainSequenceContext(gapRows, 10);
  assert(selectNextTerrain(
    gapContext.previousTerrain,
    gapContext.consecutiveCount,
    function () { return 0.8; },
    gapContext.consecutiveHazardCount,
    gapContext.followingRiverCount,
    gapContext.followingHazardCount
  ) === 'GRASS', 'Backward gap fill exceeded the river cap');

  const backwardPairRows = new Map([
    [11, { y: 11, type: 'RIVER' }],
    [12, { y: 12, type: 'RIVER' }],
    [13, { y: 13, type: 'GRASS' }]
  ]);
  const backwardPairContext = getTerrainSequenceContext(backwardPairRows, 10);
  const backwardPairType = selectNextTerrain(
    backwardPairContext.previousTerrain,
    backwardPairContext.consecutiveCount,
    function () { return 0.95; },
    backwardPairContext.consecutiveHazardCount,
    backwardPairContext.followingRiverCount,
    backwardPairContext.followingHazardCount
  );
  assert(backwardPairType !== 'RIVER',
    'Backward fill turned a complete two-row river into an oversized run');

  const backwardSingletonRows = new Map([
    [11, { y: 11, type: 'RIVER' }],
    [12, { y: 12, type: 'GRASS' }]
  ]);
  const backwardSingletonContext = getTerrainSequenceContext(backwardSingletonRows, 10);
  assert(selectNextTerrain(
    backwardSingletonContext.previousTerrain,
    backwardSingletonContext.consecutiveCount,
    function () { throw new Error('Singleton repair consumed randomness'); },
    backwardSingletonContext.consecutiveHazardCount,
    backwardSingletonContext.followingRiverCount,
    backwardSingletonContext.followingHazardCount
  ) === 'RIVER', 'Backward fill did not safely complete a truncated river');

  assert(generateSequence(200, 1).join(',') !== generateSequence(200, 2).join(','),
    'Different random seeds produced identical terrain');

  return 'PASS: 9 terrain selection checks passed';
}
