#!/usr/bin/env node
/**
 * Node.js test script for Renderer class
 * Tests the core coordinate transformation logic
 */

// Mock canvas for Node.js environment
class MockCanvas {
    constructor(width, height) {
        this.width = width;
        this.height = height;
    }
    
    getContext(type) {
        return new MockContext();
    }
}

class MockContext {
    constructor() {
        this.fillStyle = '';
    }
    
    clearRect() {}
    fillRect() {}
    beginPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
    fill() {}
}

// Load renderer
const Renderer = require('./renderer.js');

// Test suite
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  ${error.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

console.log('Running Renderer Tests...\n');

const canvas = new MockCanvas(800, 600);
const renderer = new Renderer(canvas);

// Test isometric projection formula
test('gridToIso formula at origin', () => {
    const result = renderer.gridToIso(0, 0);
    assert(result.screenX === 0 && result.screenY === 0, 
        'Origin should map to (0, 0)');
});

test('gridToIso formula: screenX = (x - y) * TILE_WIDTH/2', () => {
    const cases = [
        { x: 1, y: 0, expectedX: 32 },
        { x: 0, y: 1, expectedX: -32 },
        { x: 2, y: 3, expectedX: -32 },
        { x: 5, y: 3, expectedX: 64 }
    ];
    
    cases.forEach(({ x, y, expectedX }) => {
        const result = renderer.gridToIso(x, y);
        assert(result.screenX === expectedX, 
            `At (${x},${y}), screenX should be ${expectedX}, got ${result.screenX}`);
    });
});

test('gridToIso formula: screenY = (x + y) * TILE_HEIGHT/2', () => {
    const cases = [
        { x: 1, y: 0, expectedY: 16 },
        { x: 0, y: 1, expectedY: 16 },
        { x: 2, y: 3, expectedY: 80 },
        { x: 5, y: 3, expectedY: 128 }
    ];
    
    cases.forEach(({ x, y, expectedY }) => {
        const result = renderer.gridToIso(x, y);
        assert(result.screenY === expectedY, 
            `At (${x},${y}), screenY should be ${expectedY}, got ${result.screenY}`);
    });
});

test('TILE_WIDTH and TILE_HEIGHT constants', () => {
    assert(renderer.TILE_WIDTH === 64, 'TILE_WIDTH should be 64');
    assert(renderer.TILE_HEIGHT === 32, 'TILE_HEIGHT should be 32');
});

test('Isometric 2:1 ratio maintained', () => {
    assert(renderer.TILE_WIDTH / renderer.TILE_HEIGHT === 2,
        'TILE_WIDTH should be exactly twice TILE_HEIGHT');
});

test('centerCameraOnPlayer updates camera coordinates', () => {
    renderer.centerCameraOnPlayer(5, 3);
    const expected = renderer.worldToIso(5, 3);
    assert(renderer.cameraX === expected.screenX && renderer.cameraY === expected.screenY,
        'Camera should match player isometric position');
});

test('screenToCanvas anchors followed objects below vertical center', () => {
    renderer.cameraX = 0;
    renderer.cameraY = 0;
    const result = renderer.screenToCanvas(0, 0);
    assert(result.x === 400 && result.y === 372,
        'Followed origin should map to horizontal center and 62% canvas height');
});

test('Canvas context is initialized', () => {
    assert(renderer.ctx !== null, 'Context should be initialized');
    assert(renderer.canvas === canvas, 'Canvas should be stored');
});

test('Drawing methods exist', () => {
    assert(typeof renderer.clear === 'function', 'clear method should exist');
    assert(typeof renderer.drawIsoRect === 'function', 'drawIsoRect method should exist');
    assert(typeof renderer.drawTile === 'function', 'drawTile method should exist');
    assert(typeof renderer.drawEntity === 'function', 'drawEntity method should exist');
});

test('gridToIso handles negative coordinates', () => {
    const result = renderer.gridToIso(-2, -3);
    const expectedX = (-2 - (-3)) * 32; // = 32
    const expectedY = (-2 + (-3)) * 16; // = -80
    assert(result.screenX === expectedX && result.screenY === expectedY,
        'Negative coordinates should be handled correctly');
});

test('Isometric symmetry property', () => {
    const origin = renderer.gridToIso(0, 0);
    const right = renderer.gridToIso(1, 0);
    const forward = renderer.gridToIso(0, 1);
    
    const rightDeltaX = right.screenX - origin.screenX;
    const forwardDeltaX = forward.screenX - origin.screenX;
    
    assert(rightDeltaX === -forwardDeltaX,
        'Moving right and forward should produce symmetric X deltas');
    assert(right.screenY === forward.screenY,
        'Moving right and forward should produce equal Y coordinates');
});

test('worldToIso draws positive world Y upward', () => {
    const origin = renderer.worldToIso(0, 0);
    const forward = renderer.worldToIso(0, 1);

    assert(forward.screenY < origin.screenY,
        'Positive world Y should move toward the top of the canvas');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
} else {
    console.log('\n✓ All tests passed!');
    process.exit(0);
}
