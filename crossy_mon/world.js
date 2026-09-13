// World module
// Contains terrain rows, obstacles, and platforms
// Provides query methods for game state

class World {
  constructor() {
    // Terrain storage as Map<rowY, TerrainRow>
    this.terrainRows = new Map();
  }

  /**
   * Add a terrain row to the world
   * @param {Object} row - TerrainRow object with structure:
   *   {
   *     y: number,              // row Y coordinate
   *     type: string,           // 'GRASS' | 'ROAD' | 'RIVER' | 'TRAIN_TRACK'
   *     obstacles: Array,       // array of Obstacle objects
   *     platforms: Array,       // array of Platform objects
   *     metadata: Object        // terrain-specific data (direction, speed)
   *   }
   */
  addTerrainRow(row) {
    this.terrainRows.set(row.y, row);
  }

  /**
   * Remove a terrain row from the world
   * @param {number} y - Row Y coordinate to remove
   */
  removeTerrainRow(y) {
    this.terrainRows.delete(y);
  }

  /**
   * Query terrain at a specific position
   * @param {number} x - Grid X coordinate
   * @param {number} y - Grid Y coordinate
   * @returns {Object|null} TerrainRow object or null if no terrain exists
   */
  getTerrainAt(x, y) {
    return this.terrainRows.get(y) || null;
  }

  /**
   * Query obstacles at a specific position
   * @param {number} x - Grid X coordinate
   * @param {number} y - Grid Y coordinate
   * @returns {Array} Array of obstacles that overlap with position (x, y)
   */
  getObstaclesAt(x, y) {
    const terrain = this.terrainRows.get(y);
    if (!terrain || !terrain.obstacles) {
      return [];
    }

    // Filter obstacles that overlap with the player position
    // Player at position x overlaps with obstacle if:
    // x >= obstacle.x AND x < obstacle.x + obstacle.width
    return terrain.obstacles.filter(obstacle => {
      return x >= obstacle.x && x < obstacle.x + obstacle.width;
    });
  }

  /**
   * Query platform at a specific position
   * @param {number} x - Grid X coordinate
   * @param {number} y - Grid Y coordinate
   * @returns {Object|null} Platform object if player is on a platform, null otherwise
   */
  getPlatformAt(x, y, tolerance = 0) {
    const terrain = this.terrainRows.get(y);
    if (!terrain || !terrain.platforms) {
      return null;
    }

    // Platform landings allow a small horizontal tolerance so a player carried
    // to a fractional X coordinate can still make a visually valid grid jump.
    const platform = terrain.platforms.find(platform => {
      return x >= platform.x - tolerance &&
        x < platform.x + platform.width + tolerance;
    });

    return platform || null;
  }

  /**
   * Return the immutable decoration records owned by a terrain row.
   * Historical rows without decoration data are treated as undecorated.
   * @param {number} y - Row Y coordinate
   * @returns {Array} Row-owned decoration records, or an empty array
   */
  getDecorationsAt(y) {
    const terrain = this.terrainRows.get(y);
    return terrain && Array.isArray(terrain.decorations)
      ? terrain.decorations
      : [];
  }

  /**
   * Check whether a valid one-cell tree or rock blocks a position.
   * @param {number} x - Grid X coordinate, including fractional carried positions
   * @param {number} y - Grid Y coordinate
   * @returns {boolean} True when (x, y) occupies a Blocking_Prop cell
   */
  isBlockedAt(x, y) {
    return this.getDecorationsAt(y).some(decoration => {
      if (!decoration ||
          decoration.blocking !== true ||
          (decoration.type !== 'TREE' && decoration.type !== 'ROCK') ||
          !Number.isFinite(decoration.x) ||
          !Number.isFinite(decoration.y) ||
          !Number.isInteger(decoration.x) ||
          !Number.isInteger(decoration.y) ||
          decoration.y !== y) {
        return false;
      }

      return x >= decoration.x && x < decoration.x + 1;
    });
  }
}

// Keep static browser loading intact while supporting the existing Node tests.
if (typeof window !== 'undefined') {
  window.World = World;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = World;
}
