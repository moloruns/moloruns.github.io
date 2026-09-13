// Procedural terrain generator
// Creates terrain rows with appropriate obstacles and platforms

// Road and River rows now use deterministic score-derived speeds. The legacy
// ranges remain available as compatibility constants and define each type's
// exact baseline and cap. Trains continue to sample independently within their
// existing range.
const INITIAL_SPEED_RANGES = Object.freeze({
  CAR: Object.freeze({ min: 0.0064, max: 0.0144 }),
  PLATFORM: Object.freeze({ min: 0.0049, max: 0.0105 }),
  TRAIN: Object.freeze({ min: 0.0255, max: 0.0425 })
});

const SCORE_SPEED_CONFIG = Object.freeze({
  ROAD: Object.freeze({ base: 0.0064, cap: 0.0144 }),
  RIVER: Object.freeze({ base: 0.0049, cap: 0.0105 }),
  pointsPerTier: 25,
  tierGrowth: 0.10
});

const TRAIN_TRACK_CONFIG = Object.freeze({
  idleMin: 2500,
  idleMax: 7000,
  warningDuration: 3000,
  flashInterval: 350,
  minWidth: 7,
  maxWidth: 11,
  worldEdge: 20
});

// Base lane probabilities. Roads are the most common challenge, while grass
// remains frequent enough to break up hazards. A selected river always gets a
// second row; this probability controls only the optional third row.
const TERRAIN_SELECTION_CONFIG = Object.freeze({
  weights: Object.freeze({
    GRASS: 34,
    ROAD: 40,
    RIVER: 16,
    TRAIN_TRACK: 10
  }),
  riverContinuationChance: 0.60,
  maxConsecutiveRivers: 3,
  maxConsecutiveHazards: 3
});

const NON_RIVER_WEIGHTS = Object.freeze({
  GRASS: TERRAIN_SELECTION_CONFIG.weights.GRASS,
  ROAD: TERRAIN_SELECTION_CONFIG.weights.ROAD,
  TRAIN_TRACK: TERRAIN_SELECTION_CONFIG.weights.TRAIN_TRACK
});

function sampleRandom(random = Math.random) {
  return Math.min(Math.max(random(), 0), 0.999999999999);
}

function weightedRandom(weights, random = Math.random) {
  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((total, entry) => total + entry[1], 0);
  let target = sampleRandom(random) * totalWeight;

  for (const [terrainType, weight] of entries) {
    if (target < weight) {
      return terrainType;
    }
    target -= weight;
  }

  return entries[entries.length - 1][0];
}

/**
 * Keep a selected row within caps on both sides of a generated gap.
 */
function applyTerrainCaps(
  terrainType,
  previousTerrain,
  consecutiveCount,
  consecutiveHazardCount,
  followingRiverCount,
  followingHazardCount
) {
  const previousRiverCount = previousTerrain === 'RIVER' ? consecutiveCount : 0;
  if (
    terrainType === 'RIVER' &&
    previousRiverCount + 1 + followingRiverCount >
      TERRAIN_SELECTION_CONFIG.maxConsecutiveRivers
  ) {
    return 'GRASS';
  }

  // A new river commits two rows. Reserve room under the mixed-hazard cap
  // against both known sides: forward generation uses the previous count,
  // while backward boundary filling uses the following count for the partner
  // that will be prepended if traversal continues.
  if (
    terrainType === 'RIVER' &&
    previousTerrain !== 'RIVER' &&
    followingRiverCount === 0 &&
    consecutiveHazardCount + followingHazardCount + 2 >
      TERRAIN_SELECTION_CONFIG.maxConsecutiveHazards
  ) {
    return 'GRASS';
  }

  if (
    terrainType !== 'GRASS' &&
    consecutiveHazardCount + 1 + followingHazardCount >
      TERRAIN_SELECTION_CONFIG.maxConsecutiveHazards
  ) {
    return 'GRASS';
  }

  return terrainType;
}

/**
 * Select the next terrain type with forward river grouping guarantees.
 *
 * Base probabilities are grass 34%, road 40%, river 16%, and train track 10%.
 * The second row of every forward river is mandatory; a 60% roll adds an
 * optional third row. River and mixed-hazard runs never exceed three rows.
 * Following-row counts keep backward edge/gap filling from merging runs past
 * either cap and can safely complete a one-row river at the retained boundary.
 *
 * @param {string|null} previousTerrain - Type at y - 1, or null when unknown
 * @param {number} consecutiveCount - Consecutive rows of previousTerrain
 * @param {Function} random - Injectable random source
 * @param {number} consecutiveHazardCount - Consecutive non-grass rows at y - 1
 * @param {number} followingRiverCount - Consecutive rivers beginning at y + 1
 * @param {number} followingHazardCount - Consecutive hazards beginning at y + 1
 * @returns {string} Selected terrain type
 */
function selectNextTerrain(
  previousTerrain,
  consecutiveCount = 0,
  random = Math.random,
  consecutiveHazardCount = previousTerrain && previousTerrain !== 'GRASS'
    ? consecutiveCount
    : 0,
  followingRiverCount = 0,
  followingHazardCount = 0
) {
  if (
    (previousTerrain === 'RIVER' &&
      consecutiveCount >= TERRAIN_SELECTION_CONFIG.maxConsecutiveRivers) ||
    consecutiveHazardCount >= TERRAIN_SELECTION_CONFIG.maxConsecutiveHazards ||
    followingHazardCount >= TERRAIN_SELECTION_CONFIG.maxConsecutiveHazards
  ) {
    return 'GRASS';
  }

  const canBridgeRiverRuns =
    (previousTerrain === 'RIVER' ? consecutiveCount : 0) +
      1 + followingRiverCount <= TERRAIN_SELECTION_CONFIG.maxConsecutiveRivers &&
    consecutiveHazardCount + 1 + followingHazardCount <=
      TERRAIN_SELECTION_CONFIG.maxConsecutiveHazards;
  const mustCompleteRiver = canBridgeRiverRuns && (
    (previousTerrain === 'RIVER' && consecutiveCount === 1 && followingRiverCount <= 1) ||
    (previousTerrain !== 'RIVER' && followingRiverCount === 1)
  );

  let terrainType;
  if (mustCompleteRiver) {
    // Forward generation reaches this branch after a group's first row, so no
    // random sample can create a singleton. It also repairs a truncated
    // one-row run when extending the retained buffer backward.
    terrainType = 'RIVER';
  } else if (previousTerrain === 'RIVER' && consecutiveCount === 2) {
    const roll = sampleRandom(random);
    if (roll < TERRAIN_SELECTION_CONFIG.riverContinuationChance) {
      terrainType = 'RIVER';
    } else {
      // Reuse the remainder of the optional-third roll for the break type.
      const breakRoll = (roll - TERRAIN_SELECTION_CONFIG.riverContinuationChance) /
        (1 - TERRAIN_SELECTION_CONFIG.riverContinuationChance);
      terrainType = weightedRandom(NON_RIVER_WEIGHTS, () => breakRoll);
    }
  } else {
    terrainType = weightedRandom(TERRAIN_SELECTION_CONFIG.weights, random);
  }

  return applyTerrainCaps(
    terrainType,
    previousTerrain,
    consecutiveCount,
    consecutiveHazardCount,
    followingRiverCount,
    followingHazardCount
  );
}

