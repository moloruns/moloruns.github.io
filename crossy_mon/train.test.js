#!/usr/bin/env node

const assert = require('assert');
const {
  INITIAL_SPEED_RANGES,
  TRAIN_TRACK_CONFIG,
  generateTrainTrack,
  updateTrainTrackLifecycle
} = require('./generator.js');
const { checkCollisions } = require('./collision.js');
const Renderer = require('./renderer.js');

function sequenceRandom(values, fallback = 0) {
  let index = 0;
  return () => index < values.length ? values[index++] : fallback;
}

function worldFor(row) {
  return {
    getTerrainAt(x, y) {
      return y === row.y ? row : null;
    },
    getObstaclesAt(x, y) {
      if (y !== row.y) return [];
      return row.obstacles.filter(obstacle =>
        x >= obstacle.x && x < obstacle.x + obstacle.width
      );
    },
    getPlatformAt() {
      return null;
    }
  };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('track rows receive independent randomized idle delays', () => {
  const samples = [0, 0.25, 0.5, 0.75, 0.999999];
  const delays = samples.map((sample, y) =>
    generateTrainTrack(y, () => sample).metadata.idleRemaining
  );

  assert.strictEqual(new Set(delays).size, samples.length);
  assert.strictEqual(delays[0], TRAIN_TRACK_CONFIG.idleMin);
  assert.ok(delays[delays.length - 1] < TRAIN_TRACK_CONFIG.idleMax);
});

test('warning lasts about 3000ms and visibly alternates without spawning early', () => {
  const row = generateTrainTrack(4, () => 0);
  updateTrainTrackLifecycle(row, TRAIN_TRACK_CONFIG.idleMin, () => 0);

  assert.strictEqual(row.metadata.trainState, 'WARNING');
  assert.strictEqual(row.metadata.warningLightOn, true);
  assert.strictEqual(row.obstacles.length, 0);

  updateTrainTrackLifecycle(row, TRAIN_TRACK_CONFIG.flashInterval, () => 0);
  assert.strictEqual(row.metadata.warningLightOn, false);
  assert.strictEqual(row.obstacles.length, 0);

  updateTrainTrackLifecycle(row, TRAIN_TRACK_CONFIG.flashInterval, () => 0);
  assert.strictEqual(row.metadata.warningLightOn, true);

  const almostComplete = TRAIN_TRACK_CONFIG.warningDuration -
    (TRAIN_TRACK_CONFIG.flashInterval * 2) - 1;
  updateTrainTrackLifecycle(row, almostComplete, () => 0);
  assert.strictEqual(row.metadata.warningElapsed, TRAIN_TRACK_CONFIG.warningDuration - 1);
  assert.strictEqual(row.obstacles.length, 0);
});

test('completed warning activates one longer train at tuned speed', () => {
  const row = generateTrainTrack(5, () => 0);
  updateTrainTrackLifecycle(row, TRAIN_TRACK_CONFIG.idleMin, () => 0);
  updateTrainTrackLifecycle(row, TRAIN_TRACK_CONFIG.warningDuration - 1, () => 0);

  const activationRandom = sequenceRandom([0.75, 0, 0.999999]);
  updateTrainTrackLifecycle(row, 1, activationRandom);

  assert.strictEqual(row.metadata.trainState, 'ACTIVE');
  assert.strictEqual(row.obstacles.length, 1);
  assert.strictEqual(row.obstacles[0].type, 'TRAIN');
  assert.strictEqual(row.obstacles[0].width, TRAIN_TRACK_CONFIG.maxWidth);
  assert.strictEqual(row.obstacles[0].velocity, INITIAL_SPEED_RANGES.TRAIN.min);
  assert.strictEqual(
    row.obstacles[0].x,
    -TRAIN_TRACK_CONFIG.worldEdge - TRAIN_TRACK_CONFIG.maxWidth
  );
});

test('active train moves, exits once, cools down, and repeats its lifecycle', () => {
  const row = generateTrainTrack(6, () => 0);
  const eventRandom = sequenceRandom([0.75, 0, 0.5, 0.25, 0.25, 0.5, 0]);

  updateTrainTrackLifecycle(
    row,
    TRAIN_TRACK_CONFIG.idleMin + TRAIN_TRACK_CONFIG.warningDuration,
    eventRandom
  );
  const train = row.obstacles[0];
  const startX = train.x;
  updateTrainTrackLifecycle(row, 100, eventRandom);
  assert.strictEqual(train.x, startX + train.velocity * 100);

  const timeToExit = ((TRAIN_TRACK_CONFIG.worldEdge - train.x) / train.velocity) + 1;
  updateTrainTrackLifecycle(row, timeToExit, eventRandom);
  assert.strictEqual(row.metadata.trainState, 'IDLE');
  assert.strictEqual(row.obstacles.length, 0);
  assert.strictEqual(row.metadata.completedEvents, 1);
  assert.ok(row.metadata.idleRemaining > TRAIN_TRACK_CONFIG.idleMin);

  updateTrainTrackLifecycle(row, row.metadata.idleRemaining, eventRandom);
  assert.strictEqual(row.metadata.trainState, 'WARNING');
  assert.strictEqual(row.obstacles.length, 0);
  updateTrainTrackLifecycle(row, TRAIN_TRACK_CONFIG.warningDuration, eventRandom);
  assert.strictEqual(row.metadata.trainState, 'ACTIVE');
  assert.strictEqual(row.obstacles.length, 1);
});

test('warning lights are safe while an occupying active train is lethal', () => {
  const row = generateTrainTrack(8, () => 0);
  const world = worldFor(row);
  updateTrainTrackLifecycle(row, TRAIN_TRACK_CONFIG.idleMin, () => 0);

  assert.strictEqual(checkCollisions({ x: 0, y: 8 }, world), 'SAFE');

  updateTrainTrackLifecycle(
    row,
    TRAIN_TRACK_CONFIG.warningDuration,
    sequenceRandom([0.75, 0, 0])
  );
  const train = row.obstacles[0];
  assert.strictEqual(checkCollisions({ x: train.x, y: 8 }, world), 'COLLISION');
  assert.strictEqual(
    checkCollisions({ x: train.x + train.width, y: 8 }, world),
    'SAFE'
  );
});

test('track renderer draws ballast, ties, rails, and both signal flash phases', () => {
  const fills = [];
  const context = {
    fillStyle: '',
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() { fills.push(this.fillStyle); }
  };
  const renderer = new Renderer({
    width: 800,
    height: 600,
    getContext: () => context
  });

  renderer.drawTrainTrackTile(0, 3);
  renderer.drawWarningSignal(-2, 3, true);
  renderer.drawWarningSignal(-2, 3, false);

  assert.ok(fills.includes('#6B5B4D'), 'ballast fill missing');
  assert.ok(fills.includes('#4A2C1A'), 'wooden tie fill missing');
  assert.ok(fills.filter(color => color === '#C0C0C0').length >= 2, 'rail fills missing');
  assert.ok(fills.includes(renderer.PALETTES.stage2.METAL.top),
    'voxel signal base fill missing');
  assert.ok(fills.includes(renderer.PALETTES.stage2.SIGNAL_POST.top),
    'voxel signal post/crossbar fill missing');
  assert.ok(fills.includes(renderer.PALETTES.stage2.SIGNAL_LIT.top),
    'lit red voxel warning face missing');
  assert.ok(fills.includes(renderer.PALETTES.stage2.SIGNAL_HOUSING.top),
    'dark unlit voxel warning face missing');
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(error.stack || error.message);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} train lifecycle tests passed`);
}
