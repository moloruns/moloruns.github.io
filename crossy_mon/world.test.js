// Unit tests for World class
// Tests terrain storage, row management, and query methods

// Simple test framework
const tests = [];
const results = { passed: 0, failed: 0, total: 0 };

function test(name, fn) {
  tests.push({ name, fn });
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertDeepEquals(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNull(value, message) {
  if (value !== null) {
    throw new Error(message);
  }
}

function assertArrayLength(array, expectedLength, message) {
  if (array.length !== expectedLength) {
    throw new Error(`${message}\nExpected length: ${expectedLength}\nActual length: ${array.length}`);
  }
}

function runTests() {
  console.log('Running World tests...\n');
  
  tests.forEach(({ name, fn }) => {
    results.total++;
    try {
      fn();
      results.passed++;
      console.log(`✓ ${name}`);
    } catch (error) {
      results.failed++;
      console.error(`✗ ${name}`);
      console.error(`  ${error.message}\n`);
    }
  });
  
  console.log(`\nResults: ${results.passed}/${results.total} passed, ${results.failed} failed`);
  return results.failed === 0;
}

// Load World class
const World = typeof require !== 'undefined' ? require('./world.js') : window.World;

// Tests

test('World initializes with empty terrain map', () => {
  const world = new World();
  assertTrue(world.terrainRows instanceof Map, 'terrainRows should be a Map');
  assertEquals(world.terrainRows.size, 0, 'terrainRows should be empty initially');
});

test('addTerrainRow() adds a terrain row to the world', () => {
  const world = new World();
  const row = {
    y: 5,
    type: 'GRASS',
    obstacles: [],
    platforms: [],
    metadata: {}
  };
  
  world.addTerrainRow(row);
  assertEquals(world.terrainRows.size, 1, 'World should have 1 terrain row');
  assertTrue(world.terrainRows.has(5), 'World should have terrain at Y=5');
});

test('addTerrainRow() stores row indexed by Y coordinate', () => {
  const world = new World();
  const row1 = { y: 0, type: 'GRASS', obstacles: [], platforms: [], metadata: {} };
  const row2 = { y: 10, type: 'ROAD', obstacles: [], platforms: [], metadata: {} };
  
  world.addTerrainRow(row1);
  world.addTerrainRow(row2);
  
  assertEquals(world.terrainRows.size, 2, 'World should have 2 terrain rows');
  assertEquals(world.terrainRows.get(0).type, 'GRASS', 'Row at Y=0 should be GRASS');
  assertEquals(world.terrainRows.get(10).type, 'ROAD', 'Row at Y=10 should be ROAD');
});

test('addTerrainRow() overwrites existing row at same Y coordinate', () => {
  const world = new World();
  const row1 = { y: 5, type: 'GRASS', obstacles: [], platforms: [], metadata: {} };
  const row2 = { y: 5, type: 'ROAD', obstacles: [], platforms: [], metadata: {} };
  
  world.addTerrainRow(row1);
  world.addTerrainRow(row2);
  
  assertEquals(world.terrainRows.size, 1, 'World should have 1 terrain row');
  assertEquals(world.terrainRows.get(5).type, 'ROAD', 'Row at Y=5 should be updated to ROAD');
});

test('removeTerrainRow() removes a terrain row', () => {
  const world = new World();
  const row = { y: 5, type: 'GRASS', obstacles: [], platforms: [], metadata: {} };
  
  world.addTerrainRow(row);
  world.removeTerrainRow(5);
  
  assertEquals(world.terrainRows.size, 0, 'World should have 0 terrain rows after removal');
  assertTrue(!world.terrainRows.has(5), 'World should not have terrain at Y=5');
});

test('removeTerrainRow() does nothing if row does not exist', () => {
  const world = new World();
  const row = { y: 5, type: 'GRASS', obstacles: [], platforms: [], metadata: {} };
  
  world.addTerrainRow(row);
  world.removeTerrainRow(10); // Remove non-existent row
  
  assertEquals(world.terrainRows.size, 1, 'World should still have 1 terrain row');
  assertTrue(world.terrainRows.has(5), 'World should still have terrain at Y=5');
});

test('getTerrainAt() returns terrain row at specified Y coordinate', () => {
  const world = new World();
  const row = { y: 3, type: 'RIVER', obstacles: [], platforms: [], metadata: {} };
  
  world.addTerrainRow(row);
  const terrain = world.getTerrainAt(0, 3);
  
  assertTrue(terrain !== null, 'getTerrainAt should return a terrain object');
  assertEquals(terrain.type, 'RIVER', 'Terrain type should be RIVER');
  assertEquals(terrain.y, 3, 'Terrain Y should be 3');
});

test('getTerrainAt() ignores X coordinate when querying terrain', () => {
  const world = new World();
  const row = { y: 7, type: 'GRASS', obstacles: [], platforms: [], metadata: {} };
  
  world.addTerrainRow(row);
  const terrain1 = world.getTerrainAt(0, 7);
  const terrain2 = world.getTerrainAt(100, 7);
  
  assertEquals(terrain1.type, 'GRASS', 'Terrain at (0,7) should be GRASS');
  assertEquals(terrain2.type, 'GRASS', 'Terrain at (100,7) should be GRASS');
});

test('getTerrainAt() returns null if no terrain exists at Y coordinate', () => {
  const world = new World();
  const terrain = world.getTerrainAt(0, 5);
  
  assertNull(terrain, 'getTerrainAt should return null for non-existent terrain');
});

test('getObstaclesAt() returns empty array when no terrain exists', () => {
  const world = new World();
  const obstacles = world.getObstaclesAt(5, 10);
  
  assertArrayLength(obstacles, 0, 'Should return empty array');
});

test('getObstaclesAt() returns empty array when terrain has no obstacles', () => {
  const world = new World();
  const row = { y: 5, type: 'GRASS', obstacles: [], platforms: [], metadata: {} };
  
  world.addTerrainRow(row);
  const obstacles = world.getObstaclesAt(0, 5);
  
  assertArrayLength(obstacles, 0, 'Should return empty array for grass with no obstacles');
});

test('getObstaclesAt() returns obstacles that overlap with player position', () => {
  const world = new World();
  const row = {
    y: 5,
    type: 'ROAD',
    obstacles: [
      { x: 2, y: 5, width: 2, velocity: 0.02, type: 'CAR' }, // Covers x: [2, 4)
      { x: 7, y: 5, width: 2, velocity: 0.02, type: 'CAR' }  // Covers x: [7, 9)
    ],
    platforms: [],
    metadata: {}
  };
  
  world.addTerrainRow(row);
  
  const obstacles1 = world.getObstaclesAt(2, 5);
  assertArrayLength(obstacles1, 1, 'Player at x=2 should hit first car');
  assertEquals(obstacles1[0].x, 2, 'Should return first car');
  
  const obstacles2 = world.getObstaclesAt(3, 5);
  assertArrayLength(obstacles2, 1, 'Player at x=3 should hit first car');
  
  const obstacles3 = world.getObstaclesAt(7.5, 5);
  assertArrayLength(obstacles3, 1, 'Player at x=7.5 should hit second car');
  assertEquals(obstacles3[0].x, 7, 'Should return second car');
});

test('getObstaclesAt() returns empty array when player is not on any obstacle', () => {
  const world = new World();
  const row = {
    y: 5,
    type: 'ROAD',
    obstacles: [
      { x: 2, y: 5, width: 2, velocity: 0.02, type: 'CAR' }  // Covers x: [2, 4)
    ],
    platforms: [],
    metadata: {}
  };
  
  world.addTerrainRow(row);
  
  const obstacles1 = world.getObstaclesAt(1, 5);
  assertArrayLength(obstacles1, 0, 'Player at x=1 should not hit car');
  
  const obstacles2 = world.getObstaclesAt(4, 5);
  assertArrayLength(obstacles2, 0, 'Player at x=4 should not hit car (exclusive end)');
  
  const obstacles3 = world.getObstaclesAt(10, 5);
  assertArrayLength(obstacles3, 0, 'Player at x=10 should not hit car');
});

test('getObstaclesAt() handles obstacles with width > 1 correctly', () => {
  const world = new World();
  const row = {
    y: 8,
    type: 'TRAIN_TRACK',
    obstacles: [
      { x: 5, y: 8, width: 5, velocity: 0.05, type: 'TRAIN' }  // Covers x: [5, 10)
    ],
    platforms: [],
    metadata: {}
  };
  
  world.addTerrainRow(row);
  
  const obstacles5 = world.getObstaclesAt(5, 8);
  assertArrayLength(obstacles5, 1, 'Player at x=5 should hit train');
  
  const obstacles7 = world.getObstaclesAt(7, 8);
  assertArrayLength(obstacles7, 1, 'Player at x=7 should hit train');
  
  const obstacles9 = world.getObstaclesAt(9, 8);
  assertArrayLength(obstacles9, 1, 'Player at x=9 should hit train');
  
  const obstacles10 = world.getObstaclesAt(10, 8);
  assertArrayLength(obstacles10, 0, 'Player at x=10 should not hit train (exclusive end)');
});

test('getPlatformAt() returns null when no terrain exists', () => {
  const world = new World();
  const platform = world.getPlatformAt(5, 10);
  
  assertNull(platform, 'Should return null when no terrain exists');
});

test('getPlatformAt() returns null when terrain has no platforms', () => {
  const world = new World();
  const row = { y: 5, type: 'GRASS', obstacles: [], platforms: [], metadata: {} };
  
  world.addTerrainRow(row);
  const platform = world.getPlatformAt(0, 5);
  
  assertNull(platform, 'Should return null for terrain with no platforms');
});

test('getPlatformAt() returns platform when player is on it', () => {
  const world = new World();
  const row = {
    y: 10,
    type: 'RIVER',
    obstacles: [],
    platforms: [
      { x: 3, y: 10, width: 3, velocity: 0.015, type: 'LOG' }  // Covers x: [3, 6)
    ],
    metadata: {}
  };
  
  world.addTerrainRow(row);
  
  const platform1 = world.getPlatformAt(3, 10);
  assertTrue(platform1 !== null, 'Player at x=3 should be on platform');
  assertEquals(platform1.type, 'LOG', 'Platform type should be LOG');
  
  const platform2 = world.getPlatformAt(4.5, 10);
  assertTrue(platform2 !== null, 'Player at x=4.5 should be on platform');
  
  const platform3 = world.getPlatformAt(5, 10);
  assertTrue(platform3 !== null, 'Player at x=5 should be on platform');
});

test('getPlatformAt() returns null when player is not on platform', () => {
  const world = new World();
  const row = {
    y: 10,
    type: 'RIVER',
    obstacles: [],
    platforms: [
      { x: 3, y: 10, width: 3, velocity: 0.015, type: 'LOG' }  // Covers x: [3, 6)
    ],
    metadata: {}
  };
  
  world.addTerrainRow(row);
  
  const platform1 = world.getPlatformAt(2, 10);
  assertNull(platform1, 'Player at x=2 should not be on platform');
  
  const platform2 = world.getPlatformAt(6, 10);
  assertNull(platform2, 'Player at x=6 should not be on platform (exclusive end)');
  
  const platform3 = world.getPlatformAt(10, 10);
  assertNull(platform3, 'Player at x=10 should not be on platform');
});

test('getPlatformAt() returns first platform when multiple platforms exist', () => {
  const world = new World();
  const row = {
    y: 10,
    type: 'RIVER',
    obstacles: [],
    platforms: [
      { x: 2, y: 10, width: 2, velocity: 0.015, type: 'LOG' },      // Covers x: [2, 4)
      { x: 6, y: 10, width: 2, velocity: 0.015, type: 'LILY_PAD' }  // Covers x: [6, 8)
    ],
    metadata: {}
  };
  
  world.addTerrainRow(row);
  
  const platform1 = world.getPlatformAt(2.5, 10);
  assertEquals(platform1.type, 'LOG', 'Should find LOG at x=2.5');
  
  const platform2 = world.getPlatformAt(7, 10);
  assertEquals(platform2.type, 'LILY_PAD', 'Should find LILY_PAD at x=7');
  
  const platform3 = world.getPlatformAt(5, 10);
  assertNull(platform3, 'Should find no platform at x=5 (in water gap)');
});

test('World handles multiple terrain types simultaneously', () => {
  const world = new World();
  
  world.addTerrainRow({ y: 0, type: 'GRASS', obstacles: [], platforms: [], metadata: {} });
  world.addTerrainRow({ y: 1, type: 'ROAD', obstacles: [], platforms: [], metadata: {} });
  world.addTerrainRow({ y: 2, type: 'RIVER', obstacles: [], platforms: [], metadata: {} });
  world.addTerrainRow({ y: 3, type: 'TRAIN_TRACK', obstacles: [], platforms: [], metadata: {} });
  
  assertEquals(world.terrainRows.size, 4, 'World should have 4 terrain rows');
  assertEquals(world.getTerrainAt(0, 0).type, 'GRASS', 'Y=0 should be GRASS');
  assertEquals(world.getTerrainAt(0, 1).type, 'ROAD', 'Y=1 should be ROAD');
  assertEquals(world.getTerrainAt(0, 2).type, 'RIVER', 'Y=2 should be RIVER');
  assertEquals(world.getTerrainAt(0, 3).type, 'TRAIN_TRACK', 'Y=3 should be TRAIN_TRACK');
});

test('World handles negative Y coordinates', () => {
  const world = new World();
  const row = { y: -5, type: 'GRASS', obstacles: [], platforms: [], metadata: {} };
  
  world.addTerrainRow(row);
  const terrain = world.getTerrainAt(0, -5);
  
  assertTrue(terrain !== null, 'Should handle negative Y coordinate');
  assertEquals(terrain.type, 'GRASS', 'Terrain at Y=-5 should be GRASS');
});

test('World handles floating point X coordinates for obstacles', () => {
  const world = new World();
  const row = {
    y: 5,
    type: 'ROAD',
    obstacles: [
      { x: 2.5, y: 5, width: 2, velocity: 0.02, type: 'CAR' }  // Covers x: [2.5, 4.5)
    ],
    platforms: [],
    metadata: {}
  };
  
  world.addTerrainRow(row);
  
  const obstacles1 = world.getObstaclesAt(2.5, 5);
  assertArrayLength(obstacles1, 1, 'Player at x=2.5 should hit car');
  
  const obstacles2 = world.getObstaclesAt(3.7, 5);
  assertArrayLength(obstacles2, 1, 'Player at x=3.7 should hit car');
  
  const obstacles3 = world.getObstaclesAt(4.5, 5);
  assertArrayLength(obstacles3, 0, 'Player at x=4.5 should not hit car (exclusive end)');
});

test('getDecorationsAt() returns row-owned records and supports historical rows', () => {
  const world = new World();
  const decorations = [
    { type: 'FLOWER', x: 1, y: 4, blocking: false }
  ];

  world.addTerrainRow({
    y: 4,
    type: 'GRASS',
    obstacles: [],
    platforms: [],
    decorations,
    metadata: {}
  });
  world.addTerrainRow({
    y: 5,
    type: 'GRASS',
    obstacles: [],
    platforms: [],
    metadata: {}
  });

  assertTrue(world.getDecorationsAt(4) === decorations,
    'Should return the row-owned decoration array without reconstructing it');
  assertArrayLength(world.getDecorationsAt(5), 0,
    'Historical rows without decorations should be treated as undecorated');
  assertArrayLength(world.getDecorationsAt(99), 0,
    'Missing rows should have no decorations');
});

test('isBlockedAt() uses one-cell TREE and ROCK occupancy', () => {
  const world = new World();
  world.addTerrainRow({
    y: 8,
    type: 'GRASS',
    obstacles: [],
    platforms: [],
    decorations: [
      { type: 'TREE', x: -2, y: 8, blocking: true },
      { type: 'ROCK', x: 3, y: 8, blocking: true }
    ],
    metadata: {}
  });

  assertTrue(world.isBlockedAt(-2, 8), 'Tree should block at its inclusive left edge');
  assertTrue(world.isBlockedAt(-1.25, 8), 'Tree should block fractional positions inside its cell');
  assertTrue(!world.isBlockedAt(-1, 8), 'Tree should not block at its exclusive right edge');
  assertTrue(world.isBlockedAt(3.5, 8), 'Rock should block fractional positions inside its cell');
  assertTrue(!world.isBlockedAt(4, 8), 'Rock should not block outside its one-cell interval');
});

test('isBlockedAt() ignores non-blockers and malformed Blocking_Props', () => {
  const world = new World();
  world.addTerrainRow({
    y: 9,
    type: 'GRASS',
    obstacles: [],
    platforms: [],
    decorations: [
      { type: 'FLOWER', x: 0, y: 9, blocking: true },
      { type: 'GRASS_TUFT', x: 1, y: 9, blocking: true },
      { type: 'TREE', x: 2, y: 9, blocking: false },
      { type: 'TREE', x: 3.5, y: 9, blocking: true },
      { type: 'ROCK', x: 4, y: 9.5, blocking: true },
      { type: 'TREE', x: Infinity, y: 9, blocking: true },
      { type: 'ROCK', x: 6, y: NaN, blocking: true },
      null
    ],
    metadata: {}
  });

  for (let x = 0; x <= 6; x++) {
    assertTrue(!world.isBlockedAt(x, 9),
      `Invalid or non-blocking decoration at x=${x} should not block movement`);
  }
  assertTrue(!world.isBlockedAt(0, 10), 'Decorations must not block a different row');
});

// Run all tests
if (typeof module !== 'undefined' && require.main === module) {
  // Running in Node.js
  const success = runTests();
  process.exit(success ? 0 : 1);
} else if (typeof window !== 'undefined') {
  // Running in browser
  window.addEventListener('DOMContentLoaded', () => {
    runTests();
  });
}
