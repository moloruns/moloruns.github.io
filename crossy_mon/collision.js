// Collision detection system
// Checks for player collisions with obstacles and hazards

// Fractional X positions are expected while riding. This tolerance is smaller
// than half a cell, so real gaps remain lethal while visually valid landings
// near a platform edge are accepted.
const PLATFORM_LANDING_TOLERANCE = 0.35;
const ENTITY_WRAP_THRESHOLD = 20;
const ENTITY_WRAP_RESET_POSITION = 5;

/**
 * Check if player overlaps with an entity (obstacle or platform)
 * @param {Object} player - Player object with x, y position
 * @param {Object} entity - Entity object with x, y, width
 * @param {number} tolerance - Optional horizontal landing tolerance
 * @returns {boolean} True if overlap detected
 */
function isOverlapping(player, entity, tolerance = 0) {
  if (player.y !== entity.y) {
    return false;
  }

  return player.x >= entity.x - tolerance &&
    player.x < entity.x + entity.width + tolerance;
}

/**
 * Return the collision width for a Platform. Lily Pads are always one logical
 * cell even when a historical fixture contains an obsolete wider visual width;
 * Logs continue to use their stored width unchanged.
 * @param {Object} platform - Platform record
 * @returns {number} Logical collision width
 */
function getPlatformLogicalWidth(platform) {
  return platform && platform.type === 'LILY_PAD' ? 1 : platform.width;
}

/**
 * Test Platform support using logical Platform geometry only. Generation-local
 * route-planning fields, if present on a test fixture, are deliberately ignored.
 * @param {Object} player - Player position
 * @param {Object} platform - Candidate Platform
 * @param {number} tolerance - Horizontal landing tolerance
 * @returns {boolean} True when the Platform supports the Player
 */
function isPlatformSupporting(player, platform, tolerance = PLATFORM_LANDING_TOLERANCE) {
  if (!player || !platform || player.y !== platform.y) {
    return false;
  }

  const logicalWidth = getPlatformLogicalWidth(platform);
  return player.x >= platform.x - tolerance &&
    player.x < platform.x + logicalWidth + tolerance;
}

/**
 * Find the first Platform whose logical support interval contains the Player.
 * @param {Object} player - Player position
 * @param {Object} terrain - Occupied River terrain row
 * @returns {Object|null} Supporting Platform, if any
 */
function findSupportingPlatform(player, terrain) {
  if (!terrain || !Array.isArray(terrain.platforms)) {
    return null;
  }

  return terrain.platforms.find(platform =>
    isPlatformSupporting(player, platform, PLATFORM_LANDING_TOLERANCE)
  ) || null;
}

/**
 * Calculate an entity's next position using the production wrap rules.
 * @param {Object} entity - Moving obstacle or platform
 * @param {number} deltaTime - Elapsed milliseconds
 * @returns {{x: number, wrapped: boolean}}
 */
function calculateEntityMovement(entity, deltaTime) {
  const nextX = entity.x + entity.velocity * deltaTime;

  if (entity.velocity > 0 && nextX > ENTITY_WRAP_THRESHOLD) {
    return { x: -ENTITY_WRAP_THRESHOLD - ENTITY_WRAP_RESET_POSITION, wrapped: true };
  }
  if (entity.velocity < 0 && nextX < -ENTITY_WRAP_THRESHOLD) {
    return { x: ENTITY_WRAP_THRESHOLD + ENTITY_WRAP_RESET_POSITION, wrapped: true };
  }

  return { x: nextX, wrapped: false };
}

/**
 * Check for collisions between player and world hazards
 * @param {Object} player - Player object with x, y position
 * @param {Object} world - World object containing terrain and entities
 * @returns {string} Collision result: 'SAFE', 'COLLISION', or 'WATER_HAZARD'
 */
function checkCollisions(player, world) {
  const terrain = world.getTerrainAt(player.x, player.y);

  if (!terrain) {
    return 'SAFE';
  }

  // Cars and trains retain strict collision bounds.
  const obstacles = world.getObstaclesAt(player.x, player.y);
  for (const obstacle of obstacles) {
    if (isOverlapping(player, obstacle)) {
      return 'COLLISION';
    }
  }

  if (terrain.type === 'RIVER' && !findSupportingPlatform(player, terrain)) {
    return 'WATER_HAZARD';
  }

  return 'SAFE';
}

/**
 * Carry a stationary player by the exact platform currently supporting them.
 * The platform itself is advanced later by updateMovingEntities; applying the
 * same displacement here keeps their relative positions identical without
 * double-applying velocity. A wrapping platform is allowed to teleport, but
 * the player is not: losing that support is a water hazard.
 *
 * @param {Object} player - Player object
 * @param {Object} world - World containing terrain/platforms
 * @param {number} deltaTime - Elapsed milliseconds
 * @returns {string} Collision result after anticipated movement
 */
function updatePlatformRiding(player, world, deltaTime) {
  if (!player || !world || player.isMoving || deltaTime <= 0) {
    return 'SAFE';
  }

  const terrain = world.getTerrainAt(player.x, player.y);
  if (!terrain || terrain.type !== 'RIVER') {
    return 'SAFE';
  }

  const platform = findSupportingPlatform(player, terrain);
  if (!platform) {
    return 'WATER_HAZARD';
  }

  const movement = calculateEntityMovement(platform, deltaTime);
  if (movement.wrapped) {
    return 'WATER_HAZARD';
  }

  const displacement = movement.x - platform.x;
  const nextPlayer = {
    x: player.x + displacement,
    y: player.y
  };
  const nextPlatform = {
    x: movement.x,
    y: platform.y,
    width: platform.width,
    type: platform.type
  };

  if (!isPlatformSupporting(nextPlayer, nextPlatform, PLATFORM_LANDING_TOLERANCE)) {
    return 'WATER_HAZARD';
  }

  player.x = nextPlayer.x;
  return 'SAFE';
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PLATFORM_LANDING_TOLERANCE,
    calculateEntityMovement,
    checkCollisions,
    findSupportingPlatform,
    getPlatformLogicalWidth,
    isOverlapping,
    isPlatformSupporting,
    updatePlatformRiding
  };
}
