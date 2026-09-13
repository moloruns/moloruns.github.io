#!/usr/bin/env node

/**
 * Browser-oriented production smoke test.
 * Loads the scripts in index.html order into a browser-like VM context and
 * verifies that a frame draws both terrain and the player without errors.
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

const pathFills = [];
const animationFrames = [];
const eventListeners = new Map();

const context2d = {
  fillStyle: '',
  globalAlpha: 1,
  font: '',
  textAlign: '',
  clearRect() {},
  fillRect() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  closePath() {},
  fill() {
    pathFills.push(this.fillStyle);
  },
  fillText() {},
  save() {
    this.__savedAlpha = this.globalAlpha;
  },
  restore() {
    this.globalAlpha = this.__savedAlpha;
  }
};

const canvas = {
  width: 800,
  height: 600,
  getContext(type) {
    if (type !== '2d') {
      throw new Error(`Unexpected canvas context: ${type}`);
    }
    return context2d;
  }
};

const browser = {
  console: { log() {}, error: console.error },
  document: {
    getElementById(id) {
      return id === 'gameCanvas' ? canvas : null;
    }
  },
  performance: { now: () => 0 },
  requestAnimationFrame(callback) {
    animationFrames.push(callback);
    return animationFrames.length;
  },
  addEventListener(type, callback) {
    eventListeners.set(type, callback);
  },
  removeEventListener(type, callback) {
    if (eventListeners.get(type) === callback) {
      eventListeners.delete(type);
    }
  },
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

vm.runInContext('globalThis.__game = new Game();', context);
const game = browser.__game;

if (!game || game.player.x !== 0 || game.player.y !== 0) {
  throw new Error('Game did not initialize Player at (0, 0)');
}
if (game.player.isMoving || game.player.animationProgress !== 0) {
  throw new Error('Player animation state was not initialized correctly');
}
if (game.world.terrainRows.size !== 20) {
  throw new Error(`Expected 20 initial terrain rows, got ${game.world.terrainRows.size}`);
}
for (let y = -5; y <= 2; y++) {
  const row = game.world.terrainRows.get(y);
  if (!row || row.type !== 'GRASS') {
    throw new Error(`Spawn/behind row ${y} must be safe grass`);
  }
}

const origin = game.renderer.worldToIso(0, 0);
const forward = game.renderer.worldToIso(0, 1);
if (forward.screenY >= origin.screenY) {
  throw new Error('Positive-Y forward movement is not drawn upward');
}

game.render();
if (!pathFills.includes('#7CFC00')) {
  throw new Error('A production render did not draw grass terrain');
}
if (!pathFills.includes('#4169E1')) {
  throw new Error('A production render did not draw the player');
}

const keyEvent = { key: 'ArrowUp', preventDefault() {} };
game.inputSystem.handleKeyDown(keyEvent);
game.update(game.player.animationDuration);
if (game.player.y !== 1 || game.gameState.score !== 1) {
  throw new Error('Up input did not advance positive Y and score consistently');
}
if (!game.world.terrainRows.has(16)) {
  throw new Error('Terrain buffer was not maintained ahead of the player');
}

game.start();
const firstFrame = animationFrames.shift();
if (typeof firstFrame !== 'function') {
  throw new Error('Game start did not request an animation frame');
}
firstFrame(16);

console.log('✓ Production scripts load without runtime errors');
console.log('✓ Initial safe terrain surrounds the player');
console.log('✓ Terrain and player canvas drawing calls occurred');
console.log('✓ Up/forward movement, scoring, and terrain buffering are aligned');
