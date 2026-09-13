// Unit tests for generator module

/**
 * Simple test runner
 */
function runTests() {
  const tests = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    tests.push({ name, fn });
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

  // Test: generateGrass creates grass terrain row
  test('generateGrass creates grass terrain row', () => {
    const row = generateGrass(5);
    assertEqual(row.y, 5, 'Y coordinate should match input');
    assertEqual(row.type, 'GRASS', 'Type should be GRASS');
    assertEqual(row.obstacles, [], 'Obstacles should be empty array');
    assertEqual(row.platforms, [], 'Platforms should be empty array');
    assertTrue(row.metadata !== undefined, 'Metadata should exist');
  });

  // Test: generateGrass with different Y coordinates
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

  // Test: generateGrass has no hazards (Requirement 6.1)
  test('generateGrass has no hazards (Requirement 6.1)', () => {
    const row = generateGrass(100);
    assertEqual(row.obstacles.length, 0, 'Grass should have no obstacles');
    assertEqual(row.platforms.length, 0, 'Grass should have no platforms');
  });

  // Run all tests
  console.log('Running generator tests...\n');
  
  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  ${error.message}\n`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Run tests if this file is loaded
if (typeof generateGrass === 'function') {
  runTests();
}
