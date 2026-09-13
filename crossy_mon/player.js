// Player entity module
// Manages player state, position, movement animations, and minimal visual state

/**
 * Player class representing the player character.
 */
class Player {
  constructor(x = 0, y = 0) {
    // Logical grid position. These values change only when a hop completes.
    this.x = x;
    this.y = y;

    this.isMoving = false;
    this.animationProgress = 0.0;
    this.animationDuration = 150;
    this.startPos = { x: x, y: y };
    this.targetPos = { x: x, y: y };

    // Rendering-only direction state; positive Y is the default forward view.
    this.facing = { dx: 0, dy: 1 };
    this.maxHopHeight = 0.28;
  }

  move(dx, dy, duration) {
    if (this.isMoving) {
      return false;
    }

    // Existing callers may omit the duration and continue using the configured
    // baseline. Explicit durations are copied only when this hop is admitted.
    const assignedDuration = duration === undefined ? this.animationDuration : duration;
    if (typeof assignedDuration !== 'number' ||
        !Number.isFinite(assignedDuration) || assignedDuration <= 0) {
      return false;
    }

    this.startPos = { x: this.x, y: this.y };
    this.targetPos = { x: this.x + dx, y: this.y + dy };
    if (dx !== 0 || dy !== 0) {
      this.facing = { dx: dx, dy: dy };
    }

    this.animationDuration = assignedDuration;
    this.isMoving = true;
    this.animationProgress = 0.0;
    return true;
  }

  update(deltaTime) {
    if (!this.isMoving) {
      return false;
    }

    this.animationProgress += deltaTime / this.animationDuration;
    if (this.animationProgress >= 1.0) {
      this.x = this.targetPos.x;
      this.y = this.targetPos.y;
      this.isMoving = false;
      this.animationProgress = 0.0;
      return true;
    }

    return false;
  }

  isAnimating() {
    return this.isMoving;
  }

  getCurrentPosition() {
    if (!this.isMoving) {
      return { x: this.x, y: this.y };
    }

    const t = this.animationProgress;
    return {
      x: this.startPos.x + (this.targetPos.x - this.startPos.x) * t,
      y: this.startPos.y + (this.targetPos.y - this.startPos.y) * t
    };
  }

  /** Rendering-only parabolic hop; it never mutates logical coordinates. */
  getHopHeight() {
    if (!this.isMoving) {
      return 0;
    }
    return Math.sin(Math.PI * this.animationProgress) * this.maxHopHeight;
  }

  getVisualState() {
    return {
      facing: { dx: this.facing.dx, dy: this.facing.dy },
      hopHeight: this.getHopHeight()
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Player;
}
