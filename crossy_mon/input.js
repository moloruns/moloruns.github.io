// Input system module
// Captures keyboard events and translates them to movement commands

// Player-issued destinations are admitted only within the fixed logical cells
// -15 through 15. This rule is intentionally independent of World records and
// render-only side shoulders.
const PLAYER_MOVEMENT_BOUNDS = Object.freeze({ minX: -15, maxX: 15 });

/**
 * Return whether a Player-issued destination remains inside the horizontal
 * Playable Span. Fractional carried positions are evaluated without rounding.
 * @param {number} destinationX - Exact requested destination x-coordinate
 * @returns {boolean} True when the destination is finite and in bounds
 */
function isWithinPlayerHorizontalBounds(destinationX) {
  return Number.isFinite(destinationX) &&
    destinationX >= PLAYER_MOVEMENT_BOUNDS.minX &&
    destinationX <= PLAYER_MOVEMENT_BOUNDS.maxX;
}

/**
 * Input class
 * Handles keyboard input, maps keys to direction vectors, and calls player.move()
 * Blocks input during animations and when game is over
 */
class Input {
  /**
   * Create a new Input system
   * @param {Player} player - The player instance to control
   * @param {Object} gameState - The game state object containing game status
   * @param {Object} [options] - Optional movement admission configuration
   * @param {Function} [options.canEnter] - Standalone fallback destination admission
   * @param {Function} [options.requestMove] - Delegates an admitted manual direction to Game
   * @param {Function} [options.canRequestManualMove] - Guards manual requests between automated hops
   */
  constructor(player, gameState, options = {}) {
    this.player = player;
    this.gameState = gameState;
    this.canEnter = typeof options.canEnter === 'function'
      ? options.canEnter
      : function () { return true; };
    this.requestMove = typeof options.requestMove === 'function'
      ? options.requestMove
      : null;
    this.canRequestManualMove = typeof options.canRequestManualMove === 'function'
      ? options.canRequestManualMove
      : function () { return true; };
    
    // Bind event handler to maintain 'this' context
    this.handleKeyDown = this.handleKeyDown.bind(this);
    
    // Set up keyboard event listener
    this.setupEventListeners();
  }

  /**
   * Set up keyboard event listeners
   */
  setupEventListeners() {
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Remove keyboard event listeners (cleanup)
   */
  destroy() {
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Handle keyboard input events
   * @param {KeyboardEvent} event - The keyboard event
   */
  handleKeyDown(event) {
    // Block input if game is over
    if (this.gameState.state === 'GAME_OVER') {
      return;
    }

    // Block input if player is animating
    if (this.player.isAnimating()) {
      return;
    }

    // Map keys to direction vectors
    let dx = 0;
    let dy = 0;

    switch (event.key) {
      // Arrow keys
      case 'ArrowUp':
        dx = 0;
        dy = 1; // Forward (positive world Y)
        break;
      case 'ArrowDown':
        dx = 0;
        dy = -1; // Backward (negative world Y)
        break;
      case 'ArrowLeft':
        dx = -1;
        dy = 0; // Left (negative X)
        break;
      case 'ArrowRight':
        dx = 1;
        dy = 0; // Right (positive X)
        break;

      // WASD keys
      case 'w':
        dx = 0;
        dy = 1; // Forward (positive world Y)
        break;
      case 'W':
        dx = 0;
        dy = 1; // Forward (positive world Y)
        break;
      case 's':
        dx = 0;
        dy = -1; // Backward (negative world Y)
        break;
      case 'S':
        dx = 0;
        dy = -1; // Backward (negative world Y)
        break;
      case 'a':
      case 'A':
        dx = -1;
        dy = 0; // Left (negative X)
        break;
      case 'd':
      case 'D':
        dx = 1;
        dy = 0; // Right (positive X)
        break;

      default:
        // Unrecognized key, ignore
        return;
    }

    // If we got valid input, prevent default browser behavior
    event.preventDefault();

    // Check the exact logical destination before starting an animation. The
    // player's X coordinate may be fractional after Platform carrying.
    const destinationX = this.player.x + dx;
    const destinationY = this.player.y + dy;
    if (!isWithinPlayerHorizontalBounds(destinationX)) {
      return;
    }

    // Keep manual input suppressible while Game owns an automated movement
    // sequence. The guard is intentionally checked before either delegation or
    // standalone destination admission so a rejected request has no side effects.
    if (!this.canRequestManualMove()) {
      return;
    }

    // When Game supplies a coordinator, it owns the remaining movement
    // admission and duration selection. Never fall through to Player.move when
    // that request is rejected by Game.
    if (this.requestMove) {
      this.requestMove(dx, dy);
      return;
    }

    // Preserve standalone fixtures and legacy construction: logical admission
    // remains local and accepted movement calls Player directly.
    if (!this.canEnter(destinationX, destinationY)) {
      return;
    }

    this.player.move(dx, dy);
  }
}

// Expose the fixed admission contract without changing the default Input export.
Input.PLAYER_MOVEMENT_BOUNDS = PLAYER_MOVEMENT_BOUNDS;
Input.isWithinPlayerHorizontalBounds = isWithinPlayerHorizontalBounds;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Input;
  module.exports.PLAYER_MOVEMENT_BOUNDS = PLAYER_MOVEMENT_BOUNDS;
  module.exports.isWithinPlayerHorizontalBounds = isWithinPlayerHorizontalBounds;
}