/**
 * Derive sequence context from rows already stored around a target Y. Previous
 * rows drive continuation probability; following rows are consulted only to
 * enforce caps when a missing row is generated behind existing terrain.
 */
function getTerrainSequenceContext(terrainRows, y) {
  const previousRow = terrainRows && terrainRows.get(y - 1);
  let consecutiveCount = 0;
  let consecutiveHazardCount = 0;
  let followingRiverCount = 0;
  let followingHazardCount = 0;

  if (previousRow) {
    for (let rowY = y - 1; terrainRows.has(rowY); rowY--) {
      const row = terrainRows.get(rowY);
      if (row.type !== previousRow.type) {
        break;
      }
      consecutiveCount++;
    }

    for (let rowY = y - 1; terrainRows.has(rowY); rowY--) {
      const row = terrainRows.get(rowY);
      if (row.type === 'GRASS') {
        break;
      }
      consecutiveHazardCount++;
    }
  }

  for (let rowY = y + 1; terrainRows && terrainRows.has(rowY); rowY++) {
    const row = terrainRows.get(rowY);
    if (row.type !== 'RIVER') {
      break;
    }
    followingRiverCount++;
  }

  for (let rowY = y + 1; terrainRows && terrainRows.has(rowY); rowY++) {
    const row = terrainRows.get(rowY);
    if (row.type === 'GRASS') {
      break;
    }
    followingHazardCount++;
  }

  return {
    previousTerrain: previousRow ? previousRow.type : null,
    consecutiveCount,
    consecutiveHazardCount,
    followingRiverCount,
    followingHazardCount
  };
}

function randomSpeed(range, random = Math.random) {
  return range.min + sampleRandom(random) * (range.max - range.min);
}

function normalizeSpawnScore(spawnScore) {
  return Number.isFinite(spawnScore) && spawnScore >= 0
    ? Math.floor(spawnScore)
    : 0;
}

function calculateSpeedTier(spawnScore) {
  return Math.floor(
    normalizeSpawnScore(spawnScore) / SCORE_SPEED_CONFIG.pointsPerTier
  );
}

function calculateScoreScaledSpeed(rowType, spawnScore) {
  const config = SCORE_SPEED_CONFIG[rowType];
  if (!config) {
    throw new TypeError(`Unsupported score-scaled row type: ${rowType}`);
  }

  const speedTier = calculateSpeedTier(spawnScore);
  return Math.min(
    config.cap,
    config.base * (1 + SCORE_SPEED_CONFIG.tierGrowth * speedTier)
  );
}

function resolveScoreAwareGeneratorArguments(spawnScoreOrRandom, random) {
  if (typeof spawnScoreOrRandom === 'function') {
    return { spawnScore: 0, random: spawnScoreOrRandom };
  }

  return {
    spawnScore: normalizeSpawnScore(spawnScoreOrRandom),
    random: typeof random === 'function' ? random : Math.random
  };
}

function randomTrainIdleDelay(random = Math.random) {
  const range = TRAIN_TRACK_CONFIG.idleMax - TRAIN_TRACK_CONFIG.idleMin;
  return TRAIN_TRACK_CONFIG.idleMin + sampleRandom(random) * range;
}

const RIVER_ROUTE_CONFIG = Object.freeze({
  playableMinX: -15,
  playableMaxExclusiveX: 16,
  anchorMinX: -11,
  anchorMaxX: 11,
  phase: 0,
  platformCount: 5,
  routePlatformIndex: 2,
  landingTolerance: 0.35
});

const GRASS_DECORATION_CONFIG = Object.freeze({
  minX: -15,
  maxX: 15,
  routeMinX: -13,
  routeMaxX: 13,
  minGround: 2,
  maxGround: 8,
  maxGroundLimit: 10,
  minBlocking: 1,
  maxBlocking: 4,
  maxBlockingLimit: 6
});

function pingPongInteger(value, minimum, maximum) {
  const distance = maximum - minimum;
  if (distance <= 0) {
    return minimum;
  }

  const period = distance * 2;
  const wrapped = ((value - minimum) % period + period) % period;
  return minimum + (wrapped <= distance ? wrapped : period - wrapped);
}

/**
 * Return the generation-order-independent River route anchor for a world row.
 * Adjacent integer rows differ by exactly one cell, including at each turn.
 */
function getRiverRouteAnchor(y) {
  return pingPongInteger(
    y + RIVER_ROUTE_CONFIG.phase,
    RIVER_ROUTE_CONFIG.anchorMinX,
    RIVER_ROUTE_CONFIG.anchorMaxX
  );
}

function validateRiverGroupCoordinates(rowYs) {
  if (!Array.isArray(rowYs) || (rowYs.length !== 2 && rowYs.length !== 3)) {
    throw new RangeError('River Groups must contain two or three rows');
  }
  if (!rowYs.every((y) => Number.isInteger(y))) {
    throw new TypeError('River Group row coordinates must be integers');
  }

  const step = rowYs[1] - rowYs[0];
  if (Math.abs(step) !== 1) {
    throw new RangeError('River Group row coordinates must be contiguous');
  }
  for (let index = 2; index < rowYs.length; index++) {
    if (rowYs[index] - rowYs[index - 1] !== step) {
      throw new RangeError('River Group row coordinates must be ordered and contiguous');
    }
  }
}

/**
 * Build an ephemeral coordinate-only River route plan. The returned objects
 * are caller-local and are never attached to Terrain Rows or Platforms.
 */
function buildRiverRoutePlan(rowYs) {
  validateRiverGroupCoordinates(rowYs);
  return rowYs.map((y) => ({ y: y, anchorX: getRiverRouteAnchor(y) }));
}

/**
 * Return one Platform's support interval, or null for malformed input.
 */
function getPlatformSupportInterval(platform) {
  if (
    !platform ||
    !Number.isFinite(platform.x) ||
    !Number.isFinite(platform.width) ||
    platform.width <= 0
  ) {
    return null;
  }

  return {
    min: platform.x - RIVER_ROUTE_CONFIG.landingTolerance,
    max: platform.x + platform.width + RIVER_ROUTE_CONFIG.landingTolerance
  };
}

function isValidRoutePlatform(platform, rowY) {
  if (!platform || platform.y !== rowY || !Number.isFinite(platform.x)) {
    return false;
  }

  const hasValidWidth = platform.type === 'LILY_PAD'
    ? platform.width === 1
    : platform.type === 'LOG' &&
      Number.isInteger(platform.width) &&
      (platform.width === 3 || platform.width === 4);
  if (!hasValidWidth) {
    return false;
  }

  return platform.x >= RIVER_ROUTE_CONFIG.playableMinX &&
    platform.x + platform.width <= RIVER_ROUTE_CONFIG.playableMaxExclusiveX;
}

function supportIntervalsOverlap(left, right) {
  return left.min < right.max && right.min < left.max;
}

