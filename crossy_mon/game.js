// Main game orchestrator
// Initializes all systems, manages game state, and runs the main game loop

// Keep simulation steps small enough that suspended tabs cannot consume a
// complete train warning/pass between renders. The retained terrain window
// allows reasonable backward travel while preserving ample sequence context.
const GAMEPLAY_CONFIG = Object.freeze({
  maxFrameDelta: 100,
  rowsBehind: 20,
  rowsAhead: 15,
  maxRetainedRows: 36
});
const STAGE2_WORKLOAD_CONFIG = Object.freeze({
  maxGroundDecorationsPerRow: 10,
  maxBlockingPropsPerRow: 6,
  maxCloudsPerFrame: 5,
  cullMarginPixels: 128
});
const DEFAULT_VISUAL_SEED = 'crossy-road-stage-2';

/**
 * Game class
 * Orchestrates the game loop, manages state transitions, and coordinates all game systems
 */
class Game {
  constructor(options = {}) {
    this.random = typeof options.random === 'function' ? options.random : Math.random;
    this.visualSeed = Object.prototype.hasOwnProperty.call(options, 'visualSeed')
      ? options.visualSeed : DEFAULT_VISUAL_SEED;
    this.clouds = generateClouds(this.visualSeed);
    this.visualTime = 0;

    // Initialize game state
    this.gameState = {
      state: 'PLAYING',      // 'PLAYING' | 'GAME_OVER'
      score: 0,              // maximum Y coordinate reached
      maxYReached: 0,        // tracks highest Y for scoring
      lastFrameTime: 0       // for delta time calculation
    };
    
    // Get canvas element
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      throw new Error('Canvas element not found');
    }
    
    // Initialize core game systems
    this.renderer = new Renderer(canvas);
    this.player = new Player(0, 0); // Initialize player at origin

    // Initialize World before Input so movement admission can query it.
    this.world = new World();
    this.inputSystem = new Input(this.player, this.gameState, {
      canEnter: (x, y) => !this.world.isBlockedAt(x, y)
    });
    
    // Generate initial grass terrain (15-20 rows)
    this.generateInitialTerrain();
    
    // Placeholder references for remaining systems (to be initialized later)
    this.collisionSystem = null;
    this.generator = null;
    
