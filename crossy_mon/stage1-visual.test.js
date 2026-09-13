#!/usr/bin/env node
const Renderer = require('./renderer.js');
const Player = require('./player.js');

class RecordingContext {
  constructor() {
    this.fillStyle = '';
    this.fills = [];
    this.polygons = [];
    this.current = [];
  }
  clearRect() {}
  fillRect() {}
  fillText() {}
  beginPath() { this.current = []; }
  moveTo(x, y) { this.current.push({ x, y }); }
  lineTo(x, y) { this.current.push({ x, y }); }
  closePath() {}
  fill() {
    this.fills.push(this.fillStyle);
    this.polygons.push(this.current.slice());
  }
}

function createRenderer() {
  const context = new RecordingContext();
  const renderer = new Renderer({
    width: 800,
    height: 600,
    getContext: () => context
  });
  return { renderer, context };
}

let passed = 0;
let failed = 0;
function test(name, callback) {
  try {
    callback();
    passed++;
    console.log('✓ ' + name);
  } catch (error) {
    failed++;
    console.error('✗ ' + name + ': ' + error.message);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// **Feature: crossy-road-clone, Property 6: Isometric Projection Consistency**
// **Validates: Requirements 4.1**
test('Property 6 holds for 100 deterministic coordinate pairs', () => {
  const { renderer } = createRenderer();
  for (let index = 0; index < 100; index++) {
    const x = ((index * 37) % 41) - 20;
    const y = ((index * 53) % 47) - 23;
    const point = renderer.gridToIso(x, y);
    assert(point.screenX === (x - y) * 32, 'screenX formula changed');
    assert(point.screenY === (x + y) * 16, 'screenY formula changed');
  }
});

test('voxel primitive draws distinct left, right, and top face colors', () => {
  const { renderer, context } = createRenderer();
  renderer.drawVoxelBlock(0, 0, 1, 1, 0.5, {
    top: '#TOP', left: '#LEFT', right: '#RIGHT'
  });
  assert(context.fills.join(',') === '#LEFT,#RIGHT,#TOP',
    'Cuboid did not emit the three palette-shaded faces');
  assert(context.polygons.length === 3 && context.polygons.every(p => p.length === 4),
    'Cuboid faces must be quadrilateral Canvas paths');
});

test('terrain row is one continuous extruded slab with no per-tile top seams', () => {
  const { renderer, context } = createRenderer();
  renderer.drawTerrainSlab('GRASS', -15, 4, 31);
  assert(context.fills.length === 3, 'A lane slab should use exactly three faces');
  assert(context.fills[2] === '#7CFC00', 'Grass top color changed');
  const top = context.polygons[2];
  const horizontalSpan = Math.max(...top.map(p => p.x)) - Math.min(...top.map(p => p.x));
  assert(horizontalSpan > 31 * renderer.TILE_WIDTH / 2,
    'Terrain top does not span the complete visible lane');
});

test('camera leaves more screen area ahead while staying horizontally centered', () => {
  const { renderer } = createRenderer();
  renderer.centerCameraOnPlayer(7.25, 12.5);
  const playerIso = renderer.worldToIso(7.25, 12.5);
  const canvasPoint = renderer.screenToCanvas(playerIso.screenX, playerIso.screenY);
  assert(canvasPoint.x === 400, 'Player is not followed horizontally');
  assert(canvasPoint.y === 372 && canvasPoint.y > 300,
    'Player is not anchored below vertical center');
  assert(renderer.worldToIso(0, 1).screenY < renderer.worldToIso(0, 0).screenY,
    'Positive-Y forward must continue to appear upward');
});

test('chicken includes white, orange, red, and dark cuboid components plus shadow', () => {
  const { renderer, context } = createRenderer();
  renderer.drawGroundShadow(0, 0, 0.84, 0.5);
  renderer.drawVoxelChicken(0, 0, { facing: { dx: 0, dy: 1 }, hopHeight: 0 });
  ['rgba(24, 31, 28, 0.22)', '#FFF9E8', '#FFC83D', '#EF5145', '#22282D']
    .forEach(color => assert(context.fills.includes(color), 'Missing component color ' + color));
  assert(context.polygons.length >= 12 * 3,
    'Chicken was not assembled from multiple shaded cuboids');
});

test('hop height changes while logical position and timing stay unchanged', () => {
  const player = new Player(1.25, 6);
  player.move(0, 1);
  player.update(75);
  assert(player.x === 1.25 && player.y === 6,
    'Visual hop changed logical collision coordinates');
  assert(Math.abs(player.getHopHeight() - player.maxHopHeight) < 1e-10,
    'Hop should peak halfway through the 150ms move');
  assert(player.getCurrentPosition().y === 6.5,
    'Interpolated movement changed during visual hop');
  player.update(75);
  assert(player.y === 7 && player.getHopHeight() === 0,
    'Move did not complete on the established 150ms timing');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