/**
 * Find one existing in-span Platform per ordered River row without mutating or
 * annotating any input. Search tables and the returned route are caller-local.
 */
function findInSpanCrossingRoute(riverRows) {
  if (!Array.isArray(riverRows) ||
      (riverRows.length !== 2 && riverRows.length !== 3)) {
    return null;
  }

  const rowYs = [];
  for (const row of riverRows) {
    if (!row || row.type !== 'RIVER' || !Number.isInteger(row.y) ||
        !Array.isArray(row.platforms)) {
      return null;
    }
    rowYs.push(row.y);
  }

  try {
    validateRiverGroupCoordinates(rowYs);
  } catch (error) {
    return null;
  }

  const candidatesByRow = riverRows.map((row) => row.platforms.filter(
    (platform) => isValidRoutePlatform(platform, row.y)
  ));
  if (candidatesByRow.some((candidates) => candidates.length === 0)) {
    return null;
  }

  const predecessors = candidatesByRow.map((candidates) =>
    candidates.map(() => -1)
  );
  const reachable = candidatesByRow[0].map(() => true);
  let previousReachable = reachable;

  for (let rowIndex = 1; rowIndex < candidatesByRow.length; rowIndex++) {
    const previousCandidates = candidatesByRow[rowIndex - 1];
    const currentCandidates = candidatesByRow[rowIndex];
    const currentReachable = currentCandidates.map(() => false);

    for (let currentIndex = 0; currentIndex < currentCandidates.length; currentIndex++) {
      const currentInterval = getPlatformSupportInterval(
        currentCandidates[currentIndex]
      );
      for (let previousIndex = 0;
        previousIndex < previousCandidates.length;
        previousIndex++) {
        if (!previousReachable[previousIndex]) {
          continue;
        }
        const previousInterval = getPlatformSupportInterval(
          previousCandidates[previousIndex]
        );
        if (supportIntervalsOverlap(previousInterval, currentInterval)) {
          predecessors[rowIndex][currentIndex] = previousIndex;
          currentReachable[currentIndex] = true;
          break;
        }
      }
    }

    if (!currentReachable.some(Boolean)) {
      return null;
    }
    previousReachable = currentReachable;
  }

  const route = new Array(candidatesByRow.length);
  let candidateIndex = previousReachable.findIndex(Boolean);
  for (let rowIndex = candidatesByRow.length - 1; rowIndex >= 0; rowIndex--) {
    route[rowIndex] = candidatesByRow[rowIndex][candidateIndex];
    if (rowIndex > 0) {
      candidateIndex = predecessors[rowIndex][candidateIndex];
    }
  }
  return route;
}

function hasInSpanCrossingRoute(riverRows) {
  return findInSpanCrossingRoute(riverRows) !== null;
}

/**
 * Return the coordinate-derived route column for a world row. The period is
 * stable for every generation order and adjacent rows differ by one cell.
 */
function routeX(visualSeed, y) {
  const routeWidth = GRASS_DECORATION_CONFIG.routeMaxX -
    GRASS_DECORATION_CONFIG.routeMinX;
  const phase = visualHash(visualSeed, 'route-phase', 0) % (routeWidth * 2);
  return pingPongInteger(
    y + GRASS_DECORATION_CONFIG.routeMinX + phase,
    GRASS_DECORATION_CONFIG.routeMinX,
    GRASS_DECORATION_CONFIG.routeMaxX
  );
}

function getReservedRouteCells(visualSeed, y) {
  const currentX = routeX(visualSeed, y);
  const nextX = routeX(visualSeed, y + 1);
  const reserved = new Set();

  for (let x = Math.min(currentX, nextX); x <= Math.max(currentX, nextX); x++) {
    reserved.add(x);
  }

  return reserved;
}

function isStartingAreaBlocker(x, y) {
  return x >= -2 && x <= 2 && y >= -2 && y <= 2;
}

function getTerrainLookupRow(terrainLookup, y) {
  if (!terrainLookup) {
    return null;
  }
  if (typeof terrainLookup === 'function') {
    return terrainLookup(y) || null;
  }
  if (typeof terrainLookup.get === 'function') {
    return terrainLookup.get(y) || null;
  }
  return terrainLookup[y] || null;
}

function normalizeGrassRows(rows) {
  let sourceRows;
  if (!rows) {
    sourceRows = [];
  } else if (Array.isArray(rows)) {
    sourceRows = rows;
  } else if (typeof rows.values === 'function') {
    sourceRows = Array.from(rows.values());
  } else {
    sourceRows = Object.keys(rows).map((key) => rows[key]);
  }

  return sourceRows
    .filter((row) => row && row.type === 'GRASS' && Number.isInteger(row.y))
    .sort((left, right) => left.y - right.y);
}

function isRouteBlocker(decoration, minX, maxX) {
  return decoration && decoration.blocking === true &&
    (decoration.type === 'TREE' || decoration.type === 'ROCK') &&
    Number.isInteger(decoration.x) && decoration.x >= minX &&
    decoration.x <= maxX && Number.isInteger(decoration.y);
}

function grassRegionHasRoute(region, minX, maxX) {
  if (region.length === 0) {
    return true;
  }

  const blocked = new Set();
  region.forEach((row) => {
    const decorations = Array.isArray(row.decorations) ? row.decorations : [];
    decorations.forEach((decoration) => {
      if (isRouteBlocker(decoration, minX, maxX) && decoration.y === row.y) {
        blocked.add(`${decoration.x}:${row.y}`);
      }
    });
  });

  const firstY = region[0].y;
  const lastY = region[region.length - 1].y;
  const queue = [];
  const visited = new Set();

  for (let x = minX; x <= maxX; x++) {
    const key = `${x}:${firstY}`;
    if (!blocked.has(key)) {
      queue.push({ x, y: firstY });
      visited.add(key);
    }
  }

  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index];
    if (cell.y === lastY) {
      return true;
    }

    const neighbors = [
      { x: cell.x - 1, y: cell.y },
      { x: cell.x + 1, y: cell.y },
      { x: cell.x, y: cell.y - 1 },
      { x: cell.x, y: cell.y + 1 }
    ];

    neighbors.forEach((neighbor) => {
      if (neighbor.x < minX || neighbor.x > maxX ||
          neighbor.y < firstY || neighbor.y > lastY) {
        return;
      }
      const key = `${neighbor.x}:${neighbor.y}`;
      if (!blocked.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push(neighbor);
      }
    });
  }

  return false;
}

/**
 * Validate every contiguous grass region with four-neighbor traversal.
 */
function validateGrassRoute(
  rows,
  minX = GRASS_DECORATION_CONFIG.minX,
  maxX = GRASS_DECORATION_CONFIG.maxX
) {
  const grassRows = normalizeGrassRows(rows);
  let region = [];

  for (const row of grassRows) {
    if (region.length > 0 && row.y !== region[region.length - 1].y + 1) {
      if (!grassRegionHasRoute(region, minX, maxX)) {
        return false;
      }
      region = [];
    }
    region.push(row);
  }

  return grassRegionHasRoute(region, minX, maxX);
}

