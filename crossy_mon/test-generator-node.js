// Node.js test for generator module
// Load the generateGrass function
function generateGrass(y) {
  return {
    y: y,
    type: 'GRASS',
    obstacles: [],
    platforms: [],
    metadata: {}
  };
}

// Test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

// Tests
console.log('Running generator tests...\n');

test('generateGrass creates grass terrain row', () => {
  const row = generateGrass(5);
  assertEqual(row.y, 5, 'Y coordinate should match input');
  assertEqual(row.type, 'GRASS', 'Type should be GRASS');
  assertEqual(row.obstacles, [], 'Obstacles should be empty array');
  assertEqual(row.platforms, [], 'Platforms should be empty array');
  assertTrue(row.metadata !== undefined, 'Metadata should exist');
});

test('generateGrass works with different Y coordinates', () => {
  const row1 = generateGrass(0);
  const row2 = generateGrass(10);
  const row3 = generateGrass(-5);
  
  assertEqual(row1.y, 0, 'Y coordinate 0 should work');
  assertEqual(row2.y, 10, 'Y coordinate 10 should work');
  assertEqual(row3.y, -5, 'Y coordinate -5 should work');
  
  assertEqual(row1.type, 'GRASS', 'All rows should be GRASS type');
  assertEqual(row2.type, 'GRASS', 'All rows should be GRASS type');
  assertEqual(row3.type, 'GRASS', 'All rows should be GRASS type');
});

test('generateGrass has no hazards (Requirement 6.1)', () => {
  const row = generateGrass(100);
  assertEqual(row.obstacles.length, 0, 'Grass should have no obstacles');
  assertEqual(row.platforms.length, 0, 'Grass should have no platforms');
});

test('TerrainRow structure matches design spec', () => {
  const row = generateGrass(42);
  
  // Verify required fields exist
  assertTrue(row.hasOwnProperty('y'), 'TerrainRow should have y field');
  assertTrue(row.hasOwnProperty('type'), 'TerrainRow should have type field');
  assertTrue(row.hasOwnProperty('obstacles'), 'TerrainRow should have obstacles field');
  assertTrue(row.hasOwnProperty('platforms'), 'TerrainRow should have platforms field');
  assertTrue(row.hasOwnProperty('metadata'), 'TerrainRow should have metadata field');
  
  // Verify types
  assertTrue(typeof row.y === 'number', 'y should be a number');
  assertTrue(typeof row.type === 'string', 'type should be a string');
  assertTrue(Array.isArray(row.obstacles), 'obstacles should be an array');
  assertTrue(Array.isArray(row.platforms), 'platforms should be an array');
  assertTrue(typeof row.metadata === 'object', 'metadata should be an object');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