    // Bind game loop to maintain 'this' context
    this.gameLoop = this.gameLoop.bind(this);
  }
  
  /**
   * Generate the initial terrain around the spawn point.
   * Rows behind and immediately ahead of spawn are always safe grass.
   */
  generateInitialTerrain() {
    const STARTING_Y = -5;
    const NUM_INITIAL_ROWS = 20;

    for (let y = STARTING_Y; y < STARTING_Y + NUM_INITIAL_ROWS; y++) {
      this.world.addTerrainRow(this.createTerrainRow(y));
    }
  }

  /**
   * Create a terrain row for a world Y coordinate.
   * Positive Y is forward; the spawn area through Y=2 stays hazard-free.
   * @param {number} y - World row coordinate
   * @returns {Object} A terrain row
   */
  createTerrainRow(y) {
    let terrainRow;

    if (y <= 2) {
      terrainRow = generateGrass(y, this.visualSeed, this.world.terrainRows);
    } else {
      const context = getTerrainSequenceContext(this.world.terrainRows, y);
      const terrainType = selectNextTerrain(
        context.previousTerrain,
        context.consecutiveCount,
        this.random,
        context.consecutiveHazardCount,
        context.followingRiverCount,
        context.followingHazardCount
      );
      const spawnScore = this.gameState &&
        Number.isInteger(this.gameState.score) &&
        this.gameState.score >= 0
        ? this.gameState.score : 0;

      switch (terrainType) {
        case 'ROAD':
          terrainRow = generateRoad(y, spawnScore, this.random);
          break;
        case 'RIVER':
          terrainRow = generateRiver(y, spawnScore, this.random);
          break;
        case 'TRAIN_TRACK':
          terrainRow = generateTrainTrack(y, this.random);
          break;
        default:
          terrainRow = generateGrass(y, this.visualSeed, this.world.terrainRows);
      }
    }

    return this.attachStage2RowData(terrainRow);
  }

  /**
   * Attach coordinate-derived rendering data and one row-owned Pickup State
   * while a row is being created. This method does not call the gameplay
   * random source and is never used by update or render, so retained pickup
   * identity, location, and consumed status cannot be rerolled by frame work.
   * @param {Object} terrainRow - Newly generated terrain row
   * @returns {Object} The same row with additive visual and pickup data
   */
  attachStage2RowData(terrainRow) {
    if (!terrainRow || typeof terrainRow !== 'object') {
      return terrainRow;
    }

    if (!Array.isArray(terrainRow.decorations)) {
      terrainRow.decorations = Object.freeze([]);
    }

    const obstacles = Array.isArray(terrainRow.obstacles)
      ? terrainRow.obstacles : [];
    obstacles.forEach((obstacle, ordinal) => {
      if (obstacle && (obstacle.type === 'CAR' || obstacle.type === 'TRAIN')) {
        const eventIndex = obstacle.type === 'TRAIN' && terrainRow.metadata &&
          Number.isInteger(terrainRow.metadata.completedEvents)
          ? terrainRow.metadata.completedEvents : 0;
        obstacle.visual = createEntityVisual(
          this.visualSeed,
          terrainRow.y,
          obstacle.type,
          ordinal,
          eventIndex
        );
      }
    });

    const platforms = Array.isArray(terrainRow.platforms)
      ? terrainRow.platforms : [];
    platforms.forEach((platform, ordinal) => {
      if (platform && (platform.type === 'LOG' || platform.type === 'LILY_PAD')) {
        platform.visual = createEntityVisual(
          this.visualSeed,
          terrainRow.y,
          platform.type,
          ordinal
        );
      }
    });

    // A pre-existing property belongs to an already-started or historical row
    // lifecycle. Valid state (including consumed state) remains untouched;
    // malformed or legacy containers are conservatively left non-collectible
    // instead of being replaced with a newly generated outcome.
    if (Object.prototype.hasOwnProperty.call(terrainRow, 'cosmetics')) {
      return terrainRow;
    }

    // Initial Pickup State is derived only once, after gameplay entities and
    // row-owned scenery are final, and is retained with this Terrain Row.
    return attachRowPickupState(terrainRow, this.visualSeed);
  }

  /**
   * Keep terrain available around the player's current row.
   * @param {number} playerY - Current player world Y coordinate
   */
  ensureTerrainAroundPlayer(playerY) {
    const centerY = Math.floor(playerY);

    for (
      let y = centerY - GAMEPLAY_CONFIG.rowsBehind;
      y <= centerY + GAMEPLAY_CONFIG.rowsAhead;
      y++
    ) {
      if (!this.world.terrainRows.has(y)) {
        this.world.addTerrainRow(this.createTerrainRow(y));
      }
    }
  }

  /**
   * Retire rows outside the movement/rendering window. Generation runs first,
   * leaving one continuous [player - 20, player + 15] retained buffer even
   * when the player reverses direction for an extended distance.
   * @param {number} playerY - Current player world Y coordinate
   */
  cleanupOldTerrain(playerY) {
    const centerY = Math.floor(playerY);
    const minimumRetainedY = centerY - GAMEPLAY_CONFIG.rowsBehind;
    const maximumRetainedY = centerY + GAMEPLAY_CONFIG.rowsAhead;

    for (const rowY of Array.from(this.world.terrainRows.keys())) {
      if (rowY < minimumRetainedY || rowY > maximumRetainedY) {
        // Row-owned decoration and Pickup State have no independent store:
        // deleting their Terrain Row retires the complete lifecycle through
        // World.removeTerrainRow() without a secondary cleanup registry.
        this.world.removeTerrainRow(rowY);
      }
    }

    // The normal integer retained window is exactly 36 rows. Keep a defensive
    // hard ceiling as well so malformed/external rows cannot grow World past
    // the Stage 2 workload bound. Farthest rows are retired first.
    if (this.world.terrainRows.size > GAMEPLAY_CONFIG.maxRetainedRows) {
      const rowsByRetirementPriority = Array.from(this.world.terrainRows.keys())
        .sort((left, right) => {
          const distanceDifference = Math.abs(right - centerY) -
            Math.abs(left - centerY);
          return distanceDifference || right - left;
        });

      while (
        this.world.terrainRows.size > GAMEPLAY_CONFIG.maxRetainedRows &&
        rowsByRetirementPriority.length > 0
      ) {
        this.world.removeTerrainRow(rowsByRetirementPriority.shift());
      }
    }
  }
  
  /**
   * Initialize the game and start the game loop
   */
  start() {
    // Initialize lastFrameTime to current time
    this.gameState.lastFrameTime = performance.now();
    
    // Start the game loop
    requestAnimationFrame(this.gameLoop);
  }
  
  /**
   * Main game loop using requestAnimationFrame
   * Calculates delta time, updates game state, and renders
   */
  gameLoop(currentTime) {
    // Clamp wall-clock catch-up after suspension. At 100ms, the three-second
    // train warning receives at least 30 rendered updates, and even the fastest
    // train cannot cross the visible world in one simulation step.
    const elapsedTime = currentTime - this.gameState.lastFrameTime;
    const deltaTime = Number.isFinite(elapsedTime)
      ? Math.min(Math.max(elapsedTime, 0), GAMEPLAY_CONFIG.maxFrameDelta)
      : 0;
    this.gameState.lastFrameTime = currentTime;
    
    // Update game state only when playing
    if (this.gameState.state === 'PLAYING') {
      this.update(deltaTime);
    }

    // Background motion is visual-only and cannot alter simulation ordering.
    this.visualTime += deltaTime;

    // Always render, regardless of game state
    this.render();
    
    // Continue the loop
    requestAnimationFrame(this.gameLoop);
  }
  
  /**
   * Update game logic
   * @param {number} deltaTime - Time elapsed since last frame in milliseconds
   */
  update(deltaTime) {
    // Remember whether this frame began in a jump. A jump that completes this
    // frame should resolve its destination, not receive a full frame of carry.
    const wasAnimating = this.player ? this.player.isAnimating() : false;
    if (this.player) {
      this.player.update(deltaTime);
    }

    // Carry only players that remained stationary for this whole frame. This
    // runs before platform movement so the Player and its exact supporting
    // Platform receive one identical non-wrapping displacement.
    const wasStationaryForEntireFrame = !wasAnimating &&
      this.player && !this.player.isAnimating();
    let ridingCollision = 'SAFE';
    if (wasStationaryForEntireFrame) {
      // Reconcile the occupied River row before carry so the Player and its
      // support use the same row-owned speed even if an entity was modified.
      // Support selection remains purely geometric; River-route planning data
      // is never consulted by the runtime movement path.
      this.enforceRowOwnedVelocity(
        this.world ? this.world.getTerrainAt(this.player.x, this.player.y) : null
      );
      ridingCollision = updatePlatformRiding(this.player, this.world, deltaTime);
    }

    // Update moving entities (obstacles, platforms) exactly once.
    this.updateMovingEntities(deltaTime);

    if (ridingCollision !== 'SAFE') {
      this.handleCollision(ridingCollision);
    } else if (!this.player.isAnimating()) {
      // Stationary players are checked every frame; active jumps are checked
      // only when they land so the departure platform cannot kill them mid-air.
      this.checkCollisionAndHandleGameOver();
    }

    // Preserve positive-Y score and keep a bounded, continuous world window.
    this.updateScore();
    this.ensureTerrainAroundPlayer(this.player.y);
    this.cleanupOldTerrain(this.player.y);
  }
  
  /**
   * Check for collisions and handle game over transition
   */
  checkCollisionAndHandleGameOver() {
    this.handleCollision(checkCollisions(this.player, this.world));
  }

  /**
   * Apply a collision result to game state.
   * @param {string} collisionResult - Collision system result
   */
  handleCollision(collisionResult) {
    if (collisionResult !== 'SAFE' && this.gameState.state === 'PLAYING') {
      this.gameState.state = 'GAME_OVER';
      console.log(`Game Over! Collision type: ${collisionResult}, Final score: ${this.gameState.score}`);
    }
  }
  
  /**
   * Update score based on player's forward progress
   * Score increases only when player reaches new maximum Y coordinate
   */
  updateScore() {
    if (this.player.y > this.gameState.maxYReached) {
      const increase = this.player.y - this.gameState.maxYReached;
      this.gameState.score += increase;
      this.gameState.maxYReached = this.player.y;
    }
    // Backward, sideways, and previously reached rows preserve the score.
  }
  
  /**
   * Enforce canonical row-owned movement for Cars and Platforms. Historical
   * fixtures without complete locked metadata retain only finite velocities;
   * malformed legacy velocities become stationary instead of propagating NaN.
   * @param {Object|null} terrainRow - Road or River row to reconcile
   */
  enforceRowOwnedVelocity(terrainRow) {
    if (!terrainRow || (terrainRow.type !== 'ROAD' && terrainRow.type !== 'RIVER')) {
      return;
    }

    const metadata = terrainRow.metadata || {};
    const hasLockedSpeed = Number.isFinite(metadata.lockedRowSpeed) &&
      metadata.lockedRowSpeed >= 0;
    const hasDirection = metadata.direction === -1 || metadata.direction === 1;
    const rowVelocity = hasLockedSpeed && hasDirection
      ? metadata.direction * metadata.lockedRowSpeed : null;
    const entities = terrainRow.type === 'ROAD'
      ? terrainRow.obstacles : terrainRow.platforms;

    if (!Array.isArray(entities)) {
      return;
    }

    for (const entity of entities) {
      if (!entity || typeof entity !== 'object') {
        continue;
      }
      if (rowVelocity !== null) {
        entity.velocity = rowVelocity;
      } else if (!Number.isFinite(entity.velocity)) {
        entity.velocity = 0;
      }
    }
  }

  /**
   * Update positions of all moving obstacles and platforms
   * @param {number} deltaTime - Time elapsed since last frame in milliseconds
   */
  updateMovingEntities(deltaTime) {
    if (!this.world) {
      return;
    }
    
    // Iterate through all terrain rows. Track rows own an independent event
    // lifecycle, so their trains pass once and are removed instead of wrapping.
    for (const terrainRow of this.world.terrainRows.values()) {
      if (terrainRow.type === 'TRAIN_TRACK') {
        updateTrainTrackLifecycle(
          terrainRow,
          deltaTime,
          this.random,
          this.visualSeed
        );
        continue;
      }

      this.enforceRowOwnedVelocity(terrainRow);

      for (const obstacle of terrainRow.obstacles) {
        obstacle.x = calculateEntityMovement(obstacle, deltaTime).x;
      }

      for (const platform of terrainRow.platforms) {
        platform.x = calculateEntityMovement(platform, deltaTime).x;
      }
    }
  }
  
  /**
   * Render the current game state
   */
  render() {
    if (!this.renderer || !this.player) {
      return;
    }

    this.renderer.clear();

    // The gameplay camera is horizontally anchored to world x = 0 while
    // retaining interpolated vertical following and the existing ahead bias.
    // Player x remains render data for the shadow and chicken below.
    const playerPos = this.player.getCurrentPosition();
    this.renderer.centerCameraOnPlayer(0, playerPos.y);

    this.renderer.renderFramePhases({
      clouds: () => this.renderClouds(),
      terrain: () => this.renderTerrain(),
      lowDecorations: () => this.renderLowDecorations(),
      depthSortedScene: () => this.renderObstaclesAndPlatforms(),
      sideOcclusion: () => this.renderSideShoulders(),
      player: () => {
        // The contact shadow remains on the lane while the rendering-only hop
        // arc raises the cuboid chicken. Logical coordinates are unchanged.
        this.renderer.drawGroundShadow(
          playerPos.x + 0.08,
          playerPos.y + 0.16,
          0.84,
          0.5
        );
        this.renderer.drawVoxelPikachu(
          playerPos.x,
          playerPos.y,
          this.player.getVisualState()
        );
      },
      ui: () => this.renderUI()
    });
  }

  /**
   * Draw render-only side shoulders over moving scene items and before the
   * Player. Only the retained row band and visual seed cross this boundary;
   * the Renderer already owns camera/Canvas state and consumes no gameplay RNG.
   * Rendering failures are isolated so restored shoulder scopes are followed
   * by the Player and UI phases.
   */
  renderSideShoulders() {
    const renderer = this.renderer;
    const terrainRows = this.world && this.world.terrainRows;
    if (!renderer || !(terrainRows instanceof Map)
      || typeof renderer.getSideOcclusionLayout !== 'function'
      || typeof renderer.drawSideShoulders !== 'function') {
      return null;
    }

    let rowMin = Infinity;
    let rowMax = -Infinity;
    for (const [rowCoordinate, terrainRow] of terrainRows.entries()) {
      const rowY = terrainRow && Number.isFinite(terrainRow.y)
        ? terrainRow.y : rowCoordinate;
      if (!Number.isFinite(rowY)) continue;
      rowMin = Math.min(rowMin, rowY);
      rowMax = Math.max(rowMax, rowY);
    }
    if (!Number.isFinite(rowMin) || !Number.isFinite(rowMax)) {
      return null;
    }

    try {
      const layout = renderer.getSideOcclusionLayout(
        rowMin,
        rowMax,
        this.visualSeed
      );
      return layout ? renderer.drawSideShoulders(layout) : null;
    } catch (error) {
      return null;
    }
  }
  
  /** Draw no more than the bounded immutable background descriptor set. */
  renderClouds() {
    const clouds = Array.isArray(this.clouds) ? this.clouds : [];
    for (
      let index = 0;
      index < clouds.length && index < STAGE2_WORKLOAD_CONFIG.maxCloudsPerFrame;
      index++
    ) {
      this.renderer.drawCloud(clouds[index], this.visualTime);
    }
  }

  /**
   * Return a render-only bounded view of one row's immutable decoration data.
   * The source array and records remain attached to their owning Terrain_Row.
   */
  getBoundedRowDecorations(terrainRow) {
    const rowDecorations = terrainRow && Array.isArray(terrainRow.decorations)
      ? terrainRow.decorations : [];
    const bounded = [];
    let groundCount = 0;
    let blockingCount = 0;

    for (const decoration of rowDecorations) {
      if (!decoration || typeof decoration !== 'object') {
        continue;
      }

      if (decoration.blocking === true) {
        if (blockingCount >= STAGE2_WORKLOAD_CONFIG.maxBlockingPropsPerRow) {
          continue;
        }
        blockingCount++;
        bounded.push(decoration);
      } else if (decoration.blocking === false) {
        if (groundCount >= STAGE2_WORKLOAD_CONFIG.maxGroundDecorationsPerRow) {
          continue;
        }
        groundCount++;
        bounded.push(decoration);
      }
    }

    return bounded;
  }

  /**
   * Check a projected Stage 2 model against Canvas bounds without touching its
   * gameplay or owning-row record.
   */
  isStage2ItemVisible(entity, width = 1, depth = 1, height = 1) {
    if (!entity || !this.renderer ||
        typeof this.renderer.isWorldFootprintVisible !== 'function') {
      return true;
    }

    return this.renderer.isWorldFootprintVisible(
      entity.x,
      entity.y,
      width,
      depth,
      {
        elevation: this.renderer.TERRAIN_HEIGHT,
        height,
        margin: STAGE2_WORKLOAD_CONFIG.cullMarginPixels
      }
    );
  }

  /** Draw only bounded, on-canvas collision-neutral grass decoration. */
  renderLowDecorations() {
    if (!this.world) {
      return;
    }

    const decorations = [];
    for (const terrainRow of this.world.terrainRows.values()) {
      for (const decoration of this.getBoundedRowDecorations(terrainRow)) {
        if (decoration.blocking === false &&
            this.isStage2ItemVisible(decoration, 1, 1, 0.8)) {
          decorations.push(decoration);
        }
      }
    }

    decorations.sort((a, b) => b.y - a.y || a.x - b.x);
    for (const decoration of decorations) {
      this.renderer.drawGrassDecoration(decoration);
    }
  }

  /**
   * Render UI elements (score and game over message)
   */
  renderUI() {
    const ctx = this.renderer.ctx;
    const canvas = this.renderer.canvas;
    
    // Display score at top of screen
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${this.gameState.score}`, 20, 40);
    
    // Display game over message if game is over
    if (this.gameState.state === 'GAME_OVER') {
      // Semi-transparent overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // "GAME OVER" message
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 72px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 50);
      
      // Final score
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px Arial';
      ctx.fillText(`Final Score: ${this.gameState.score}`, canvas.width / 2, canvas.height / 2 + 20);
      
      // Instruction to refresh
      ctx.font = '24px Arial';
      ctx.fillText('Refresh page to play again', canvas.width / 2, canvas.height / 2 + 70);
    }
  }
  
  /**
   * Render all visible terrain rows
   */
  renderTerrain() {
    if (!this.world) {
      return;
    }
    
    // Positive world Y is drawn toward the top, so larger rows render first.
    const terrainEntries = Array.from(this.world.terrainRows.entries());
    terrainEntries.sort((a, b) => b[0] - a[0]);
    
    // Render each terrain row
    for (const [y, terrainRow] of terrainEntries) {
      this.renderTerrainRow(terrainRow);
    }
  }
  
  /**
   * Render a single terrain row
   * @param {Object} terrainRow - TerrainRow object
   */
  renderTerrainRow(terrainRow) {
    // The playable lane is fixed to the same [-15, 16) world span as the
    // central opening. Lateral Player movement must not move Terrain or track
    // details now that the gameplay camera is horizontally world-anchored.
    const startX = -15;
    const laneWidth = 31;

    this.renderer.drawTerrainSlab(
      terrainRow.type,
      startX,
      terrainRow.y,
      laneWidth
    );

    if (terrainRow.type === 'TRAIN_TRACK') {
      this.renderer.drawTrainTrackDetails(startX, terrainRow.y, laneWidth);
      const signalX = startX + 1;
      this.renderer.drawWarningSignal(
        signalX,
        terrainRow.y,
        terrainRow.metadata.warningLightOn === true
      );
    }
  }
  
  /**
   * Read one row-owned Pickup State without repairing, regenerating, or
   * migrating it. Historical, legacy, and malformed containers are treated as
   * absent so update/render callers cannot accidentally start a new lifecycle.
   * The original mutable state object is returned to preserve consumed status.
   * @param {Object} terrainRow - Owning Terrain Row
   * @returns {Object|null} The original valid Pickup State, or null
   */
  getValidPickupState(terrainRow) {
    try {
      if (!terrainRow || typeof terrainRow !== 'object' || Array.isArray(terrainRow)
        || !Object.prototype.hasOwnProperty.call(terrainRow, 'cosmetics')
        || typeof isValidPickupState !== 'function') {
        return null;
      }

      const pickupState = terrainRow.cosmetics;
      return isValidPickupState(terrainRow, pickupState)
        ? pickupState : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Read one row-owned Poké Ball only when its complete descriptor and every
   * ground-scenery occupancy record are safe to interpret. Historical rows
   * without cosmetic state remain untouched and simply produce no scene item.
   * @param {Object} terrainRow - Owning Terrain Row
   * @returns {Object|null} The original valid descriptor, or null
   */
  getValidPokeBallDescriptor(terrainRow) {
    try {
      if (!terrainRow || typeof terrainRow !== 'object' || Array.isArray(terrainRow)
        || !Object.prototype.hasOwnProperty.call(terrainRow, 'cosmetics')) {
        return null;
      }

      const cosmetics = terrainRow.cosmetics;
      if (!cosmetics || typeof cosmetics !== 'object' || Array.isArray(cosmetics)
        || !Object.prototype.hasOwnProperty.call(cosmetics, 'pokeBall')
        || cosmetics.pokeBall === null
        || !this.renderer
        || typeof this.renderer.validatePokeBallDescriptor !== 'function') {
        return null;
      }

      const descriptor = cosmetics.pokeBall;
      if (this.renderer.validatePokeBallDescriptor(descriptor, terrainRow) !== descriptor
        || !Array.isArray(terrainRow.decorations)) {
        return null;
      }

      for (const decoration of terrainRow.decorations) {
        if (!decoration || typeof decoration !== 'object' || Array.isArray(decoration)
          || typeof decoration.type !== 'string' || decoration.type.length === 0
          || !Number.isInteger(decoration.x)
          || decoration.x < -15 || decoration.x > 15
          || !Number.isInteger(decoration.y) || decoration.y !== terrainRow.y
          || (decoration.blocking !== true && decoration.blocking !== false)) {
          return null;
        }
        if (decoration.x === descriptor.x) {
          return null;
        }
      }

      return descriptor;
    } catch (error) {
      return null;
    }
  }

  /**
   * Render moving entities, Blocking_Props, and row cosmetics in one stable
   * depth order without exposing cosmetics to any gameplay path.
   */
  renderObstaclesAndPlatforms() {
    if (!this.world) {
      return;
    }

    const sceneItems = [];

    for (const terrainRow of this.world.terrainRows.values()) {
      for (const obstacle of terrainRow.obstacles) {
        const obstacleWidth = Number.isFinite(obstacle.width)
          ? obstacle.width : 1;
        if (!this.isStage2ItemVisible(obstacle, obstacleWidth, 0.9, 1.4)) {
          continue;
        }
        sceneItems.push({
          type: 'obstacle',
          entity: obstacle,
          y: obstacle.y,
          x: obstacle.x
        });
      }

      for (const platform of terrainRow.platforms) {
        const platformWidth = Number.isFinite(platform.width)
          ? platform.width : 1;
        if (!this.isStage2ItemVisible(platform, platformWidth, 0.9, 0.8)) {
          continue;
        }
        sceneItems.push({
          type: 'platform',
          entity: platform,
          y: platform.y,
          x: platform.x
        });
      }

      for (const decoration of this.getBoundedRowDecorations(terrainRow)) {
        if (decoration.blocking === true &&
            this.isStage2ItemVisible(decoration, 1, 1, 2.6)) {
          sceneItems.push({
            type: 'blockingProp',
            entity: decoration,
            y: decoration.y,
            x: decoration.x
          });
        }
      }

      const pokeBall = this.getValidPokeBallDescriptor(terrainRow);
      if (pokeBall && this.isStage2ItemVisible(pokeBall, 1, 1, 0.8)) {
        sceneItems.push({
          type: 'groundCosmetic',
          entity: pokeBall,
          ownerRow: terrainRow,
          y: pokeBall.y,
          x: pokeBall.x
        });
      }
    }

    // Preserve the established blocker/obstacle/platform tie order while
    // placing a same-cell ground cosmetic beneath moving scene entities.
    const sceneTypeOrder = {
      blockingProp: 0,
      groundCosmetic: 1,
      obstacle: 2,
      platform: 3
    };
    sceneItems.sort((a, b) =>
      b.y - a.y || a.x - b.x ||
      sceneTypeOrder[a.type] - sceneTypeOrder[b.type]
    );

    for (const item of sceneItems) {
      if (item.type === 'obstacle') {
        this.renderObstacle(item.entity);
      } else if (item.type === 'platform') {
        this.renderPlatform(item.entity);
      } else if (item.type === 'groundCosmetic') {
        this.renderer.drawVoxelPokeBall(item.entity, item.ownerRow);
      } else {
        this.renderer.drawBlockingProp(item.entity);
      }
    }
  }
  
  /**
   * Render a single obstacle (car or train)
   * @param {Object} obstacle - Obstacle object
   */
  renderObstacle(obstacle) {
    if (obstacle.type === 'CAR') {
      this.renderer.drawVoxelCar(obstacle);
      return;
    }

    if (obstacle.type === 'TRAIN') {
      this.renderer.drawVoxelTrain(obstacle);
      return;
    }

    // Preserve a safe legacy fallback for unknown historical obstacle records.
    this.renderer.drawGroundShadow(obstacle.x, obstacle.y, obstacle.width, 0.48);
    this.renderer.drawEntity(
      obstacle.x,
      obstacle.y,
      obstacle.width,
      '#FF0000',
      0.5
    );
  }
  
  /**
   * Render a single platform (log or lily pad)
   * @param {Object} platform - Platform object
   */
  renderPlatform(platform) {
    if (platform.type === 'LOG') {
      this.renderer.drawVoxelLog(platform);
      return;
    }

    if (platform.type === 'LILY_PAD') {
      this.renderer.drawVoxelLilyPad(platform);
      return;
    }

    // Preserve a safe legacy fallback for unknown historical Platform records.
    this.renderer.drawGroundShadow(platform.x, platform.y, platform.width, 0.46);
    this.renderer.drawEntity(
      platform.x,
      platform.y,
      platform.width,
      '#228B22',
      0.5
    );
  }
  
  /**
   * Draw a reference grid (temporary helper for development)
   */
  drawGrid() {
    const gridSize = 10;
    for (let y = -gridSize; y <= gridSize; y++) {
      for (let x = -gridSize; x <= gridSize; x++) {
        // Alternate colors for checkerboard pattern
        const color = (x + y) % 2 === 0 ? '#e8e8e8' : '#d0d0d0';
        this.renderer.drawTile(x, y, color);
      }
    }
    
    // Draw origin (0, 0) in light green
    this.renderer.drawTile(0, 0, '#90EE90');
  }
}

// Export for use in other modules
Game.GAMEPLAY_CONFIG = GAMEPLAY_CONFIG;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Game;
}

// Initialize and start the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.start();
  
  console.log('Game initialized and started');
});
