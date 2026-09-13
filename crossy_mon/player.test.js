// Unit tests for Player class
// Tests player state, movement, animation, and position interpolation

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

function assertApproxEquals(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}\nExpected: ${expected} ± ${tolerance}\nActual: ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFalse(condition, message) {
  if (condition) {
    throw new Error(message);
  }
}

function runTests() {
  console.log('Running Player tests...\n');
  
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

// Load Player class
const Player = typeof require !== 'undefined' ? require('./player.js') : window.Player;

// Tests

test('Player initializes at origin (0, 0) by default', () => {
  const player = new Player();
  assertEquals(player.x, 0, 'Player X should be 0');
  assertEquals(player.y, 0, 'Player Y should be 0');
  assertFalse(player.isMoving, 'Player should not be moving initially');
});

test('Player initializes at specified position', () => {
  const player = new Player(5, 10);
  assertEquals(player.x, 5, 'Player X should be 5');
  assertEquals(player.y, 10, 'Player Y should be 10');
});

test('Player has all required state fields', () => {
  const player = new Player(0, 0);
  assertTrue('x' in player, 'Player should have x field');
  assertTrue('y' in player, 'Player should have y field');
  assertTrue('isMoving' in player, 'Player should have isMoving field');
  assertTrue('animationProgress' in player, 'Player should have animationProgress field');
  assertTrue('startPos' in player, 'Player should have startPos field');
  assertTrue('targetPos' in player, 'Player should have targetPos field');
  assertTrue('animationDuration' in player, 'Player should have animationDuration field');
});

test('Player animation duration is within required bounds (100-200ms)', () => {
  const player = new Player();
  assertTrue(player.animationDuration >= 100, 'Animation duration should be >= 100ms');
  assertTrue(player.animationDuration <= 200, 'Animation duration should be <= 200ms');
});

test('move() initiates movement and returns true', () => {
  const player = new Player(0, 0);
  const result = player.move(1, 0);
  assertTrue(result, 'move() should return true when movement starts');
  assertTrue(player.isMoving, 'Player should be moving after move()');
  assertEquals(player.animationProgress, 0.0, 'Animation progress should be 0.0');
});

test('move() sets correct start and target positions', () => {
  const player = new Player(3, 5);
  player.move(1, 0); // Move right
  
  assertEquals(player.startPos.x, 3, 'Start X should be 3');
  assertEquals(player.startPos.y, 5, 'Start Y should be 5');
  assertEquals(player.targetPos.x, 4, 'Target X should be 4');
  assertEquals(player.targetPos.y, 5, 'Target Y should be 5');
});

test('move() blocks additional movement during animation', () => {
  const player = new Player(0, 0);
  player.move(1, 0); // First move
  const result = player.move(0, 1); // Try to move again
  
  assertFalse(result, 'Second move() should return false when animation in progress');
  assertEquals(player.targetPos.x, 1, 'Target should still be from first move');
  assertEquals(player.targetPos.y, 0, 'Target should still be from first move');
});

test('isAnimating() returns correct state', () => {
  const player = new Player(0, 0);
  assertFalse(player.isAnimating(), 'isAnimating() should return false initially');
  
  player.move(1, 0);
  assertTrue(player.isAnimating(), 'isAnimating() should return true during animation');
});

test('getCurrentPosition() returns final position when not animating', () => {
  const player = new Player(5, 10);
  const pos = player.getCurrentPosition();
  
  assertEquals(pos.x, 5, 'Position X should be 5');
  assertEquals(pos.y, 10, 'Position Y should be 10');
});

test('getCurrentPosition() returns interpolated position during animation', () => {
  const player = new Player(0, 0);
  player.move(4, 0); // Move from (0,0) to (4,0)
  
  // Simulate 50% animation progress
  player.animationProgress = 0.5;
  const pos = player.getCurrentPosition();
  
  assertApproxEquals(pos.x, 2.0, 0.01, 'Interpolated X should be 2.0 at 50% progress');
  assertApproxEquals(pos.y, 0.0, 0.01, 'Interpolated Y should be 0.0');
});

test('getCurrentPosition() interpolates correctly at 0% progress', () => {
  const player = new Player(2, 3);
  player.move(2, 2); // Move from (2,3) to (4,5)
  
  player.animationProgress = 0.0;
  const pos = player.getCurrentPosition();
  
  assertApproxEquals(pos.x, 2.0, 0.01, 'Interpolated X should be 2.0 at 0% progress');
  assertApproxEquals(pos.y, 3.0, 0.01, 'Interpolated Y should be 3.0 at 0% progress');
});

test('getCurrentPosition() interpolates correctly at 100% progress', () => {
  const player = new Player(0, 0);
  player.move(3, 5);
  
  player.animationProgress = 1.0;
  const pos = player.getCurrentPosition();
  
  assertApproxEquals(pos.x, 3.0, 0.01, 'Interpolated X should be 3.0 at 100% progress');
  assertApproxEquals(pos.y, 5.0, 0.01, 'Interpolated Y should be 5.0 at 100% progress');
});

test('update() advances animation progress correctly', () => {
  const player = new Player(0, 0);
  player.animationDuration = 100; // 100ms for easier calculation
  player.move(1, 0);
  
  // Update with 50ms elapsed (50% progress)
  player.update(50);
  assertApproxEquals(player.animationProgress, 0.5, 0.01, 'Progress should be 0.5 after 50ms');
  assertTrue(player.isMoving, 'Player should still be moving');
});

test('update() completes animation and updates position', () => {
  const player = new Player(0, 0);
  player.animationDuration = 100;
  player.move(2, 3);
  
  // Update with full duration
  const completed = player.update(100);
  
  assertTrue(completed, 'update() should return true when animation completes');
  assertEquals(player.x, 2, 'Player X should be updated to 2');
  assertEquals(player.y, 3, 'Player Y should be updated to 3');
  assertFalse(player.isMoving, 'Player should not be moving after completion');
  assertEquals(player.animationProgress, 0.0, 'Animation progress should be reset');
});

test('update() returns false when animation not complete', () => {
  const player = new Player(0, 0);
  player.animationDuration = 100;
  player.move(1, 0);
  
  const completed = player.update(50); // Only 50% progress
  assertFalse(completed, 'update() should return false when animation not complete');
});

test('update() returns false when not animating', () => {
  const player = new Player(0, 0);
  const completed = player.update(50);
  assertFalse(completed, 'update() should return false when not animating');
});

test('Movement up (forward) changes Y coordinate correctly', () => {
  const player = new Player(0, 0);
  player.move(0, 1); // Move forward
  player.update(150); // Complete animation
  
  assertEquals(player.x, 0, 'X should remain 0');
  assertEquals(player.y, 1, 'Y should increase to 1');
});

test('Movement down (backward) changes Y coordinate correctly', () => {
  const player = new Player(0, 5);
  player.move(0, -1); // Move backward
  player.update(150);
  
  assertEquals(player.x, 0, 'X should remain 0');
  assertEquals(player.y, 4, 'Y should decrease to 4');
});

test('Movement left changes X coordinate correctly', () => {
  const player = new Player(5, 0);
  player.move(-1, 0); // Move left
  player.update(150);
  
  assertEquals(player.x, 4, 'X should decrease to 4');
  assertEquals(player.y, 0, 'Y should remain 0');
});

test('Movement right changes X coordinate correctly', () => {
  const player = new Player(0, 0);
  player.move(1, 0); // Move right
  player.update(150);
  
  assertEquals(player.x, 1, 'X should increase to 1');
  assertEquals(player.y, 0, 'Y should remain 0');
});

test('Sequential movements work correctly', () => {
  const player = new Player(0, 0);
  
  // First move
  player.move(1, 0);
  player.update(150);
  assertEquals(player.x, 1, 'After first move X should be 1');
  
  // Second move
  player.move(0, 1);
  player.update(150);
  assertEquals(player.y, 1, 'After second move Y should be 1');
  
  // Third move
  player.move(-1, 0);
  player.update(150);
  assertEquals(player.x, 0, 'After third move X should be 0');
});

test('Animation with multiple update calls', () => {
  const player = new Player(0, 0);
  player.animationDuration = 100;
  player.move(4, 0);
  
  // Update in multiple steps
  player.update(25); // 25% progress
  assertApproxEquals(player.animationProgress, 0.25, 0.01, 'Progress should be 0.25');
  
  player.update(25); // 50% progress
  assertApproxEquals(player.animationProgress, 0.50, 0.01, 'Progress should be 0.50');
  
  player.update(50); // Complete (100% progress)
  assertEquals(player.x, 4, 'Final X should be 4');
  assertFalse(player.isMoving, 'Animation should be complete');
});

// Stage 1 visual-state tests

test('Visual hop changes at mid-animation without changing logical coordinates', () => {
  const player = new Player(2, 3);
  player.move(0, 1);
  player.update(75);

  assertEquals(player.x, 2, 'Logical X must remain unchanged during the visual hop');
  assertEquals(player.y, 3, 'Logical Y must remain unchanged during the visual hop');
  assertTrue(player.getHopHeight() > 0, 'Hop height should rise during animation');
  assertApproxEquals(player.getCurrentPosition().y, 3.5, 0.01,
    'Rendered position should still interpolate normally');
});

test('Visual hop returns to ground and facing follows the accepted movement', () => {
  const player = new Player();
  player.move(0, -1);
  assertEquals(player.getVisualState().facing.dy, -1,
    'Backward movement should face the chicken backward');
  player.update(player.animationDuration);

  assertEquals(player.y, -1, 'Logical movement should complete after 150ms');
  assertEquals(player.getHopHeight(), 0, 'Completed movement should return to ground');
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
