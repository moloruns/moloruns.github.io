// Unit tests for Input class

/**
 * Test suite for Input class
 * Tests keyboard event handling, direction mapping, and input blocking
 */

// Mock DOM environment for testing
if (typeof window === 'undefined') {
    global.window = {
        addEventListener: function() {},
        removeEventListener: function() {}
    };
}

// Test utilities
function createMockKeyboardEvent(key) {
    return {
        key: key,
        preventDefault: function() {
            this.defaultPrevented = true;
        },
        defaultPrevented: false
    };
}

function runTests() {
    const results = [];
    
    // Test 1: Arrow key mappings
    console.log('\n=== Test 1: Arrow Key Mappings ===');
    {
        const gameState = { state: 'PLAYING', score: 0, maxYReached: 0, lastFrameTime: 0 };
        const player = new Player(0, 0);
        const input = new Input(player, gameState);
        
        // Track move calls
        const moveCalls = [];
        const originalMove = player.move.bind(player);
        player.move = function(dx, dy) {
            moveCalls.push({ dx, dy });
            return originalMove(dx, dy);
        };
        
        // Test each arrow key
        input.handleKeyDown(createMockKeyboardEvent('ArrowUp'));
        input.handleKeyDown(createMockKeyboardEvent('ArrowDown'));
        
        // Wait for animation to complete (simulate)
        player.isMoving = false;
        
        input.handleKeyDown(createMockKeyboardEvent('ArrowLeft'));
        input.handleKeyDown(createMockKeyboardEvent('ArrowRight'));
        
        const expected = [
            { dx: 0, dy: 1 },   // ArrowUp
            { dx: 0, dy: -1 },  // ArrowDown (blocked by animation)
            { dx: -1, dy: 0 },  // ArrowLeft
            { dx: 1, dy: 0 }    // ArrowRight (blocked by animation)
        ];
        
        const passed = moveCalls.length === 2 && 
                      moveCalls[0].dx === 0 && moveCalls[0].dy === 1 &&
                      moveCalls[1].dx === -1 && moveCalls[1].dy === 0;
        
        console.log('Arrow key mapping test:', passed ? 'PASS' : 'FAIL');
        console.log('Move calls:', moveCalls);
        results.push({ test: 'Arrow key mappings', passed });
    }
    
    // Test 2: WASD key mappings
    console.log('\n=== Test 2: WASD Key Mappings ===');
    {
        const gameState = { state: 'PLAYING', score: 0, maxYReached: 0, lastFrameTime: 0 };
        const player = new Player(5, 5);
        const input = new Input(player, gameState);
        
        const moveCalls = [];
        const originalMove = player.move.bind(player);
        player.move = function(dx, dy) {
            moveCalls.push({ dx, dy });
            return originalMove(dx, dy);
        };
        
        // Test each WASD key (lowercase and uppercase)
        input.handleKeyDown(createMockKeyboardEvent('w'));
        player.isMoving = false;
        input.handleKeyDown(createMockKeyboardEvent('S'));
        player.isMoving = false;
        input.handleKeyDown(createMockKeyboardEvent('a'));
        player.isMoving = false;
        input.handleKeyDown(createMockKeyboardEvent('D'));
        
        const passed = moveCalls.length === 4 &&
                      moveCalls[0].dx === 0 && moveCalls[0].dy === 1 &&  // W
                      moveCalls[1].dx === 0 && moveCalls[1].dy === -1 && // S
                      moveCalls[2].dx === -1 && moveCalls[2].dy === 0 && // A
                      moveCalls[3].dx === 1 && moveCalls[3].dy === 0;    // D
        
        console.log('WASD key mapping test:', passed ? 'PASS' : 'FAIL');
        console.log('Move calls:', moveCalls);
        results.push({ test: 'WASD key mappings', passed });
    }
    
    // Test 3: Input blocking during animation
    console.log('\n=== Test 3: Input Blocking During Animation ===');
    {
        const gameState = { state: 'PLAYING', score: 0, maxYReached: 0, lastFrameTime: 0 };
        const player = new Player(0, 0);
        const input = new Input(player, gameState);
        
        let moveCallCount = 0;
        player.move = function(dx, dy) {
            moveCallCount++;
            this.isMoving = true;
            return true;
        };
        
        // First input should work
        input.handleKeyDown(createMockKeyboardEvent('ArrowUp'));
        
        // Second input should be blocked (player is animating)
        input.handleKeyDown(createMockKeyboardEvent('ArrowRight'));
        input.handleKeyDown(createMockKeyboardEvent('ArrowDown'));
        
        const passed = moveCallCount === 1;
        console.log('Animation blocking test:', passed ? 'PASS' : 'FAIL');
        console.log('Move call count:', moveCallCount, '(expected: 1)');
        results.push({ test: 'Input blocking during animation', passed });
    }
    
    // Test 4: Input blocking when game is over
    console.log('\n=== Test 4: Input Blocking When Game Over ===');
    {
        const gameState = { state: 'GAME_OVER', score: 10, maxYReached: 10, lastFrameTime: 0 };
        const player = new Player(5, 10);
        const input = new Input(player, gameState);
        
        let moveCallCount = 0;
        player.move = function(dx, dy) {
            moveCallCount++;
            return true;
        };
        
        // All inputs should be blocked
        input.handleKeyDown(createMockKeyboardEvent('ArrowUp'));
        input.handleKeyDown(createMockKeyboardEvent('w'));
        input.handleKeyDown(createMockKeyboardEvent('ArrowLeft'));
        input.handleKeyDown(createMockKeyboardEvent('a'));
        
        const passed = moveCallCount === 0;
        console.log('Game over blocking test:', passed ? 'PASS' : 'FAIL');
        console.log('Move call count:', moveCallCount, '(expected: 0)');
        results.push({ test: 'Input blocking when game over', passed });
    }
    
    // Test 5: Correct direction vectors
    console.log('\n=== Test 5: Direction Vector Correctness ===');
    {
        const gameState = { state: 'PLAYING', score: 0, maxYReached: 0, lastFrameTime: 0 };
        const player = new Player(10, 10);
        const input = new Input(player, gameState);
        
        const directions = {};
        player.move = function(dx, dy) {
            return true; // Don't start animation
        };
        
        // Test each direction
        const testCases = [
            { key: 'ArrowUp', expectedDx: 0, expectedDy: 1 },
            { key: 'ArrowDown', expectedDx: 0, expectedDy: -1 },
            { key: 'ArrowLeft', expectedDx: -1, expectedDy: 0 },
            { key: 'ArrowRight', expectedDx: 1, expectedDy: 0 },
            { key: 'w', expectedDx: 0, expectedDy: 1 },
            { key: 's', expectedDx: 0, expectedDy: -1 },
            { key: 'a', expectedDx: -1, expectedDy: 0 },
            { key: 'd', expectedDx: 1, expectedDy: 0 }
        ];
        
        let allPassed = true;
        for (const testCase of testCases) {
            let capturedDx = null, capturedDy = null;
            player.move = function(dx, dy) {
                capturedDx = dx;
                capturedDy = dy;
                return true;
            };
            
            input.handleKeyDown(createMockKeyboardEvent(testCase.key));
            
            if (capturedDx !== testCase.expectedDx || capturedDy !== testCase.expectedDy) {
                console.log(`FAIL: ${testCase.key} - Expected (${testCase.expectedDx}, ${testCase.expectedDy}), got (${capturedDx}, ${capturedDy})`);
                allPassed = false;
            }
        }
        
        console.log('Direction vector test:', allPassed ? 'PASS' : 'FAIL');
        results.push({ test: 'Direction vector correctness', passed: allPassed });
    }
    
    // Test 6: Invalid keys ignored
    console.log('\n=== Test 6: Invalid Keys Ignored ===');
    {
        const gameState = { state: 'PLAYING', score: 0, maxYReached: 0, lastFrameTime: 0 };
        const player = new Player(0, 0);
        const input = new Input(player, gameState);
        
        let moveCallCount = 0;
        player.move = function(dx, dy) {
            moveCallCount++;
            return true;
        };
        
        // Test invalid keys
        input.handleKeyDown(createMockKeyboardEvent(' ')); // Space
        input.handleKeyDown(createMockKeyboardEvent('Enter'));
        input.handleKeyDown(createMockKeyboardEvent('Escape'));
        input.handleKeyDown(createMockKeyboardEvent('x'));
        input.handleKeyDown(createMockKeyboardEvent('1'));
        
        const passed = moveCallCount === 0;
        console.log('Invalid keys ignored test:', passed ? 'PASS' : 'FAIL');
        console.log('Move call count:', moveCallCount, '(expected: 0)');
        results.push({ test: 'Invalid keys ignored', passed });
    }
    
    // Test 7: preventDefault called on valid input
    console.log('\n=== Test 7: preventDefault Called ===');
    {
        const gameState = { state: 'PLAYING', score: 0, maxYReached: 0, lastFrameTime: 0 };
        const player = new Player(0, 0);
        const input = new Input(player, gameState);
        
        player.move = function(dx, dy) { return true; };
        
        const event = createMockKeyboardEvent('ArrowUp');
        input.handleKeyDown(event);
        
        const passed = event.defaultPrevented === true;
        console.log('preventDefault test:', passed ? 'PASS' : 'FAIL');
        results.push({ test: 'preventDefault called', passed });
    }
    
    // Summary
    console.log('\n=== TEST SUMMARY ===');
    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    console.log(`Passed: ${passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
        console.log('✓ All tests passed!');
    } else {
        console.log('✗ Some tests failed:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`  - ${r.test}`);
        });
    }
    
    return passedTests === totalTests;
}

// Run tests if executed directly
if (typeof require !== 'undefined' && require.main === module) {
    runTests();
} else {
    console.log('Input test suite loaded. Call runTests() to execute.');
}