function collectAdjacentGrassRows(rowY, decorations, terrainLookup) {
  const rows = [{ y: rowY, type: 'GRASS', decorations }];

  for (let y = rowY - 1; ; y--) {
    const row = getTerrainLookupRow(terrainLookup, y);
    if (!row || row.type !== 'GRASS') {
      break;
    }
    rows.push(row);
  }

  for (let y = rowY + 1; ; y++) {
    const row = getTerrainLookupRow(terrainLookup, y);
    if (!row || row.type !== 'GRASS') {
      break;
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Remove proposed blockers in a stable priority order until the merged grass
 * region is traversable. Non-blocking decoration is never removed.
 */
function repairGrassDecorations(rowY, visualSeed, decorations, terrainLookup) {
  const repaired = decorations.slice();
  const removable = repaired
    .filter((decoration) => decoration.blocking === true)
    .sort((left, right) => {
      const leftPriority = visualHash(
        visualSeed,
        'decoration-repair-priority',
        rowY,
        left.x
      );
      const rightPriority = visualHash(
        visualSeed,
        'decoration-repair-priority',
        rowY,
        right.x
      );
      return rightPriority - leftPriority || right.x - left.x;
    });

  while (!validateGrassRoute(
    collectAdjacentGrassRows(rowY, repaired, terrainLookup)
  ) && removable.length > 0) {
    const removed = removable.shift();
    const index = repaired.indexOf(removed);
    if (index >= 0) {
      repaired.splice(index, 1);
    }
  }

  if (!validateGrassRoute(collectAdjacentGrassRows(rowY, repaired, terrainLookup))) {
    return repaired.filter((decoration) => decoration.blocking !== true);
  }

  return repaired;
}

function createDecorationRecord(visualSeed, rowY, x, type, blocking) {
  return {
    id: `${rowY}:${x}:${type}`,
    type,
    x,
    y: rowY,
    blocking,
    variant: visualHash(visualSeed, `${type}:variant`, rowY, x) % 3,
    paletteIndex: visualHash(visualSeed, `${type}:palette`, rowY, x) % 3
  };
}

/**
 * Generate immutable, row-owned decoration without consuming gameplay RNG.
 */
function generateGrassDecorations(rowY, visualSeed = 0, terrainLookup = null) {
  const positions = [];
  for (
    let x = GRASS_DECORATION_CONFIG.minX;
    x <= GRASS_DECORATION_CONFIG.maxX;
    x++
  ) {
    positions.push(x);
  }
  positions.sort((left, right) => {
    const leftPriority = visualHash(visualSeed, 'decoration-position', rowY, left);
    const rightPriority = visualHash(visualSeed, 'decoration-position', rowY, right);
    return leftPriority - rightPriority || left - right;
  });

  const reserved = getReservedRouteCells(visualSeed, rowY);
  const used = new Set();
  const decorations = [];
  const blockingTarget = GRASS_DECORATION_CONFIG.minBlocking +
    visualHash(visualSeed, 'blocking-count', rowY) %
      (GRASS_DECORATION_CONFIG.maxBlocking -
        GRASS_DECORATION_CONFIG.minBlocking + 1);
  const groundTarget = GRASS_DECORATION_CONFIG.minGround +
    visualHash(visualSeed, 'ground-count', rowY) %
      (GRASS_DECORATION_CONFIG.maxGround -
        GRASS_DECORATION_CONFIG.minGround + 1);

  for (const x of positions) {
    if (decorations.filter((record) => record.blocking).length >= blockingTarget) {
      break;
    }
    if (reserved.has(x) || isStartingAreaBlocker(x, rowY)) {
      continue;
    }

    const type = visualHash(visualSeed, 'blocking-type', rowY, x) % 2 === 0
      ? 'TREE'
      : 'ROCK';
    decorations.push(createDecorationRecord(visualSeed, rowY, x, type, true));
    used.add(x);
  }

  let groundCount = 0;
  for (const x of positions) {
    if (groundCount >= groundTarget) {
      break;
    }
    if (used.has(x)) {
      continue;
    }

    const type = visualHash(visualSeed, 'ground-type', rowY, x) % 2 === 0
      ? 'FLOWER'
      : 'GRASS_TUFT';
    decorations.push(createDecorationRecord(visualSeed, rowY, x, type, false));
    used.add(x);
    groundCount++;
  }

  const repaired = repairGrassDecorations(
    rowY,
    visualSeed,
    decorations.slice(
      0,
      GRASS_DECORATION_CONFIG.maxGroundLimit +
        GRASS_DECORATION_CONFIG.maxBlockingLimit
    ),
    terrainLookup
  );
  // Enforce the independent hard caps after route repair. The current target
  // ranges are lower, but this postcondition keeps future placement changes
  // from exceeding the per-row render/storage workload contract.
  let committedGroundCount = 0;
  let committedBlockingCount = 0;
  const boundedRecords = repaired.filter((record) => {
    if (record.blocking === true) {
      if (committedBlockingCount >= GRASS_DECORATION_CONFIG.maxBlockingLimit) {
        return false;
      }
      committedBlockingCount++;
      return true;
    }

    if (committedGroundCount >= GRASS_DECORATION_CONFIG.maxGroundLimit) {
      return false;
    }
    committedGroundCount++;
    return true;
  });
  const frozenRecords = boundedRecords.map((record) => Object.freeze(record));
  return Object.freeze(frozenRecords);
}

/**
 * Generate a grass terrain row with deterministic Stage 2 decoration.
 * @param {number} y - The Y coordinate for the terrain row
 * @param {*} visualSeed - Stable seed used only by coordinate hashing
 * @param {Map|Function|Object|null} terrainLookup - Existing neighboring rows
 * @returns {Object} TerrainRow object with type 'GRASS'
 */
function generateGrass(y, visualSeed = 0, terrainLookup = null) {
  return {
    y: y,
    type: 'GRASS',
    obstacles: [],
    platforms: [],
    decorations: generateGrassDecorations(y, visualSeed, terrainLookup),
    metadata: {}
  };
}

/**
 * Generate a road terrain row with moving cars.
 * Supports both generateRoad(y, random) and generateRoad(y, spawnScore, random).
 * @param {number} y - The Y coordinate for the terrain row
 * @param {number|Function} spawnScoreOrRandom - Spawn Score or legacy RNG
 * @param {Function} random - Injectable random source for deterministic tests
 * @returns {Object} TerrainRow object with type 'ROAD'
 */
function generateRoad(y, spawnScoreOrRandom = 0, random = Math.random) {
  const args = resolveScoreAwareGeneratorArguments(spawnScoreOrRandom, random);
  const spawnScore = args.spawnScore;
  const gameplayRandom = args.random;
  const speedTier = calculateSpeedTier(spawnScore);
  const lockedRowSpeed = calculateScoreScaledSpeed('ROAD', spawnScore);
  const numCars = Math.floor(sampleRandom(gameplayRandom) * 3) + 2;
  const direction = sampleRandom(gameplayRandom) < 0.5 ? -1 : 1;
  const velocity = lockedRowSpeed * direction;
  const obstacles = [];
  const minSpacing = 3;
  const carWidth = 2;
  let currentX = sampleRandom(gameplayRandom) * 5 - 10;

  for (let i = 0; i < numCars; i++) {
    obstacles.push({
      x: currentX,
      y: y,
      width: carWidth,
      velocity: velocity,
      type: 'CAR'
    });
    currentX += carWidth + minSpacing + sampleRandom(gameplayRandom) * 3;
  }

  return {
    y: y,
    type: 'ROAD',
    obstacles: obstacles,
    platforms: [],
    metadata: {
      spawnScore: spawnScore,
      speedTier: speedTier,
      direction: direction,
      lockedRowSpeed: lockedRowSpeed,
      speed: lockedRowSpeed
    }
  };
}

/**
 * Create one ordinary River row while preserving the established gameplay RNG
 * sequence: direction, then Log-width/type/horizontal-placement samples for
 * each of five Platforms. A finite route anchor replaces only one sampled
 * placement; its random sample is still consumed.
 */
function createRiverRow(y, spawnScore, gameplayRandom, routeAnchorX = null) {
  const speedTier = calculateSpeedTier(spawnScore);
  const lockedRowSpeed = calculateScoreScaledSpeed('RIVER', spawnScore);
  const direction = sampleRandom(gameplayRandom) < 0.5 ? -1 : 1;
  const velocity = lockedRowSpeed * direction;
  const platforms = [];
  const platformTypes = ['LOG', 'LILY_PAD'];
  const platformSlots = [-12, -6, 0, 6, 12];

  for (let platformIndex = 0;
    platformIndex < RIVER_ROUTE_CONFIG.platformCount;
    platformIndex++) {
    const sampledLogWidth = Math.floor(sampleRandom(gameplayRandom) * 2) + 3;
    const platformType = platformTypes[
      Math.floor(sampleRandom(gameplayRandom) * platformTypes.length)
    ];
    const horizontalJitter = (sampleRandom(gameplayRandom) - 0.5) * 0.4;
    const sampledX = platformSlots[platformIndex] + horizontalJitter;
    const platformX = platformIndex === RIVER_ROUTE_CONFIG.routePlatformIndex &&
      Number.isFinite(routeAnchorX)
      ? routeAnchorX : sampledX;

    platforms.push({
      x: platformX,
      y: y,
      width: platformType === 'LILY_PAD' ? 1 : sampledLogWidth,
      velocity: velocity,
      type: platformType
    });
  }

  return {
    y: y,
    type: 'RIVER',
    obstacles: [],
    platforms: platforms,
    metadata: {
      spawnScore: spawnScore,
      speedTier: speedTier,
      direction: direction,
      lockedRowSpeed: lockedRowSpeed,
      speed: lockedRowSpeed
    }
  };
}

/**
 * Generate a river terrain row with moving platforms.
 * Supports both generateRiver(y, random) and generateRiver(y, spawnScore, random).
 * @param {number} y - The Y coordinate for the terrain row
 * @param {number|Function} spawnScoreOrRandom - Spawn Score or legacy RNG
 * @param {Function} random - Injectable random source for deterministic tests
 * @returns {Object} TerrainRow object with type 'RIVER'
 */
function generateRiver(y, spawnScoreOrRandom = 0, random = Math.random) {
  const args = resolveScoreAwareGeneratorArguments(spawnScoreOrRandom, random);
  return createRiverRow(y, args.spawnScore, args.random);
}

/**
 * Generate and validate one complete two- or three-row River Group. Route
 * planning, candidate references, predecessor tables, and validation results
 * remain local to this invocation; only ordinary Terrain Rows are returned.
 */
function generateRiverGroup(rowYs, spawnScoreOrRandom = 0, random = Math.random) {
  const plan = buildRiverRoutePlan(rowYs);
  const args = resolveScoreAwareGeneratorArguments(spawnScoreOrRandom, random);
  const rows = plan.map((entry) => createRiverRow(
    entry.y,
    args.spawnScore,
    args.random,
    entry.anchorX
  ));

  if (!hasInSpanCrossingRoute(rows)) {
    throw new Error('Generated River Group does not contain an in-span crossing route');
  }
  return rows;
}

/**
 * Generate a train track row. Trains are event-driven rather than permanent:
 * every row begins with an independently randomized idle delay, flashes a
 * warning signal for three seconds, runs one train through, then cools down.
 * @param {number} y - The Y coordinate for the terrain row
 * @param {Function} random - Injectable random source for deterministic tests
 * @returns {Object} TerrainRow object with type 'TRAIN_TRACK'
 */
function generateTrainTrack(y, random = Math.random) {
  return {
    y: y,
    type: 'TRAIN_TRACK',
    obstacles: [],
    platforms: [],
    metadata: {
      trainState: 'IDLE',
      idleRemaining: randomTrainIdleDelay(random),
      warningElapsed: 0,
      warningLightOn: false,
      completedEvents: 0
    }
  };
}

function activateTrain(terrainRow, random, visualSeed = 0) {
  const direction = sampleRandom(random) < 0.5 ? -1 : 1;
  const speed = randomSpeed(INITIAL_SPEED_RANGES.TRAIN, random);
  const widthRange = TRAIN_TRACK_CONFIG.maxWidth - TRAIN_TRACK_CONFIG.minWidth + 1;
  const width = TRAIN_TRACK_CONFIG.minWidth + Math.floor(sampleRandom(random) * widthRange);
  const startX = direction > 0
    ? -TRAIN_TRACK_CONFIG.worldEdge - width
    : TRAIN_TRACK_CONFIG.worldEdge;
  const eventIndex = Number.isInteger(terrainRow.metadata.completedEvents)
    ? terrainRow.metadata.completedEvents : 0;

  terrainRow.obstacles = [{
    x: startX,
    y: terrainRow.y,
    width: width,
    velocity: speed * direction,
    type: 'TRAIN',
    visual: createEntityVisual(visualSeed, terrainRow.y, 'TRAIN', 0, eventIndex)
  }];
  terrainRow.metadata.trainState = 'ACTIVE';
  terrainRow.metadata.direction = direction;
  terrainRow.metadata.speed = speed;
  terrainRow.metadata.warningLightOn = false;
}

function resetTrainTrackToIdle(terrainRow, random) {
  terrainRow.obstacles = [];
  terrainRow.metadata.trainState = 'IDLE';
  terrainRow.metadata.idleRemaining = randomTrainIdleDelay(random);
  terrainRow.metadata.warningElapsed = 0;
  terrainRow.metadata.warningLightOn = false;
  terrainRow.metadata.completedEvents += 1;
}

/**
 * Advance one track's event lifecycle and active train movement.
 * @param {Object} terrainRow - TRAIN_TRACK terrain row
 * @param {number} deltaTime - Elapsed milliseconds
 * @param {Function} random - Injectable random source for deterministic tests
 * @param {*} visualSeed - Stable seed used only for train rendering metadata
 */
function updateTrainTrackLifecycle(
  terrainRow,
  deltaTime,
  random = Math.random,
  visualSeed = 0
) {
  if (!terrainRow || terrainRow.type !== 'TRAIN_TRACK' || deltaTime <= 0) {
    return;
  }

  const metadata = terrainRow.metadata;
  let remainingTime = deltaTime;

  if (metadata.trainState === 'IDLE') {
    if (remainingTime < metadata.idleRemaining) {
      metadata.idleRemaining -= remainingTime;
      return;
    }

    remainingTime -= metadata.idleRemaining;
    metadata.idleRemaining = 0;
    metadata.trainState = 'WARNING';
    metadata.warningElapsed = 0;
    metadata.warningLightOn = true;
  }

  if (metadata.trainState === 'WARNING') {
    const warningRemaining = TRAIN_TRACK_CONFIG.warningDuration - metadata.warningElapsed;
    if (remainingTime < warningRemaining) {
      metadata.warningElapsed += remainingTime;
      metadata.warningLightOn = Math.floor(
        metadata.warningElapsed / TRAIN_TRACK_CONFIG.flashInterval
      ) % 2 === 0;
      return;
    }

    metadata.warningElapsed = TRAIN_TRACK_CONFIG.warningDuration;
    remainingTime -= warningRemaining;
    activateTrain(terrainRow, random, visualSeed);
  }

  if (metadata.trainState !== 'ACTIVE' || remainingTime <= 0) {
    return;
  }

  const train = terrainRow.obstacles[0];
  if (!train) {
    resetTrainTrackToIdle(terrainRow, random);
    return;
  }

  train.x += train.velocity * remainingTime;
  const exitedRight = train.velocity > 0 && train.x > TRAIN_TRACK_CONFIG.worldEdge;
  const exitedLeft = train.velocity < 0 &&
    train.x + train.width < -TRAIN_TRACK_CONFIG.worldEdge;

  if (exitedRight || exitedLeft) {
    resetTrainTrackToIdle(terrainRow, random);
  }
}

const ENTITY_VISUAL_CONFIG = Object.freeze({
  CAR: Object.freeze({ paletteCount: 6, modelVariantCount: 3 }),
  TRAIN: Object.freeze({ paletteCount: 3, modelVariantCount: 3 }),
  LOG: Object.freeze({ paletteCount: 3, modelVariantCount: 3 }),
  LILY_PAD: Object.freeze({ paletteCount: 4, modelVariantCount: 3 })
});

/**
 * Mix text into one unsigned 32-bit value using fixed integer arithmetic.
 * This helper is intentionally independent from Math.random and mutable state.
 *
 * @param {string} text - Text to hash
 * @returns {number} Unsigned 32-bit hash
 */
function mixVisualText(text) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Derive deterministic visual data from a seed and stable world coordinates.
 * Length-prefixed parts prevent delimiter-like seed/channel values from being
 * ambiguous. No gameplay random source is accepted or consumed.
 *
 * @param {*} seed - Stable Visual_Seed value
 * @param {*} channel - Namespace for the visual value
 * @param {*} y - Stable world-row coordinate
 * @param {*} x - Stable world-column coordinate
 * @param {*} ordinal - Stable item ordinal within its owner
 * @returns {number} Unsigned 32-bit hash
 */
function visualHash(seed, channel, y, x = 0, ordinal = 0) {
  const encoded = [seed, channel, y, x, ordinal]
    .map((part) => {
      const value = String(part);
      return `${value.length}:${value}`;
    })
    .join('|');
  return mixVisualText(encoded);
}

/**
 * Return a deterministic unit value in the half-open range [0, 1).
 */
function visualUnit(seed, channel, y, x = 0, ordinal = 0) {
  return visualHash(seed, channel, y, x, ordinal) / 0x100000000;
}

/**
 * Create immutable rendering metadata for a generated moving entity.
 * Gameplay fields are deliberately absent so this data cannot change position,
 * width, velocity, direction, or train lifecycle behavior.
 *
 * @param {*} visualSeed - Stable Visual_Seed value
 * @param {number} rowY - Owning terrain-row coordinate
 * @param {string} type - CAR, TRAIN, LOG, or LILY_PAD
 * @param {number} ordinal - Stable entity ordinal within the row
 * @param {number} eventIndex - Completed-event index for successive trains
 * @returns {Object} Frozen rendering metadata
 */
function createEntityVisual(visualSeed, rowY, type, ordinal, eventIndex = 0) {
  const normalizedType = String(type || '').toUpperCase();
  const config = ENTITY_VISUAL_CONFIG[normalizedType] ||
    Object.freeze({ paletteCount: 1, modelVariantCount: 1 });
  const eventChannel = `${normalizedType}:event:${eventIndex}`;
  let id;

  if (normalizedType === 'CAR') {
    id = `road:${rowY}:car:${ordinal}`;
  } else if (normalizedType === 'TRAIN') {
    id = `track:${rowY}:train:${eventIndex}`;
  } else if (normalizedType === 'LOG') {
    id = `river:${rowY}:log:${ordinal}`;
  } else if (normalizedType === 'LILY_PAD') {
    id = `river:${rowY}:lily-pad:${ordinal}`;
  } else {
    id = `entity:${rowY}:${normalizedType || 'UNKNOWN'}:${ordinal}`;
  }

  const visual = {
    id,
    paletteIndex: visualHash(
      visualSeed,
      `${eventChannel}:palette`,
      rowY,
      0,
      ordinal
    ) % config.paletteCount,
    modelVariant: visualHash(
      visualSeed,
      `${eventChannel}:model`,
      rowY,
      0,
      ordinal
    ) % config.modelVariantCount
  };

  if (normalizedType === 'LILY_PAD') {
    visual.hasFlowerAccent = visualHash(
      visualSeed,
      `${eventChannel}:flower`,
      rowY,
      0,
      ordinal
    ) % 2 === 0;
  }

  return Object.freeze(visual);
}

/**
 * Create the immutable background Cloud set for one Visual_Seed.
 * Descriptors use normalized background anchors and contain no world or
 * collision fields. They are generated once by callers and reused by render.
 *
 * @param {*} visualSeed - Stable Visual_Seed value
 * @returns {ReadonlyArray<Object>} Frozen array of frozen Cloud descriptors
 */
function generateClouds(visualSeed) {
  const cloudCount = 2 + visualHash(visualSeed, 'cloud-count', 0) % 4;
  const clouds = [];

  for (let ordinal = 0; ordinal < cloudCount; ordinal++) {
    const opacity = Math.min(
      0.35,
      0.18 + visualUnit(visualSeed, 'cloud-opacity', 0, 0, ordinal) * 0.17
    );

    clouds.push(Object.freeze({
      id: `cloud:${ordinal}`,
      anchorX: 0.08 + visualUnit(
        visualSeed,
        'cloud-anchor-x',
        0,
        0,
        ordinal
      ) * 0.84,
      anchorY: 0.06 + visualUnit(
        visualSeed,
        'cloud-anchor-y',
        0,
        0,
        ordinal
      ) * 0.22,
      scale: 0.8 + visualUnit(
        visualSeed,
        'cloud-scale',
        0,
        0,
        ordinal
      ) * 0.45,
      opacity,
      formCount: 3 + visualHash(
        visualSeed,
        'cloud-form-count',
        0,
        0,
        ordinal
      ) % 4,
      variant: visualHash(
        visualSeed,
        'cloud-variant',
        0,
        0,
        ordinal
      ) % 3,
      parallaxRate: 0.002 + visualUnit(
        visualSeed,
        'cloud-parallax',
        0,
        0,
        ordinal
      ) * 0.004
    }));
  }

  return Object.freeze(clouds);
}

const PICKUP_TYPES = Object.freeze([
  'POKE_BALL',
  'GREAT_BALL',
  'QUICK_BALL',
  'HEAVY_BALL'
]);

const PICKUP_COSMETIC_CONFIG = Object.freeze({
  schemaVersion: 2,
  minX: -15,
  maxX: 15,
  eligibilityBucketCount: 100,
  eligibleBucketCount: 10,
  typeBucketCount: PICKUP_TYPES.length,
  variantCount: 3,
  pickupTypes: PICKUP_TYPES,
  eligibleTerrainTypes: Object.freeze(['GRASS', 'ROAD', 'TRAIN_TRACK']),
  channels: Object.freeze({
    // Preserve the implemented v1 eligibility, placement, and variant keys so
    // this schema migration does not reroll existing stable row identities.
    eligibility: 'pokemon-reskin-and-pokeballs:v1:pokeball:eligibility',
    candidatePriority: 'pokemon-reskin-and-pokeballs:v1:pokeball:candidate-priority',
    variant: 'pokemon-reskin-and-pokeballs:v1:pokeball:variant',
    type: 'pokemon-reskin-and-pokeballs:v2:pickup:type'
  })
});

// Staged callers and focused tests still resolve the original constant name.
const POKE_BALL_COSMETIC_CONFIG = PICKUP_COSMETIC_CONFIG;

function isPickupTerrainType(terrainType) {
  return PICKUP_COSMETIC_CONFIG.eligibleTerrainTypes.indexOf(terrainType) >= 0;
}

function isSupportedPickupType(pickupType) {
  return PICKUP_TYPES.indexOf(pickupType) >= 0;
}

function isPlayableCosmeticX(x) {
  return Number.isInteger(x) &&
    x >= PICKUP_COSMETIC_CONFIG.minX &&
    x <= PICKUP_COSMETIC_CONFIG.maxX;
}

function isUnsignedVisualKey(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

/**
 * Derive one versioned Pickup Key from stable world identity. This helper has
 * no random-source parameter and never reads Math.random.
 */
function derivePickupCosmeticKey(
  visualSeed,
  rowY,
  terrainType,
  channel,
  candidateX = 0
) {
  const channelName = PICKUP_COSMETIC_CONFIG.channels[channel];
  if (
    !Number.isInteger(rowY) ||
    !isPickupTerrainType(terrainType) ||
    typeof channelName !== 'string' ||
    !Number.isInteger(candidateX) ||
    (channel === 'candidatePriority' && !isPlayableCosmeticX(candidateX))
  ) {
    return null;
  }

  const key = visualHash(
    visualSeed,
    `${channelName}:${terrainType}`,
    rowY,
    candidateX
  );
  return isUnsignedVisualKey(key) ? key : null;
}

/**
 * Map a stable row identity into the preserved exact 100-bucket domain.
 */
function getPickupEligibilityBucket(visualSeed, rowY, terrainType) {
  const key = derivePickupCosmeticKey(
    visualSeed,
    rowY,
    terrainType,
    'eligibility'
  );
  return key === null
    ? null
    : key % PICKUP_COSMETIC_CONFIG.eligibilityBucketCount;
}

/**
 * Only buckets 0 through 9 are eligible. River and unsupported terrain never
 * enter the hash path and therefore cannot receive a descriptor.
 */
function isPickupEligible(visualSeed, rowY, terrainType) {
  const bucket = getPickupEligibilityBucket(visualSeed, rowY, terrainType);
  return bucket !== null && bucket < PICKUP_COSMETIC_CONFIG.eligibleBucketCount;
}

/**
 * Map the independent version-2 type key into exactly four decision buckets.
 */
function getPickupTypeBucket(visualSeed, rowY, terrainType) {
  const key = derivePickupCosmeticKey(
    visualSeed,
    rowY,
    terrainType,
    'type'
  );
  return key === null ? null : key % PICKUP_COSMETIC_CONFIG.typeBucketCount;
}

function getPickupType(visualSeed, rowY, terrainType) {
  const bucket = getPickupTypeBucket(visualSeed, rowY, terrainType);
  const pickupType = bucket === null ? null : PICKUP_TYPES[bucket];
  return isSupportedPickupType(pickupType) ? pickupType : null;
}

/**
 * Return the fixed playable candidate domain ranked by Pickup Key.
 */
function rankPickupPlacementCandidates(visualSeed, rowY, terrainType) {
  if (!Number.isInteger(rowY) || !isPickupTerrainType(terrainType)) {
    return Object.freeze([]);
  }

  const candidates = [];
  for (
    let x = PICKUP_COSMETIC_CONFIG.minX;
    x <= PICKUP_COSMETIC_CONFIG.maxX;
    x++
  ) {
    const priority = derivePickupCosmeticKey(
      visualSeed,
      rowY,
      terrainType,
      'candidatePriority',
      x
    );
    if (!isUnsignedVisualKey(priority)) {
      return Object.freeze([]);
    }
    candidates.push({ x, priority });
  }

  candidates.sort((left, right) =>
    left.priority - right.priority || left.x - right.x
  );
  return Object.freeze(candidates.map((candidate) => candidate.x));
}

/**
 * Build an occupied-cell set from finalized row-owned ground scenery. Every
 * valid decoration record occupies its one cell, including future scenery
 * types. Any unsafe record conservatively invalidates pickup placement.
 */
function collectOccupiedGroundScenery(row) {
  if (!row || typeof row !== 'object' || !Array.isArray(row.decorations)) {
    return null;
  }

  const occupied = new Set();
  for (const decoration of row.decorations) {
    if (
      !decoration ||
      typeof decoration !== 'object' ||
      Array.isArray(decoration) ||
      typeof decoration.type !== 'string' ||
      decoration.type.length === 0 ||
      !isPlayableCosmeticX(decoration.x) ||
      !Number.isInteger(decoration.y) ||
      decoration.y !== row.y
    ) {
      return null;
    }
    occupied.add(decoration.x);
  }
  return occupied;
}

/**
 * Select the first unoccupied cell from the fixed 31-candidate ranking. The
 * loop performs at most one check per playable cell and never retries.
 */
function selectPickupPlacement(row, visualSeed = 0) {
  if (
    !row ||
    typeof row !== 'object' ||
    !Number.isInteger(row.y) ||
    !isPickupTerrainType(row.type)
  ) {
    return null;
  }

  const occupied = collectOccupiedGroundScenery(row);
  if (occupied === null) {
    return null;
  }

  const candidates = rankPickupPlacementCandidates(
    visualSeed,
    row.y,
    row.type
  );
  if (candidates.length !== 31) {
    return null;
  }

  for (let index = 0; index < candidates.length; index++) {
    if (!occupied.has(candidates[index])) {
      return candidates[index];
    }
  }
  return null;
}

/**
 * Generate at most one immutable schema-version-2 Pickup Descriptor.
 */
function generatePickupDescriptor(row, visualSeed = 0) {
  if (
    !row ||
    typeof row !== 'object' ||
    !Number.isInteger(row.y) ||
    !isPickupTerrainType(row.type) ||
    !isPickupEligible(visualSeed, row.y, row.type)
  ) {
    return null;
  }

  const pickupType = getPickupType(visualSeed, row.y, row.type);
  const x = selectPickupPlacement(row, visualSeed);
  const variantKey = derivePickupCosmeticKey(
    visualSeed,
    row.y,
    row.type,
    'variant'
  );
  if (
    !isSupportedPickupType(pickupType) ||
    !isPlayableCosmeticX(x) ||
    !isUnsignedVisualKey(variantKey)
  ) {
    return null;
  }

  return Object.freeze({
    id: `pickup:${row.y}`,
    type: pickupType,
    x,
    y: row.y,
    terrainType: row.type,
    blocking: false,
    variant: variantKey % PICKUP_COSMETIC_CONFIG.variantCount,
    schemaVersion: PICKUP_COSMETIC_CONFIG.schemaVersion
  });
}

function isValidFrozenPickupDescriptor(row, descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor) ||
      !Object.isFrozen(descriptor)) {
    return false;
  }

  const descriptorFields = [
    'id',
    'type',
    'x',
    'y',
    'terrainType',
    'blocking',
    'variant',
    'schemaVersion'
  ];
  const keys = Object.keys(descriptor);
  if (
    keys.length !== descriptorFields.length ||
    descriptorFields.some((field) => keys.indexOf(field) < 0) ||
    descriptor.id !== `pickup:${row.y}` ||
    !isSupportedPickupType(descriptor.type) ||
    !isPlayableCosmeticX(descriptor.x) ||
    descriptor.y !== row.y ||
    descriptor.terrainType !== row.type ||
    descriptor.blocking !== false ||
    !Number.isInteger(descriptor.variant) ||
    descriptor.variant < 0 ||
    descriptor.variant >= PICKUP_COSMETIC_CONFIG.variantCount ||
    descriptor.schemaVersion !== PICKUP_COSMETIC_CONFIG.schemaVersion ||
    !isPickupTerrainType(row.type)
  ) {
    return false;
  }

  const occupied = collectOccupiedGroundScenery(row);
  return occupied !== null && !occupied.has(descriptor.x);
}

function isValidPickupState(row, pickupState) {
  if (
    !pickupState ||
    typeof pickupState !== 'object' ||
    Array.isArray(pickupState) ||
    Object.keys(pickupState).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(pickupState, 'descriptor') ||
    !Object.prototype.hasOwnProperty.call(pickupState, 'consumed') ||
    typeof pickupState.consumed !== 'boolean'
  ) {
    return false;
  }

  if (pickupState.descriptor === null) {
    return pickupState.consumed === false;
  }
  return isValidFrozenPickupDescriptor(row, pickupState.descriptor);
}

/**
 * Create a fresh initial Pickup State. The descriptor is immutable while the
 * consumed flag deliberately remains mutable for the retained row lifecycle.
 */
function createPickupState(row, visualSeed = 0) {
  return {
    descriptor: generatePickupDescriptor(row, visualSeed),
    consumed: false
  };
}

/**
 * Attach initial row-owned Pickup State without replacing any valid existing
 * lifecycle, including a consumed one. Malformed external rows fail safely.
 */
function attachRowPickupState(row, visualSeed = 0) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  if (isValidPickupState(row, row.cosmetics)) {
    return row;
  }

  const pickupState = createPickupState(row, visualSeed);
  try {
    row.cosmetics = pickupState;
  } catch (error) {
    // A frozen/malformed external row cannot be repaired safely.
  }
  return row;
}

// Backward-compatible helper names preserve guarded direct-load and staged
// caller resolution while returning the generalized four-type schema.
function isPokeBallTerrainType(terrainType) {
  return isPickupTerrainType(terrainType);
}

function derivePokeBallCosmeticKey(
  visualSeed,
  rowY,
  terrainType,
  channel,
  candidateX = 0
) {
  return derivePickupCosmeticKey(
    visualSeed,
    rowY,
    terrainType,
    channel,
    candidateX
  );
}

function getPokeBallEligibilityBucket(visualSeed, rowY, terrainType) {
  return getPickupEligibilityBucket(visualSeed, rowY, terrainType);
}

function isPokeBallEligible(visualSeed, rowY, terrainType) {
  return isPickupEligible(visualSeed, rowY, terrainType);
}

function rankPokeBallPlacementCandidates(visualSeed, rowY, terrainType) {
  return rankPickupPlacementCandidates(visualSeed, rowY, terrainType);
}

function selectPokeBallPlacement(row, visualSeed = 0) {
  return selectPickupPlacement(row, visualSeed);
}

function generatePokeBallDescriptor(row, visualSeed = 0) {
  return generatePickupDescriptor(row, visualSeed);
}

function isValidFrozenPokeBallDescriptor(row, descriptor) {
  return isValidFrozenPickupDescriptor(row, descriptor);
}

function isValidFrozenRowCosmetics(row, cosmetics) {
  return isValidPickupState(row, cosmetics);
}

function createRowCosmetics(row, visualSeed = 0) {
  return createPickupState(row, visualSeed);
}

function attachRowCosmetics(row, visualSeed = 0) {
  return attachRowPickupState(row, visualSeed);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    INITIAL_SPEED_RANGES,
    PICKUP_COSMETIC_CONFIG,
    PICKUP_TYPES,
    POKE_BALL_COSMETIC_CONFIG,
    SCORE_SPEED_CONFIG,
    TERRAIN_SELECTION_CONFIG,
    TRAIN_TRACK_CONFIG,
    attachRowCosmetics,
    attachRowPickupState,
    buildRiverRoutePlan,
    calculateScoreScaledSpeed,
    calculateSpeedTier,
    createEntityVisual,
    createPickupState,
    createRowCosmetics,
    derivePickupCosmeticKey,
    derivePokeBallCosmeticKey,
    findInSpanCrossingRoute,
    generateClouds,
    generateGrass,
    generateGrassDecorations,
    generatePickupDescriptor,
    generatePokeBallDescriptor,
    generateRiver,
    generateRiverGroup,
    generateRoad,
    generateTrainTrack,
    getPickupEligibilityBucket,
    getPickupType,
    getPickupTypeBucket,
    getPlatformSupportInterval,
    getPokeBallEligibilityBucket,
    getRiverRouteAnchor,
    getTerrainSequenceContext,
    hasInSpanCrossingRoute,
    isPickupEligible,
    isPokeBallEligible,
    isSupportedPickupType,
    isValidFrozenPickupDescriptor,
    isValidPickupState,
    rankPickupPlacementCandidates,
    rankPokeBallPlacementCandidates,
    selectNextTerrain,
    selectPickupPlacement,
    selectPokeBallPlacement,
    updateTrainTrackLifecycle,
    validateGrassRoute,
    visualHash,
    visualUnit,
    weightedRandom
  };
}
