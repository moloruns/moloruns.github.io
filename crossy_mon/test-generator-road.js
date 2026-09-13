// Node.js test for generateRoad function

// Copy the function here for testing
function generateRoad(y) {
  // Random number of cars (2-4)
  const numCars = Math.floor(Math.random() * 3) + 2; // 2, 3, or 4
  
  // Random direction: -1 (left) or 1 (right)
  const direction = Math.random() < 0.5 ? -1 : 1;
  
  // Random speed between 0.015-0.03 cells/ms
  const speed = 0.015 + Math.random() * 0.015;
  
  // Calculate velocity (speed * direction)
  const velocity = speed * direction;
  
  // Generate car positions with minimum 3-cell spacing
  const obstacles = [];
  const minSpacing = 3;
  const carWidth = 2; // Standard car width
  
  // Start from a random initial position
  let currentX = Math.random() * 5 - 10; // Start between -10 and -5
  
  for (let i = 0; i < numCars; i++) {
    obstacles.push({
      x: currentX,
      y: y,
      width: carWidth,
      velocity: velocity,
      type: 'CAR'
    });
    
    // Next car position: current position + car width + minimum spacing + random gap
    currentX += carWidth + minSpacing + Math.random() * 3;
  }
  
  return {
    y: y,
    type: 'ROAD',
    obstacles: obstacles,
    platforms: [],
    metadata: {
      direction: direction,
      speed: speed
    }
  };
}

// Test suite
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

console.log('Testing generateRoad function...\n');

test('Returns correct structure', () => {
  const road = generateRoad(5);
  assert(road.y === 5, 'Y coordinate mismatch');
  assert(road.type === 'ROAD', 'Type should be ROAD');
  assert(Array.isArray(road.obstacles), 'Obstacles should be array');
  assert(Array.isArray(road.platforms), 'Platforms should be array');
  assert(road.platforms.length === 0, 'Platforms should be empty for roads');
});

test('Spawns 2-4 cars', () => {
  for (let i = 0; i < 20; i++) {
    const road = generateRoad(i);
    assert(road.obstacles.length >= 2 && road.obstacles.length <= 4,
      `Expected 2-4 cars, got ${road.obstacles.length}`);
  }
});

test('Direction is -1 or 1', () => {
  const directions = new Set();
  for (let i = 0; i < 50; i++) {
    const road = generateRoad(i);
    assert(road.metadata.direction === -1 || road.metadata.direction === 1,
      `Invalid direction: ${road.metadata.direction}`);
    directions.add(road.metadata.direction);
  }
  assert(directions.size === 2, 'Should produce both directions over many calls');
});

test('Speed is between 0.015-0.03', () => {
  for (let i = 0; i < 20; i++) {
    const road = generateRoad(i);
    assert(road.metadata.speed >= 0.015 && road.metadata.speed <= 0.03,
      `Speed ${road.metadata.speed} out of range`);
  }
});

test('Cars have correct velocity', () => {
  for (let i = 0; i < 10; i++) {
    const road = generateRoad(i);
    const expectedVelocity = road.metadata.speed * road.metadata.direction;
    for (const car of road.obstacles) {
      const diff = Math.abs(car.velocity - expectedVelocity);
      assert(diff < 0.0001, `Velocity mismatch: expected ${expectedVelocity}, got ${car.velocity}`);
    }
  }
});

test('Cars have minimum 3-cell spacing', () => {
  for (let i = 0; i < 20; i++) {
    const road = generateRoad(i);
    const cars = road.obstacles.sort((a, b) => a.x - b.x);
    
    for (let j = 1; j < cars.length; j++) {
      const prevCar = cars[j - 1];
      const currentCar = cars[j];
      const gap = currentCar.x - (prevCar.x + prevCar.width);
      assert(gap >= 3, `Gap ${gap.toFixed(2)} is less than minimum 3 cells`);
    }
  }
});

test('All cars have type CAR', () => {
  const road = generateRoad(100);
  for (const car of road.obstacles) {
    assert(car.type === 'CAR', `Expected type CAR, got ${car.type}`);
  }
});

test('All cars have correct Y coordinate', () => {
  const road = generateRoad(42);
  for (const car of road.obstacles) {
    assert(car.y === 42, `Car Y should be 42, got ${car.y}`);
  }
});

test('All cars have width property', () => {
  const road = generateRoad(50);
  for (const car of road.obstacles) {
    assert(typeof car.width === 'number', 'Width should be number');
    assert(car.width > 0, 'Width should be positive');
  }
});

test('Multiple calls produce varying speeds', () => {
  const speeds = new Set();
  for (let i = 0; i < 30; i++) {
    const road = generateRoad(i);
    speeds.add(road.metadata.speed.toFixed(6));
  }
  assert(speeds.size > 5, `Expected speed variation, got ${speeds.size} unique speeds`);
});

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
