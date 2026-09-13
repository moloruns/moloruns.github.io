#!/usr/bin/env node

/**
 * Focused production smoke tests for Task 17.2 / Requirement 8.6.
 * Scripts are loaded in index.html order into a browser-like context.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = __dirname;
const productionScripts = [
  'player.js',
  'world.js',
  'generator.js',
  'collision.js',
  'renderer.js',
  'input.js',
  'game.js'
];

const canvasContext = {
  fillStyle: '',
  font: '',
  textAlign: '',
  clearRect() {},
  fillRect() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  closePath() {},
  fill() {},
  fillText() {}
};
const canvas = {
  width: 800,
  height: 600,
  getContext: () => canvasContext
};
const browser = {
  console: { log() {}, error: console.error },
  document: { getElementById: id => id === 'gameCanvas' ? canvas : null },
  performance: { now: () => 0 },
  requestAnimationFrame() { return 1; },
  addEventListener() {},
  removeEventListener() {},
  Math,
  Map,
  Set,
  Array,
  Object,
  Number,
  String,
  Boolean,
  JSON,
  Date
};
browser.window = browser;
browser.globalThis = browser;

const context = vm.createContext(browser);
for (const script of productionScripts) {
  const source = fs.readFileSync(path.join(projectRoot, script), 'utf8');
  new vm.Script(source, { filename: script }).runInContext(context);
}

let gameNumber = 0;
function createGame() {
  const key = `__game${gameNumber++}`;
  vm.runInContext(`globalThis.${key} = new Game();`, context);
  const game = browser[key];
  game.world.terrainRows.clear();
  return game;
}

function row(y, type, platforms = [], obstacles = []) {
  return { y, type, platforms, obstacles, metadata: {} };
}

function platform(x, y, width, velocity, type = 'LOG') {
  return { x, y, width, velocity, type };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual, expected, message, epsilon = 1e-10) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('production speed ranges are tuned down and still vary by lane', () => {
  const carSpeeds = new Set();
  const riverSpeeds = new Set();
  const trainSpeeds = new Set();

  for (let i = 0; i < 250; i++) {
    const road = browser.generateRoad(i);
    const river = browser.generateRiver(i);
    const track = browser.generateTrainTrack(i);
    browser.updateTrainTrackLifecycle(
      track,
      track.metadata.idleRemaining + 3000,
      Math.random
    );

    assert(road.metadata.speed >= 0.0064 && road.metadata.speed <= 0.0144,
      `car speed out of tuned range: ${road.metadata.speed}`);
    assert(river.metadata.speed >= 0.0049 && river.metadata.speed <= 0.0105,
      `river speed out of tuned range: ${river.metadata.speed}`);
    carSpeeds.add(road.metadata.speed.toFixed(6));
    riverSpeeds.add(river.metadata.speed.toFixed(6));

    if (track.obstacles.length) {
      const speed = Math.abs(track.obstacles[0].velocity);
      assert(speed >= 0.0255 && speed <= 0.0425,
        `train speed out of tuned range: ${speed}`);
      trainSpeeds.add(speed.toFixed(6));
    }
  }

  assert(carSpeeds.size > 1, 'car lanes lost speed variation');
  assert(riverSpeeds.size > 1, 'river lanes lost speed variation');
  assert(trainSpeeds.size > 1, 'train lanes lost speed variation');
});

test('generated rivers use aligned crossing slots with real water gaps', () => {
  for (let i = 0; i < 25; i++) {
    const river = browser.generateRiver(i);
    assert(river.platforms.length === 5, 'river should provide five crossing slots');

    const sorted = [...river.platforms].sort((a, b) => a.x - b.x);
    for (let j = 0; j < sorted.length; j++) {
      const expectedSlot = -12 + j * 6;
      assert(Math.abs(sorted[j].x - expectedSlot) <= 0.21,
        `platform ${j} is misaligned with crossing slot`);
      if (j > 0) {
        const gap = sorted[j].x - (sorted[j - 1].x + sorted[j - 1].width);
        assert(gap > 1.5, `river gap should remain genuinely hazardous: ${gap}`);
      }
    }
  }
});

test('stationary player is carried once by the exact platform each frame', () => {
  const game = createGame();
  const log = platform(1, 5, 3, 0.005);
  game.world.addTerrainRow(row(5, 'RIVER', [log]));
  game.player.x = 1.25;
  game.player.y = 5;

  game.update(20);

  assertClose(log.x, 1.1, 'platform displacement');
  assertClose(game.player.x, 1.35, 'player displacement should equal platform displacement');
  assert(game.gameState.state === 'PLAYING', 'riding player should remain alive');
});

test('player can jump off a moving platform onto an adjacent safe bank', () => {
  const game = createGame();
  const log = platform(1, 5, 3, 0.005);
  game.world.addTerrainRow(row(5, 'RIVER', [log]));
  game.world.addTerrainRow(row(6, 'GRASS'));
  game.player.x = 1.25;
  game.player.y = 5;

  game.player.move(0, 1);
  game.update(game.player.animationDuration);

  assertClose(game.player.x, 1.25, 'jump must not receive platform velocity');
  assert(game.player.y === 6, 'jump should land one row forward');
  assert(game.gameState.state === 'PLAYING', 'safe-bank exit should not die');
});

test('fractional-X landing near an adjacent platform edge is safe', () => {
  const game = createGame();
  game.world.addTerrainRow(row(5, 'GRASS'));
  game.world.addTerrainRow(row(6, 'RIVER', [platform(1.5, 6, 3, 0)]));
  game.player.x = 1.2;
  game.player.y = 5;

  game.player.move(0, 1);
  game.update(game.player.animationDuration);

  assert(game.player.y === 6, 'player should complete the forward grid jump');
  assert(game.gameState.state === 'PLAYING', 'fractional edge landing should be tolerated');
});

test('water away from every platform remains lethal', () => {
  const game = createGame();
  game.world.addTerrainRow(row(5, 'RIVER', [platform(5, 5, 3, 0)]));
  game.player.x = 0;
  game.player.y = 5;

  game.update(16);

  assert(game.gameState.state === 'GAME_OVER', 'genuine water gap must cause game over');
});

test('platform wrap does not teleport the rider across the world', () => {
  const game = createGame();
  const wrappingLog = platform(19.9, 5, 3, 0.01);
  game.world.addTerrainRow(row(5, 'RIVER', [wrappingLog]));
  game.player.x = 19.95;
  game.player.y = 5;

  game.update(20);

  assertClose(game.player.x, 19.95, 'rider should not inherit wrap teleport');
  assertClose(wrappingLog.x, -25, 'platform should still use production wrapping');
  assert(game.gameState.state === 'GAME_OVER', 'rider left behind by wrap is in water');
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures++;
    console.error(`✗ ${name}\n  ${error.message}`);
  }
}

if (failures) {
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} focused platform-riding checks passed`);
}
