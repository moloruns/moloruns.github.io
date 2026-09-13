#!/usr/bin/env node
const Renderer = require('./renderer.js');

class RecordingContext {
  constructor() {
    this.fillStyle = '';
    this.globalAlpha = 1;
    this.fills = [];
    this.alphas = [];
    this.current = [];
    this.stack = [];
    this.saveCount = 0;
    this.restoreCount = 0;
  }
  clearRect() {}
  beginPath() { this.current = []; }
  moveTo(x, y) { this.current.push({ x, y }); }
  lineTo(x, y) { this.current.push({ x, y }); }
  closePath() {}
  fill() {
    this.fills.push(this.fillStyle);
    this.alphas.push(this.globalAlpha);
  }
  save() {
    this.saveCount++;
    this.stack.push({ fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
  }
  restore() {
    this.restoreCount++;
    const state = this.stack.pop();
    if (state) {
      this.fillStyle = state.fillStyle;
      this.globalAlpha = state.globalAlpha;
    }
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
function assertCompletePalette(palette, label) {
  ['top', 'left', 'right'].forEach(face => {
    assert(typeof palette[face] === 'string' && palette[face].length > 0,
      label + ' is missing a ' + face + ' face color');
  });
}

test('Stage 2 exposes named three-face palettes and six bright car variants', () => {
  const { renderer } = createRenderer();
  const palettes = renderer.PALETTES.stage2;
  [
    'DEFAULT', 'TRAIN_BODY', 'TRAIN_ACCENT', 'WINDOW', 'WHEEL', 'METAL',
    'LOG_BARK', 'LOG_END', 'LILY_PAD', 'SIGNAL_POST', 'SIGNAL_HOUSING',
    'SIGNAL_LIT', 'FLOWER_STEM', 'GRASS_TUFT', 'TREE_TRUNK'
  ].forEach(name => assertCompletePalette(palettes[name], name));
  assert(palettes.CAR_BODY.length === 6, 'Expected six bright car palette variants');
  palettes.CAR_BODY.forEach((palette, index) => assertCompletePalette(palette, 'CAR_BODY[' + index + ']'));
  palettes.FLOWER_BLOSSOM.forEach((palette, index) => assertCompletePalette(palette, 'FLOWER_BLOSSOM[' + index + ']'));
  palettes.TREE_CANOPY.forEach((palette, index) => assertCompletePalette(palette, 'TREE_CANOPY[' + index + ']'));
  palettes.ROCK.forEach((palette, index) => assertCompletePalette(palette, 'ROCK[' + index + ']'));
  palettes.CLOUD.forEach((palette, index) => assertCompletePalette(palette, 'CLOUD[' + index + ']'));
});

test('palette resolution fills malformed faces without changing valid faces', () => {
  const { renderer } = createRenderer();
  const fallback = renderer.PALETTES.stage2.DEFAULT;
  const resolved = renderer.resolveVoxelPalette({ top: '#123456', left: '', right: null });
  assert(resolved.top === '#123456', 'Valid top face was replaced');
  assert(resolved.left === fallback.left, 'Missing left face did not use fallback');
  assert(resolved.right === fallback.right, 'Missing right face did not use fallback');

  const flat = renderer.resolveVoxelPalette('#ABCDEF');
  assert(flat.top === '#ABCDEF' && flat.left === '#ABCDEF' && flat.right === '#ABCDEF',
    'Flat color did not resolve to all voxel faces');
});

test('named variant selection wraps deterministically and unknown names fall back', () => {
  const { renderer } = createRenderer();
  const lastCar = renderer.PALETTES.stage2.CAR_BODY[5];
  const wrapped = renderer.getStage2Palette('CAR_BODY', -1);
  assert(wrapped.top === lastCar.top && wrapped.left === lastCar.left && wrapped.right === lastCar.right,
    'Negative variant index did not wrap to the final palette');

  const fallback = renderer.getStage2Palette('NOT_A_PALETTE', 42);
  assert(fallback.top === renderer.PALETTES.stage2.DEFAULT.top,
    'Unknown palette name did not use the Stage 2 fallback');
});

test('model helper reuses contact shadow and cuboid primitives with local alpha', () => {
  const { renderer, context } = createRenderer();
  context.globalAlpha = 0.8;
  const drawn = renderer.drawStage2Model(2, 3, [
    {
      x: 0.1,
      y: 0.2,
      width: 0.8,
      depth: 0.5,
      height: 0.4,
      paletteName: 'TRAIN_BODY'
    },
    { width: 0, depth: 1, height: 1, paletteName: 'ROCK' }
  ], {
    opacity: 0.25,
    shadow: { width: 1.2, depth: 0.45 }
  });

  assert(drawn === 1, 'Invalid model parts were not skipped');
  assert(context.fills.length === 4, 'Expected one shadow polygon and three cuboid faces');
  assert(context.fills[0] === 'rgba(24, 31, 28, 0.22)', 'Contact shadow was not drawn first');
  assert(context.fills.slice(1).join(',') === '#355895,#263F70,#4D78C9',
    'Named palette was not passed through the existing cuboid face order');
  assert(context.alphas.every(alpha => Math.abs(alpha - 0.2) < 1e-10),
    'Model opacity did not multiply the existing Canvas alpha');
  assert(context.globalAlpha === 0.8, 'Model drawing leaked globalAlpha');
  assert(context.saveCount === 1 && context.restoreCount === 1,
    'Model drawing did not balance Canvas save/restore');
});

test('Canvas state is restored even when guarded drawing throws', () => {
  const { renderer, context } = createRenderer();
  context.globalAlpha = 0.6;
  let threw = false;
  try {
    renderer.withAlpha(0.5, () => {
      assert(Math.abs(context.globalAlpha - 0.3) < 1e-10, 'Local alpha was not applied');
      throw new Error('expected');
    });
  } catch (error) {
    threw = error.message === 'expected';
  }
  assert(threw, 'Guarded drawing did not propagate the callback error');
  assert(context.globalAlpha === 0.6, 'Canvas alpha was not restored after an error');
  assert(context.saveCount === 1 && context.restoreCount === 1,
    'Canvas save/restore became unbalanced after an error');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
