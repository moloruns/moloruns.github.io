// Renderer module
// Canvas 2D isometric rendering helpers and Stage 1 voxel visual system

/**
 * Renderer class for drawing the game in isometric projection.
 */
const PICKUP_PIXEL_ART_CONFIG = Object.freeze({
  schemaVersion: 2,
  minX: -15,
  maxX: 15,
  variantCount: 3,
  gridWidth: 10,
  gridHeight: 10,
  pixelSize: 4,
  maxPixelOperations: 100,
  supportedTypes: Object.freeze([
    'POKE_BALL',
    'GREAT_BALL',
    'QUICK_BALL',
    'HEAVY_BALL'
  ]),
  eligibleTerrainTypes: Object.freeze(['GRASS', 'ROAD', 'TRAIN_TRACK']),
  terrainPalettes: Object.freeze({
    GRASS: Object.freeze({ outline: '#17251D', shadow: '#5B344F' }),
    ROAD: Object.freeze({ outline: '#FFE36A', shadow: '#171B24' }),
    TRAIN_TRACK: Object.freeze({ outline: '#DDF4FF', shadow: '#33243F' })
  }),
  typePalettes: Object.freeze({
    POKE_BALL: Object.freeze({
      A: '#EF3E3A', W: '#FFF9E9', K: '#171A21', B: '#F4F8FA', H: '#FF8C82'
    }),
    GREAT_BALL: Object.freeze({
      A: '#2877C7', R: '#E93D45', W: '#F7FBFF', K: '#152033', B: '#EAF4FA', H: '#65B8F1'
    }),
    QUICK_BALL: Object.freeze({
      A: '#2369AA', Y: '#FFD93D', W: '#F5FBFF', K: '#17233A', B: '#D9F2FF', H: '#63D6EA'
    }),
    HEAVY_BALL: Object.freeze({
      A: '#35455C', G: '#73839A', W: '#DDE5EC', K: '#17202C', B: '#F1F5F7', H: '#A8B5C4'
    })
  }),
  templates: Object.freeze({
    POKE_BALL: Object.freeze([
      '..OOOOOO..',
      '.OOHAAAOO.',
      '.OHAAAAAO.',
      'OAAAAAAAAO',
      'OKKKBBKKKO',
      'OKKKWWKKKO',
      'OWWWWWWWWO',
      '.OWWWWWWO.',
      '.OOSSSSOO.',
      '..OOOOOO..'
    ]),
    GREAT_BALL: Object.freeze([
      '..OOOOOO..',
      '.OOHRRROO.',
      '.ORAAAARO.',
      'ORRAAAARRO',
      'OKKKBBKKKO',
      'OKKKWWKKKO',
      'OWWWWWWWWO',
      '.OWWWWWWO.',
      '.OOSSSSOO.',
      '..OOOOOO..'
    ]),
    QUICK_BALL: Object.freeze([
      '..OOOOOO..',
      '.OOYHAAOO.',
      '.OAYYAAAO.',
      'OAAAYYAAAO',
      'OKKYBBYKKO',
      'OKKKWWKKKO',
      'OAAAAAAAAO',
      '.OAAAAAAO.',
      '.OOSSSSOO.',
      '..OOOOOO..'
    ]),
    HEAVY_BALL: Object.freeze([
      '..OOOOOO..',
      '.OOHGGGOO.',
      '.OGAAAAGO.',
      'OGGAAAAGGO',
      'OGKGBBGKGO',
      'OGKKWWKKGO',
      'OGAAAAAAGO',
      '.OGAAAAGO.',
      '.OOSSSSOO.',
      '..OOOOOO..'
    ])
  })
});

class Renderer {
  /** Return the fixed terrain treatment used to separate a pickup silhouette. */
  getPickupContrastPalette(terrainType) {
    return Object.prototype.hasOwnProperty.call(
      PICKUP_PIXEL_ART_CONFIG.terrainPalettes,
      terrainType
    ) ? PICKUP_PIXEL_ART_CONFIG.terrainPalettes[terrainType] : null;
  }

  /** Backward-compatible palette selector name for guarded legacy callers. */
  getPokeBallContrastPalette(terrainType) {
    return this.getPickupContrastPalette(terrainType);
  }

  /** Return one immutable, bounded pixel template for a supported pickup type. */
  getPickupPixelTemplate(type) {
    return Object.prototype.hasOwnProperty.call(
      PICKUP_PIXEL_ART_CONFIG.templates,
      type
    ) ? PICKUP_PIXEL_ART_CONFIG.templates[type] : null;
  }

  /**
   * Validate the complete generalized descriptor schema and optional owner row.
   * Validation is deliberately read-only and never repairs malformed values.
   */
  validatePickupDescriptor(descriptor, ownerRow) {
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
      return null;
    }

    const fields = [
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
    if (keys.length !== fields.length
      || fields.some(field => keys.indexOf(field) < 0)
      || descriptor.schemaVersion !== PICKUP_PIXEL_ART_CONFIG.schemaVersion
      || PICKUP_PIXEL_ART_CONFIG.supportedTypes.indexOf(descriptor.type) < 0
      || descriptor.blocking !== false
      || !Number.isInteger(descriptor.x)
      || descriptor.x < PICKUP_PIXEL_ART_CONFIG.minX
      || descriptor.x > PICKUP_PIXEL_ART_CONFIG.maxX
      || !Number.isInteger(descriptor.y)
      || descriptor.id !== `pickup:${descriptor.y}`
      || !Number.isInteger(descriptor.variant)
      || descriptor.variant < 0
      || descriptor.variant >= PICKUP_PIXEL_ART_CONFIG.variantCount
      || PICKUP_PIXEL_ART_CONFIG.eligibleTerrainTypes.indexOf(
        descriptor.terrainType
      ) < 0) {
      return null;
    }

    if (ownerRow !== undefined) {
      if (!ownerRow || typeof ownerRow !== 'object' || Array.isArray(ownerRow)
        || !Number.isInteger(ownerRow.y)
        || PICKUP_PIXEL_ART_CONFIG.eligibleTerrainTypes.indexOf(ownerRow.type) < 0
        || descriptor.y !== ownerRow.y
        || descriptor.terrainType !== ownerRow.type) {
        return null;
      }
    }

    return descriptor;
  }

  /** Backward-compatible validator name used by current guarded scene code. */
  validatePokeBallDescriptor(descriptor, ownerRow) {
    return this.validatePickupDescriptor(descriptor, ownerRow);
  }

  /**
   * Resolve a validated descriptor to immutable, screen-grid pixel operations.
   * The static 10x10 template and hard operation cap prevent unbounded drawing.
   */
  buildPickupPixelOperations(descriptor, ownerRow) {
    const validDescriptor = this.validatePickupDescriptor(descriptor, ownerRow);
    if (!validDescriptor) return Object.freeze([]);

    const template = this.getPickupPixelTemplate(validDescriptor.type);
    const terrainPalette = this.getPickupContrastPalette(
      validDescriptor.terrainType
    );
    const typePalette = PICKUP_PIXEL_ART_CONFIG.typePalettes[
      validDescriptor.type
    ];
    if (!Array.isArray(template)
      || template.length !== PICKUP_PIXEL_ART_CONFIG.gridHeight
      || !terrainPalette || !typePalette) return Object.freeze([]);

    const operations = [];
    for (let row = 0; row < template.length; row++) {
      const templateRow = template[row];
      if (typeof templateRow !== 'string'
        || templateRow.length !== PICKUP_PIXEL_ART_CONFIG.gridWidth) {
        return Object.freeze([]);
      }

      for (let column = 0; column < templateRow.length; column++) {
        const token = templateRow.charAt(column);
        if (token === '.') continue;
        const color = token === 'O'
          ? terrainPalette.outline
          : token === 'S'
            ? terrainPalette.shadow
            : typePalette[token];
        if (typeof color !== 'string' || color.length === 0) {
          return Object.freeze([]);
        }

        let pixelColumn = column;
        let pixelRow = row;
        if (token === 'H' && validDescriptor.variant === 1) pixelColumn++;
        if (token === 'H' && validDescriptor.variant === 2) pixelRow++;
        if (pixelColumn < 0 || pixelColumn >= PICKUP_PIXEL_ART_CONFIG.gridWidth
          || pixelRow < 0 || pixelRow >= PICKUP_PIXEL_ART_CONFIG.gridHeight) {
          return Object.freeze([]);
        }

        operations.push(Object.freeze({
          column: pixelColumn,
          row: pixelRow,
          color
        }));
        if (operations.length > PICKUP_PIXEL_ART_CONFIG.maxPixelOperations) {
          return Object.freeze([]);
        }
      }
    }

    return Object.freeze(operations);
  }

  /**
   * Draw one fixed-size camera-facing image at the center of its one-cell world
   * footprint. Only Canvas 2D rectangles are used; all context state is scoped.
   */
  drawPixelArtPickup(descriptor, ownerRow) {
    const validDescriptor = this.validatePickupDescriptor(descriptor, ownerRow);
    if (!validDescriptor) return 0;

    const operations = this.buildPickupPixelOperations(
      validDescriptor,
      ownerRow
    );
    const ctx = this.ctx;
    if (operations.length === 0
      || operations.length > PICKUP_PIXEL_ART_CONFIG.maxPixelOperations
      || !ctx
      || typeof ctx.save !== 'function'
      || typeof ctx.restore !== 'function'
      || typeof ctx.fillRect !== 'function') return 0;

    const projectedCenter = this.worldToIso(
      validDescriptor.x + 0.5,
      validDescriptor.y + 0.5
    );
    const canvasCenter = this.screenToCanvas(
      projectedCenter.screenX,
      projectedCenter.screenY
    );
    if (!Number.isFinite(canvasCenter.x) || !Number.isFinite(canvasCenter.y)) {
      return 0;
    }

    const pixelSize = PICKUP_PIXEL_ART_CONFIG.pixelSize;
    const imageWidth = PICKUP_PIXEL_ART_CONFIG.gridWidth * pixelSize;
    const imageHeight = PICKUP_PIXEL_ART_CONFIG.gridHeight * pixelSize;
    const originX = Math.round(canvasCenter.x - imageWidth / 2);
    const originY = Math.round(
      canvasCenter.y - this.TERRAIN_HEIGHT * this.TILE_HEIGHT - imageHeight - 4
    );
    let saved = false;
    let succeeded = false;

    try {
      ctx.save();
      saved = true;
      operations.forEach(operation => {
        ctx.fillStyle = operation.color;
        ctx.fillRect(
          originX + operation.column * pixelSize,
          originY + operation.row * pixelSize,
          pixelSize,
          pixelSize
        );
      });
      succeeded = true;
    } catch (error) {
      succeeded = false;
    } finally {
      if (saved) {
        try {
          ctx.restore();
        } catch (error) {
          succeeded = false;
        }
      }
    }

    return succeeded ? 1 : 0;
  }

  /**
   * Compatibility dispatch for the current guarded Game integration. Despite
   * the historical name, this path now draws only the flat pixel-art image.
   */
  drawVoxelPokeBall(descriptor, ownerRow) {
    return this.drawPixelArtPickup(descriptor, ownerRow);
  }

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.TILE_WIDTH = 64;
    this.TILE_HEIGHT = 32;
    this.TERRAIN_HEIGHT = 0.18;
    this.PLAYER_SCREEN_Y_RATIO = 0.62;
    this.cameraX = 0;
    this.cameraY = 0;
    this.RENDER_PHASE_ORDER = Object.freeze([
      'clouds',
      'terrain',
      'lowDecorations',
      'depthSortedScene',
      'sideOcclusion',
      'player',
      'ui'
    ]);

    // Every cuboid uses a deliberate three-tone palette. Keeping these colors
    // in the renderer makes the lighting direction consistent across terrain
    // and the procedural chicken without relying on CSS or image assets.
    this.PALETTES = {
      terrain: {
        GRASS: { top: '#7CFC00', left: '#55B800', right: '#3E9300' },
        ROAD: { top: '#404040', left: '#303238', right: '#24262B' },
        RIVER: { top: '#1E90FF', left: '#176DBF', right: '#10558F' },
        TRAIN_TRACK: { top: '#6B5B4D', left: '#514338', right: '#3E342C' },
        DEFAULT: { top: '#CCCCCC', left: '#999999', right: '#777777' }
      },
      chicken: {
        white: { top: '#FFF9E8', left: '#DED8C8', right: '#C3BDAE' },
        orange: { top: '#FFC83D', left: '#E59A22', right: '#C97818' },
        red: { top: '#EF5145', left: '#BD3832', right: '#922B29' },
        eye: { top: '#22282D', left: '#171B1F', right: '#0D1012' }
      },
      pikachu: {
        yellow: { top: '#F8D92F', left: '#D9AF1F', right: '#B98C16' },
        yellowHighlight: { top: '#FFE85A', left: '#E4BF35', right: '#C79A22' },
        yellowShadow: { top: '#D8B321', left: '#B58C17', right: '#936C10' },
        black: { top: '#292B30', left: '#181A1E', right: '#0D0F12' },
        red: { top: '#F04B43', left: '#C53332', right: '#972528' },
        brown: { top: '#8B542C', left: '#63391F', right: '#472819' },
        dark: { top: '#20242A', left: '#12161B', right: '#080B0E' }
      },
      // Named Stage 2 palettes keep model colors independent from terrain and
      // Player accents. Arrays are deterministic variant sets selected by the
      // immutable visual metadata added by the Generator.
      stage2: {
        DEFAULT: { top: '#A7B0BA', left: '#77838F', right: '#596570' },
        CAR_BODY: [
          { top: '#FF665E', left: '#D94743', right: '#AD3434' },
          { top: '#FFD84A', left: '#D4A82E', right: '#AA8122' },
          { top: '#39D5E8', left: '#239FAF', right: '#197885' },
          { top: '#8EE34F', left: '#62AE34', right: '#478427' },
          { top: '#E66CE3', left: '#AE4EAE', right: '#843A86' },
          { top: '#FF983D', left: '#CE6928', right: '#A44E1D' }
        ],
        TRAIN_BODY: { top: '#4D78C9', left: '#355895', right: '#263F70' },
        TRAIN_ACCENT: { top: '#F0B84B', left: '#BB8430', right: '#8D6022' },
        WINDOW: { top: '#8FD7E8', left: '#568FA3', right: '#3A697B' },
        WHEEL: { top: '#3C4650', left: '#283039', right: '#1A2026' },
        METAL: { top: '#CBD1D5', left: '#949DA4', right: '#6E777F' },
        LOG_BARK: { top: '#9B6338', left: '#704326', right: '#52311E' },
        LOG_END: { top: '#C58B55', left: '#95623B', right: '#70482D' },
        LILY_PAD: { top: '#56B95F', left: '#368B43', right: '#286B35' },
        SIGNAL_POST: { top: '#D5B33E', left: '#A18128', right: '#765E1D' },
        SIGNAL_HOUSING: { top: '#4A525A', left: '#30373E', right: '#20262C' },
        SIGNAL_LIT: { top: '#FF3B35', left: '#C52327', right: '#941B20' },
        FLOWER_STEM: { top: '#5AAE55', left: '#3D803C', right: '#2C612F' },
        FLOWER_BLOSSOM: [
          { top: '#F49BD2', left: '#C66DA4', right: '#984F7D' },
          { top: '#AA8CF1', left: '#7D66BC', right: '#5D4B90' },
          { top: '#F4E176', left: '#C1A94E', right: '#907D39' }
        ],
        GRASS_TUFT: { top: '#4EB44D', left: '#337F36', right: '#255F2B' },
        TREE_TRUNK: { top: '#8C603D', left: '#65432C', right: '#4B3223' },
        TREE_CANOPY: [
          { top: '#4BAE58', left: '#327F42', right: '#245F34' },
          { top: '#3C9861', left: '#286E48', right: '#1C5137' }
        ],
        ROCK: [
          { top: '#9AA2A8', left: '#70787E', right: '#545C62' },
          { top: '#A69686', left: '#796B60', right: '#594F49' }
        ],
        CLOUD: [
          { top: '#DCE8F2', left: '#B4C6D5', right: '#91A8BA' },
          { top: '#D2E2ED', left: '#A9BECE', right: '#879FB2' }
        ]
      }
    };

    // Side shoulders are visual-only and bounded beyond the exact logical
    // gameplay opening. The immutable limits cover all established moving-
    // entity wrap/reset positions without introducing World records.
    this.SIDE_OCCLUSION_CONFIG = Object.freeze({
      playableMinX: -15,
      playableMaxExclusiveX: 16,
      leftOuterX: -32,
      rightOuterX: 32,
      sceneryStrideRows: 3,
      maxSceneryPerSide: 12,
      maxVisibleRows: 64,
      clipRowPadding: 4,
      cullMarginPixels: 128
    });
  }

  /** Produce a deterministic unsigned value without consuming gameplay RNG. */
  getSideSceneryValue(visualSeed, side, row, channel = '') {
    const text = String(visualSeed) + '|' + side + '|' + row + '|' + channel;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Build one bounded, immutable render-only layout for both side corridors.
   * Scenery is derived from visual seed, side, and retained row coordinate;
   * no random source, Terrain Row, World, collision, or input state is used.
   */
  getSideOcclusionLayout(rowMin, rowMax, visualSeed = 0) {
    if (!Number.isFinite(rowMin) || !Number.isFinite(rowMax)) return null;

    const visibleRowMin = Math.floor(rowMin);
    const visibleRowMax = Math.ceil(rowMax);
    const config = this.SIDE_OCCLUSION_CONFIG;
    const visibleRowCount = visibleRowMax - visibleRowMin + 1;
    if (visibleRowCount <= 0 || visibleRowCount > config.maxVisibleRows) {
      return null;
    }

    const clipRowMin = visibleRowMin - config.clipRowPadding;
    const clipRowMax = visibleRowMax + config.clipRowPadding;
    const opening = Object.freeze({
      logicalMinX: config.playableMinX,
      logicalMaxExclusiveX: config.playableMaxExclusiveX
    });

    const buildSide = side => {
      const isLeft = side === 'LEFT';
      const logicalMinX = isLeft
        ? config.leftOuterX : config.playableMaxExclusiveX;
      const logicalMaxExclusiveX = isLeft
        ? config.playableMinX : config.rightOuterX;
      const cellCount = logicalMaxExclusiveX - logicalMinX;
      const firstSceneryRow = Math.ceil(
        visibleRowMin / config.sceneryStrideRows
      ) * config.sceneryStrideRows;
      const typeOffset = this.getSideSceneryValue(
        visualSeed,
        side,
        0,
        'type-order'
      ) % 2;
      const scenery = [];

      for (let row = firstSceneryRow;
        row <= visibleRowMax && scenery.length < config.maxSceneryPerSide;
        row += config.sceneryStrideRows) {
        const rowOrdinal = Math.floor(row / config.sceneryStrideRows);
        const type = ((rowOrdinal + typeOffset) % 2 + 2) % 2 === 0
          ? 'TREE' : 'ROCK';
        const xOffset = this.getSideSceneryValue(
          visualSeed,
          side,
          row,
          'x'
        ) % cellCount;
        const variant = this.getSideSceneryValue(
          visualSeed,
          side,
          row,
          'variant'
        ) % 4;
        const paletteIndex = this.getSideSceneryValue(
          visualSeed,
          side,
          row,
          'palette'
        ) % 4;
        scenery.push(Object.freeze({
          side,
          type,
          x: logicalMinX + xOffset,
          y: row,
          variant,
          paletteIndex
        }));
      }

      const grass = Object.freeze({
        side,
        type: 'SIDE_SHOULDER_GRASS',
        x: logicalMinX,
        y: clipRowMin,
        width: cellCount,
        depth: clipRowMax - clipRowMin + 1
      });

      return Object.freeze({
        side,
        logicalOuterX: isLeft ? logicalMinX : logicalMaxExclusiveX,
        logicalInnerX: isLeft ? logicalMaxExclusiveX : logicalMinX,
        logicalMinX,
        logicalMaxExclusiveX,
        visibleRowMin,
        visibleRowMax,
        clipRowMin,
        clipRowMax,
        grass,
        scenery: Object.freeze(scenery)
      });
    };

    return Object.freeze({
      opening,
      left: buildSide('LEFT'),
      right: buildSide('RIGHT')
    });
  }

  /**
   * Establish the owning side's projected corridor clip. Canvas' initial clip
   * already bounds this polygon to the viewport, so no primitive can escape
   * the viewport or cross the exact projected opening boundary.
   */
  buildSideCorridorClipPath(sideLayout) {
    const ctx = this.ctx;
    if (!ctx || !sideLayout || (sideLayout.side !== 'LEFT'
      && sideLayout.side !== 'RIGHT')) return false;
    if (typeof ctx.beginPath !== 'function'
      || typeof ctx.moveTo !== 'function'
      || typeof ctx.lineTo !== 'function'
      || typeof ctx.closePath !== 'function'
      || typeof ctx.clip !== 'function') return false;

    const config = this.SIDE_OCCLUSION_CONFIG;
    const isLeft = sideLayout.side === 'LEFT';
    const logicalMinX = isLeft
      ? config.leftOuterX : config.playableMaxExclusiveX;
    const logicalMaxExclusiveX = isLeft
      ? config.playableMinX : config.rightOuterX;
    if (!Number.isFinite(sideLayout.clipRowMin)
      || !Number.isFinite(sideLayout.clipRowMax)
      || sideLayout.clipRowMax < sideLayout.clipRowMin) return false;

    const points = this.getCanvasFootprint(
      logicalMinX,
      sideLayout.clipRowMin,
      logicalMaxExclusiveX - logicalMinX,
      sideLayout.clipRowMax - sideLayout.clipRowMin + 1
    );
    if (!Array.isArray(points) || points.length < 3
      || points.some(point => !Number.isFinite(point.x)
        || !Number.isFinite(point.y))) return false;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.closePath();
    ctx.clip();
    return true;
  }

  /** Draw a visible grass strip only while its owning corridor clip is active. */
  drawSideGrass(sideLayout) {
    if (this._activeSideCorridor !== sideLayout || !sideLayout
      || !sideLayout.grass) return 0;
    const grass = sideLayout.grass;
    if (!this.isWorldFootprintVisible(
      grass.x,
      grass.y,
      grass.width,
      grass.depth,
      {
        height: this.TERRAIN_HEIGHT,
        margin: this.SIDE_OCCLUSION_CONFIG.cullMarginPixels
      }
    )) return 0;

    this.drawVoxelBlock(
      grass.x,
      grass.y,
      grass.width,
      grass.depth,
      this.TERRAIN_HEIGHT,
      this.PALETTES.terrain.GRASS
    );
    return 1;
  }

  /** Draw bounded visible tree/rock descriptors under the active side clip. */
  drawSideScenery(sideLayout) {
    if (this._activeSideCorridor !== sideLayout || !sideLayout
      || !Array.isArray(sideLayout.scenery)) return 0;

    let drawn = 0;
    sideLayout.scenery.forEach(scenery => {
      const height = scenery.type === 'TREE' ? 1.3 : 0.75;
      if (!this.isWorldFootprintVisible(scenery.x, scenery.y, 1, 1, {
        elevation: this.TERRAIN_HEIGHT,
        height,
        margin: this.SIDE_OCCLUSION_CONFIG.cullMarginPixels
      })) return;
      if (this.drawBlockingProp(scenery) > 0) drawn++;
    });
    return drawn;
  }

  /**
   * Draw left and right shoulders in independent guarded Canvas scopes. A side
   * failure is contained after `finally` restoration so later sides and frame
   * phases never inherit clipping, styles, alpha, transforms, shadows, or
   * composite state. Contexts lacking complete clip/state APIs are a safe no-op.
   */
  drawSideShoulders(layout) {
    const emptyResult = () => Object.freeze({
      sidesDrawn: 0,
      grassDrawn: 0,
      sceneryDrawn: 0,
      failedSides: 0
    });
    const ctx = this.ctx;
    if (!layout || typeof layout !== 'object' || !ctx
      || typeof ctx.save !== 'function'
      || typeof ctx.restore !== 'function'
      || typeof ctx.beginPath !== 'function'
      || typeof ctx.moveTo !== 'function'
      || typeof ctx.lineTo !== 'function'
      || typeof ctx.closePath !== 'function'
      || typeof ctx.clip !== 'function') return emptyResult();

    let sidesDrawn = 0;
    let grassDrawn = 0;
    let sceneryDrawn = 0;
    let failedSides = 0;

    ['left', 'right'].forEach(sideName => {
      try {
        const sideLayout = layout[sideName];
        this.withCanvasState(() => {
          if (!this.buildSideCorridorClipPath(sideLayout)) return;
          const previousActiveCorridor = this._activeSideCorridor;
          this._activeSideCorridor = sideLayout;
          try {
            grassDrawn += this.drawSideGrass(sideLayout);
            sceneryDrawn += this.drawSideScenery(sideLayout);
            sidesDrawn++;
          } finally {
            this._activeSideCorridor = previousActiveCorridor;
          }
        });
      } catch (error) {
        failedSides++;
      }
    });

    return Object.freeze({ sidesDrawn, grassDrawn, sceneryDrawn, failedSides });
  }

  /** Transform grid coordinates using the design's 2:1 isometric formula. */
  gridToIso(gridX, gridY) {
    return {
      screenX: (gridX - gridY) * (this.TILE_WIDTH / 2),
      screenY: (gridX + gridY) * (this.TILE_HEIGHT / 2)
    };
  }

  /** Positive world Y is forward and therefore projects upward on screen. */
  worldToIso(worldX, worldY) {
    return this.gridToIso(worldX, -worldY);
  }

  /** Follow the player in both axes. The canvas anchor supplies the ahead bias. */
  centerCameraOnPlayer(playerX, playerY) {
    const playerIso = this.worldToIso(playerX, playerY);
    this.cameraX = playerIso.screenX;
    this.cameraY = playerIso.screenY;
  }

  /** Convert projected coordinates to canvas coordinates with a lower player anchor. */
  screenToCanvas(screenX, screenY) {
    return {
      x: screenX - this.cameraX + this.canvas.width / 2,
      y: screenY - this.cameraY + this.canvas.height * this.PLAYER_SCREEN_Y_RATIO
    };
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  fillPolygon(points, color) {
    if (!points.length) return;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) {
      this.ctx.lineTo(points[index].x, points[index].y);
    }
    this.ctx.closePath();
    this.ctx.fill();
  }

  /**
   * Resolve any color input to a complete three-face palette. Missing or
   * malformed face colors fall back independently so model metadata cannot
   * leak undefined fill styles into Canvas.
   */
  resolveVoxelPalette(palette, fallback = this.PALETTES.stage2.DEFAULT) {
    const safeFallback = fallback && typeof fallback === 'object'
      ? fallback
      : this.PALETTES.stage2.DEFAULT;
    if (typeof palette === 'string' && palette.length > 0) {
      return { top: palette, left: palette, right: palette };
    }

    const source = palette && typeof palette === 'object' ? palette : {};
    return {
      top: typeof source.top === 'string' && source.top.length > 0
        ? source.top : safeFallback.top,
      left: typeof source.left === 'string' && source.left.length > 0
        ? source.left : safeFallback.left,
      right: typeof source.right === 'string' && source.right.length > 0
        ? source.right : safeFallback.right
    };
  }

  /** Select a named Stage 2 palette variant with stable wrapping and fallback. */
  getStage2Palette(name, variantIndex = 0) {
    const entry = Object.prototype.hasOwnProperty.call(this.PALETTES.stage2, name)
      ? this.PALETTES.stage2[name]
      : this.PALETTES.stage2.DEFAULT;
    const variants = Array.isArray(entry) && entry.length > 0 ? entry : [entry];
    const numericIndex = Number.isFinite(variantIndex) ? Math.trunc(variantIndex) : 0;
    const wrappedIndex = ((numericIndex % variants.length) + variants.length) % variants.length;
    return this.resolveVoxelPalette(variants[wrappedIndex]);
  }

  /**
   * Execute drawing that changes alpha or transforms inside a balanced Canvas
   * save/restore pair. Lightweight test contexts without state APIs retain the
   * previous primitive behavior.
   */
  withCanvasState(draw) {
    if (typeof draw !== 'function') return undefined;
    const supportsState = typeof this.ctx.save === 'function'
      && typeof this.ctx.restore === 'function';
    if (!supportsState) return draw();

    this.ctx.save();
    try {
      return draw();
    } finally {
      this.ctx.restore();
    }
  }

  /** Draw with clamped local opacity without leaking globalAlpha. */
  withAlpha(opacity, draw) {
    const requested = Number.isFinite(opacity) ? opacity : 1;
    const clamped = Math.max(0, Math.min(1, requested));
    return this.withCanvasState(() => {
      const currentAlpha = Number.isFinite(this.ctx.globalAlpha)
        ? this.ctx.globalAlpha : 1;
      this.ctx.globalAlpha = currentAlpha * clamped;
      return typeof draw === 'function' ? draw() : undefined;
    });
  }

  /**
   * Execute the frame's visual layers in one fixed order. Callers provide only
   * drawing callbacks; this helper owns no World data and deliberately keeps
   * Clouds ahead of Terrain and gameplay content.
   */
  renderFramePhases(phases = {}) {
    const callbacks = phases && typeof phases === 'object' ? phases : {};
    const executed = [];

    this.RENDER_PHASE_ORDER.forEach(phaseName => {
      const drawPhase = callbacks[phaseName];
      if (typeof drawPhase !== 'function') return;
      drawPhase();
      executed.push(phaseName);
    });

    return executed;
  }

  /**
   * Draw one screen-space voxel form. Background Clouds use canvas anchors,
   * rather than world coordinates, so camera movement cannot pull them into
   * the foreground gameplay layer.
   */
  drawCanvasVoxelForm(centerX, baseY, width, depth, height, palette) {
    const colors = this.resolveVoxelPalette(
      palette,
      this.getStage2Palette('CLOUD', 0)
    );
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const base = [
      { x: centerX - halfWidth, y: baseY },
      { x: centerX, y: baseY - halfDepth },
      { x: centerX + halfWidth, y: baseY },
      { x: centerX, y: baseY + halfDepth }
    ];
    const top = base.map(point => ({ x: point.x, y: point.y - height }));

    this.fillPolygon([top[0], top[1], base[1], base[0]], colors.left);
    this.fillPolygon([top[1], top[2], base[2], base[1]], colors.right);
    this.fillPolygon(top, colors.top);
  }

  /**
   * Draw an immutable Cloud descriptor as three through six overlapping pale
   * voxel forms. Descriptor-derived parallax is visual-only and wraps in the
   * background band; opacity is capped at 0.35 and always state-guarded.
   */
  drawCloud(cloud, visualTime = 0) {
    if (!cloud || typeof cloud !== 'object') return 0;

    const anchorX = Number.isFinite(cloud.anchorX)
      ? Math.max(0, Math.min(1, cloud.anchorX)) : 0.5;
    const anchorY = Number.isFinite(cloud.anchorY)
      ? Math.max(0, Math.min(0.35, cloud.anchorY)) : 0.15;
    const scale = Number.isFinite(cloud.scale)
      ? Math.max(0.5, Math.min(2, cloud.scale)) : 1;
    const opacity = Number.isFinite(cloud.opacity)
      ? Math.max(0, Math.min(0.35, cloud.opacity)) : 0.25;
    const requestedForms = Number.isFinite(cloud.formCount)
      ? Math.trunc(cloud.formCount) : 3;
    const formCount = Math.max(3, Math.min(6, requestedForms));
    const variant = Number.isFinite(cloud.variant)
      ? Math.trunc(cloud.variant) : 0;
    const parallaxRate = Number.isFinite(cloud.parallaxRate)
      ? cloud.parallaxRate : 0;
    const elapsed = Number.isFinite(visualTime) ? visualTime : 0;

    const baseWidth = 54 * scale;
    const travelWidth = this.canvas.width + baseWidth * 4;
    const unwrappedX = anchorX * this.canvas.width + elapsed * parallaxRate;
    const centerX = ((unwrappedX + baseWidth * 2) % travelWidth + travelWidth)
      % travelWidth - baseWidth * 2;
    const centerY = anchorY * this.canvas.height;

    this.withAlpha(opacity, () => {
      for (let index = 0; index < formCount; index++) {
        const sequence = (index + Math.abs(variant)) % 4;
        const sizeFactor = [1, 0.78, 0.9, 0.68][sequence];
        const offsetX = (index - (formCount - 1) / 2) * baseWidth * 0.48;
        const offsetY = [0, -0.16, 0.12, -0.05][sequence] * baseWidth;
        const width = baseWidth * sizeFactor;
        const depth = width * 0.42;
        const height = width * 0.28;
        const palette = this.getStage2Palette('CLOUD', variant + index);
        this.drawCanvasVoxelForm(
          centerX + offsetX,
          centerY + offsetY,
          width,
          depth,
          height,
          palette
        );
      }
    });

    return formCount;
  }

  getCanvasFootprint(gridX, gridY, width, depth, elevation = 0) {
    const elevationPixels = elevation * this.TILE_HEIGHT;
    return [
      this.worldToIso(gridX, gridY),
      this.worldToIso(gridX + width, gridY),
      this.worldToIso(gridX + width, gridY + depth),
      this.worldToIso(gridX, gridY + depth)
    ].map(point => {
      const canvasPoint = this.screenToCanvas(point.screenX, point.screenY);
      return { x: canvasPoint.x, y: canvasPoint.y - elevationPixels };
    });
  }

  /**
   * Test whether a world-space Stage 2 footprint intersects the Canvas plus a
   * small overdraw margin. This is a pure projection query: it allocates local
   * points only and never changes camera, World, or entity records.
   */
  isWorldFootprintVisible(gridX, gridY, width = 1, depth = 1, options = {}) {
    if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) {
      return false;
    }

    const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
    const safeDepth = Number.isFinite(depth) && depth > 0 ? depth : 1;
    const settings = options && typeof options === 'object' ? options : {};
    const elevation = Number.isFinite(settings.elevation)
      ? settings.elevation : 0;
    const height = Number.isFinite(settings.height) && settings.height > 0
      ? settings.height : 0;
    const margin = Number.isFinite(settings.margin) && settings.margin > 0
      ? settings.margin : 0;
    const base = this.getCanvasFootprint(
      gridX,
      gridY,
      safeWidth,
      safeDepth,
      elevation
    );
    const heightPixels = height * this.TILE_HEIGHT;
    const points = heightPixels > 0
      ? base.concat(base.map(point => ({
        x: point.x,
        y: point.y - heightPixels
      })))
      : base;
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minimumX = Math.min.apply(null, xs);
    const maximumX = Math.max.apply(null, xs);
    const minimumY = Math.min.apply(null, ys);
    const maximumY = Math.max.apply(null, ys);

    return maximumX >= -margin &&
      minimumX <= this.canvas.width + margin &&
      maximumY >= -margin &&
      minimumY <= this.canvas.height + margin;
  }

  /**
   * Draw a flat isometric rectangle. The optional elevation keeps lane details
   * flush with the top of an extruded slab while preserving the legacy helper.
   */
  drawIsoRect(gridX, gridY, width, depth, color, elevation = 0) {
    this.fillPolygon(
      this.getCanvasFootprint(gridX, gridY, width, depth, elevation),
      color
    );
  }

  /**
   * Reusable Canvas 2D voxel primitive. Height/elevation are measured in grid
   * units and represented only with projected polygons and palette shading.
   */
  drawVoxelBlock(gridX, gridY, width, depth, height, palette, elevation = 0) {
    const colors = this.resolveVoxelPalette(palette);
    const base = this.getCanvasFootprint(gridX, gridY, width, depth, elevation);
    const heightPixels = height * this.TILE_HEIGHT;
    const top = base.map(point => ({ x: point.x, y: point.y - heightPixels }));

    // The two camera-facing side planes establish thickness; the top is drawn
    // last so adjoining lane tops meet cleanly without visible canvas cracks.
    this.fillPolygon([top[0], top[1], base[1], base[0]], colors.left);
    this.fillPolygon([top[1], top[2], base[2], base[1]], colors.right);
    this.fillPolygon(top, colors.top);
  }

  /**
   * Draw generic Stage 2 cuboid parts relative to one model origin. This is
   * intentionally model-agnostic: later tasks define object silhouettes while
   * this helper only supplies palette selection, local alpha, and shadow reuse.
   */
  drawStage2Model(originX, originY, parts, options = {}) {
    const modelParts = Array.isArray(parts) ? parts : [];
    const baseElevation = Number.isFinite(options.elevation)
      ? options.elevation : this.TERRAIN_HEIGHT + 0.02;
    let drawnParts = 0;

    this.withAlpha(options.opacity, () => {
      if (options.shadow) {
        const shadow = typeof options.shadow === 'object' ? options.shadow : {};
        this.drawGroundShadow(
          originX + (Number.isFinite(shadow.x) ? shadow.x : 0),
          originY + (Number.isFinite(shadow.y) ? shadow.y : 0),
          Number.isFinite(shadow.width) ? shadow.width : 1,
          Number.isFinite(shadow.depth) ? shadow.depth : 0.55
        );
      }

      modelParts.forEach(part => {
        if (!part || !Number.isFinite(part.width) || part.width <= 0
          || !Number.isFinite(part.depth) || part.depth <= 0
          || !Number.isFinite(part.height) || part.height < 0) return;

        const palette = part.palette !== undefined
          ? this.resolveVoxelPalette(part.palette)
          : this.getStage2Palette(part.paletteName, part.variant);
        this.drawVoxelBlock(
          originX + (Number.isFinite(part.x) ? part.x : 0),
          originY + (Number.isFinite(part.y) ? part.y : 0),
          part.width,
          part.depth,
          part.height,
          palette,
          baseElevation + (Number.isFinite(part.elevation) ? part.elevation : 0)
        );
        drawnParts++;
      });
    });

    return drawnParts;
  }

  // Descriptive alias for callers that prefer prism terminology.
  drawIsoPrism(gridX, gridY, width, depth, height, palette, elevation = 0) {
    this.drawVoxelBlock(gridX, gridY, width, depth, height, palette, elevation);
  }

  drawTile(gridX, gridY, color) {
    this.drawIsoRect(gridX, gridY, 1, 1, color);
  }

  /** Draw one continuous, slightly overlapping extruded lane slab. */
  drawTerrainSlab(type, startX, gridY, width) {
    const palette = this.PALETTES.terrain[type] || this.PALETTES.terrain.DEFAULT;
    this.drawVoxelBlock(
      startX,
      gridY - 0.01,
      width,
      1.02,
      this.TERRAIN_HEIGHT,
      palette
    );
  }

  /** Draw the existing tie and rail language on top of a continuous track slab. */
  drawTrainTrackDetails(startX, gridY, width) {
    const topElevation = this.TERRAIN_HEIGHT + 0.006;
    for (let offset = 0.08; offset < width; offset += 0.5) {
      this.drawIsoRect(
        startX + offset,
        gridY + 0.05,
        0.16,
        0.9,
        '#4A2C1A',
        topElevation
      );
    }
    this.drawIsoRect(startX, gridY + 0.2, width, 0.1, '#C0C0C0', topElevation + 0.01);
    this.drawIsoRect(startX, gridY + 0.7, width, 0.1, '#C0C0C0', topElevation + 0.01);
  }

  /** Backward-compatible single track section used by focused train tests. */
  drawTrainTrackTile(gridX, gridY) {
    this.drawTerrainSlab('TRAIN_TRACK', gridX, gridY, 1);
    this.drawTrainTrackDetails(gridX, gridY, 1);
  }

  /**
   * Draw the Stage 2 railway warning signal beside, never on, the track row.
   * The supplied boolean is read-only: train lifecycle timing remains owned by
   * Generator, while this method only selects the active light-face palette.
   */
  drawVoxelWarningSignal(gridX, gridY, lightOn) {
    if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) return 0;

    // A track row occupies [gridY, gridY + 1]. Every signal part begins beyond
    // that interval so the visual model cannot cover a playable track cell.
    const sideOffsetY = 1.08;
    const parts = [
      // Weighted voxel base.
      {
        x: 0,
        y: sideOffsetY,
        width: 0.9,
        depth: 0.46,
        height: 0.18,
        paletteName: 'METAL'
      },
      // Narrow upright post.
      {
        x: 0.4,
        y: sideOffsetY + 0.14,
        width: 0.1,
        depth: 0.12,
        height: 0.88,
        elevation: 0.18,
        paletteName: 'SIGNAL_POST'
      },
      // Crossbar and dark sign plate.
      {
        x: 0.14,
        y: sideOffsetY + 0.12,
        width: 0.62,
        depth: 0.16,
        height: 0.12,
        elevation: 0.78,
        paletteName: 'SIGNAL_POST'
      },
      {
        x: 0.08,
        y: sideOffsetY + 0.1,
        width: 0.74,
        depth: 0.22,
        height: 0.34,
        elevation: 0.88,
        paletteName: 'SIGNAL_HOUSING'
      },
      // Two distinct dark housings project from the sign plate.
      {
        x: 0.16,
        y: sideOffsetY + 0.06,
        width: 0.22,
        depth: 0.28,
        height: 0.22,
        elevation: 0.94,
        paletteName: 'SIGNAL_HOUSING'
      },
      {
        x: 0.52,
        y: sideOffsetY + 0.06,
        width: 0.22,
        depth: 0.28,
        height: 0.22,
        elevation: 0.94,
        paletteName: 'SIGNAL_HOUSING'
      },
      // Only the first face is emissive while lit; both faces are dark when
      // unlit. The second face stays dark because warningLightOn has one phase.
      {
        x: 0.18,
        y: sideOffsetY + 0.035,
        width: 0.18,
        depth: 0.055,
        height: 0.16,
        elevation: 0.98,
        paletteName: lightOn === true ? 'SIGNAL_LIT' : 'SIGNAL_HOUSING'
      },
      {
        x: 0.54,
        y: sideOffsetY + 0.035,
        width: 0.18,
        depth: 0.055,
        height: 0.16,
        elevation: 0.98,
        paletteName: 'SIGNAL_HOUSING'
      }
    ];

    return this.drawStage2Model(gridX, gridY, parts);
  }

  /** Backward-compatible production alias for the upgraded voxel signal. */
  drawWarningSignal(gridX, gridY, lightOn) {
    return this.drawVoxelWarningSignal(gridX, gridY, lightOn);
  }

  /** Restrained projected contact shadow for the chicken and Stage 2 entities. */
  drawGroundShadow(gridX, gridY, width = 1, depth = 0.55) {
    this.drawIsoRect(
      gridX + 0.09,
      gridY - 0.06,
      Math.max(0.25, width * 0.9),
      depth,
      'rgba(24, 31, 28, 0.22)',
      this.TERRAIN_HEIGHT + 0.012
    );
  }

  /** Preserve the legacy flat entity helper for models not yet upgraded. */
  drawEntity(x, y, width, color, depth = 0.5) {
    this.drawIsoRect(x, y, width, depth, color, this.TERRAIN_HEIGHT + 0.02);
  }

  /**
   * Draw a recognizable voxel car without changing its simulation record.
   * Every part stays inside the car's logical horizontal interval; velocity is
   * consulted only to mirror front/rear details, and visual metadata selects a
   * stable bright body palette without introducing render-time randomness.
   */
  drawVoxelCar(car) {
    if (!car || !Number.isFinite(car.x) || !Number.isFinite(car.y)) return 0;

    const logicalWidth = Number.isFinite(car.width) && car.width > 0
      ? car.width : 2;
    const facing = Number.isFinite(car.velocity) && car.velocity < 0 ? -1 : 1;
    const visual = car.visual && typeof car.visual === 'object' ? car.visual : {};
    const paletteIndex = Number.isFinite(visual.paletteIndex)
      ? Math.trunc(visual.paletteIndex) : 0;
    const bodyPalette = this.getStage2Palette('CAR_BODY', paletteIndex);

    const chassisInset = logicalWidth * 0.05;
    const chassisWidth = logicalWidth - chassisInset * 2;
    const cabinWidth = logicalWidth * 0.42;
    const cabinX = logicalWidth * 0.29;
    const wheelWidth = logicalWidth * 0.13;
    const wheelXs = [logicalWidth * 0.13, logicalWidth * 0.74];
    const wheelYs = [0.08, 0.66];
    const frontWindowWidth = logicalWidth * 0.14;
    const rearWindowWidth = logicalWidth * 0.11;
    const frontWindowX = facing > 0
      ? cabinX + cabinWidth - frontWindowWidth
      : cabinX;
    const rearWindowX = facing > 0
      ? cabinX
      : cabinX + cabinWidth - rearWindowWidth;
    const noseX = facing > 0
      ? logicalWidth - chassisInset - logicalWidth * 0.08
      : chassisInset;
    const tailX = facing > 0
      ? chassisInset
      : logicalWidth - chassisInset - logicalWidth * 0.06;

    const parts = [];

    // Four wheel forms remain visible around the chassis as two axle pairs.
    wheelXs.forEach(wheelX => {
      wheelYs.forEach(wheelY => {
        parts.push({
          x: wheelX,
          y: wheelY,
          width: wheelWidth,
          depth: 0.18,
          height: 0.18,
          paletteName: 'WHEEL'
        });
      });
    });

    parts.push(
      {
        x: chassisInset,
        y: 0.14,
        width: chassisWidth,
        depth: 0.66,
        height: 0.26,
        elevation: 0.1,
        palette: bodyPalette
      },
      {
        x: cabinX,
        y: 0.23,
        width: cabinWidth,
        depth: 0.48,
        height: 0.34,
        elevation: 0.36,
        palette: bodyPalette
      },
      {
        x: frontWindowX,
        y: 0.27,
        width: frontWindowWidth,
        depth: 0.4,
        height: 0.055,
        elevation: 0.7,
        paletteName: 'WINDOW'
      },
      {
        x: rearWindowX,
        y: 0.27,
        width: rearWindowWidth,
        depth: 0.4,
        height: 0.055,
        elevation: 0.7,
        paletteName: 'WINDOW'
      },
      // Unequal front/rear accents make the velocity-facing mirror readable.
      {
        x: noseX,
        y: 0.22,
        width: logicalWidth * 0.08,
        depth: 0.18,
        height: 0.08,
        elevation: 0.38,
        paletteName: 'METAL'
      },
      {
        x: noseX,
        y: 0.56,
        width: logicalWidth * 0.08,
        depth: 0.18,
        height: 0.08,
        elevation: 0.38,
        paletteName: 'METAL'
      },
      {
        x: tailX,
        y: 0.25,
        width: logicalWidth * 0.06,
        depth: 0.14,
        height: 0.07,
        elevation: 0.38,
        paletteName: 'SIGNAL_LIT'
      },
      {
        x: tailX,
        y: 0.57,
        width: logicalWidth * 0.06,
        depth: 0.14,
        height: 0.07,
        elevation: 0.38,
        paletteName: 'SIGNAL_LIT'
      }
    );

    return this.drawStage2Model(car.x, car.y, parts, {
      shadow: { width: logicalWidth, depth: 0.48 }
    });
  }

  /**
   * Draw a recognizable locomotive followed by one or more separated cars.
   * Layout is calculated entirely inside the train's logical width. The
   * velocity sign mirrors the model so the locomotive always leads, while the
   * supplied simulation and lifecycle fields remain read-only.
   */
  drawVoxelTrain(train) {
    if (!train || !Number.isFinite(train.x) || !Number.isFinite(train.y)
      || !Number.isFinite(train.width) || train.width <= 0) return 0;

    const logicalWidth = train.width;
    const facing = Number.isFinite(train.velocity) && train.velocity < 0 ? -1 : 1;
    const edgeInset = Math.min(0.08, logicalWidth * 0.012);
    const carCount = logicalWidth >= 10 ? 2 : 1;
    const couplerGap = Math.min(0.16, logicalWidth * 0.02);
    const locomotiveLength = logicalWidth * (carCount === 2 ? 0.3 : 0.38);
    const followingCarLength = (
      logicalWidth - edgeInset * 2 - locomotiveLength - couplerGap * carCount
    ) / carCount;
    const bodyPalette = this.getStage2Palette('TRAIN_BODY');
    const parts = [];

    // Parts are authored facing positive X, then mirrored into the same logical
    // interval for negative velocity. This helper never writes to train data.
    const orientedX = (offset, width) => facing > 0
      ? offset
      : logicalWidth - offset - width;
    const addPart = part => {
      const width = part.width;
      parts.push(Object.assign({}, part, { x: orientedX(part.x, width) }));
    };

    const addWheelPairs = (sectionX, sectionWidth) => {
      const wheelWidth = Math.min(0.34, sectionWidth * 0.13);
      const wheelOffsets = [
        sectionX + sectionWidth * 0.14,
        sectionX + sectionWidth * 0.73
      ];
      wheelOffsets.forEach(wheelX => {
        [0.06, 0.75].forEach(wheelY => {
          addPart({
            x: wheelX,
            y: wheelY,
            width: wheelWidth,
            depth: 0.17,
            height: 0.2,
            paletteName: 'WHEEL'
          });
        });
      });
    };

    let cursor = edgeInset;
    for (let carIndex = 0; carIndex < carCount; carIndex++) {
      const sectionX = cursor;
      const sectionWidth = followingCarLength;
      addWheelPairs(sectionX, sectionWidth);
      addPart({
        x: sectionX,
        y: 0.16,
        width: sectionWidth,
        depth: 0.68,
        height: 0.4,
        elevation: 0.18,
        palette: bodyPalette
      });
      addPart({
        x: sectionX + 0.06,
        y: 0.21,
        width: Math.max(0.08, sectionWidth - 0.12),
        depth: 0.58,
        height: 0.08,
        elevation: 0.58,
        paletteName: 'TRAIN_ACCENT'
      });

      // Repeated side windows scale with each following-car section.
      const windowCount = Math.max(2, Math.floor(sectionWidth / 1.15));
      const windowSlot = sectionWidth / windowCount;
      const windowWidth = Math.min(0.46, windowSlot * 0.55);
      for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
        addPart({
          x: sectionX + windowSlot * (windowIndex + 0.5) - windowWidth / 2,
          y: 0.24,
          width: windowWidth,
          depth: 0.2,
          height: 0.07,
          elevation: 0.55,
          paletteName: 'WINDOW'
        });
      }

      cursor += sectionWidth;
      // A narrow coupler occupies only the center of the intentional body gap.
      addPart({
        x: cursor + couplerGap * 0.25,
        y: 0.4,
        width: couplerGap * 0.5,
        depth: 0.2,
        height: 0.12,
        elevation: 0.28,
        paletteName: 'METAL'
      });
      cursor += couplerGap;
    }

    const locomotiveX = cursor;
    const locomotiveEnd = locomotiveX + locomotiveLength;
    const noseLength = locomotiveLength * 0.22;
    const noseX = locomotiveEnd - noseLength;
    const cabWidth = Math.min(1.1, locomotiveLength * 0.38);
    const cabX = locomotiveX + 0.1;
    const engineX = cabX + cabWidth * 0.72;
    const engineWidth = noseX - engineX;

    addWheelPairs(locomotiveX, locomotiveLength);
    addPart({
      x: locomotiveX,
      y: 0.16,
      width: locomotiveLength,
      depth: 0.68,
      height: 0.3,
      elevation: 0.16,
      palette: bodyPalette
    });
    addPart({
      x: engineX,
      y: 0.2,
      width: engineWidth,
      depth: 0.6,
      height: 0.38,
      elevation: 0.4,
      palette: bodyPalette
    });
    addPart({
      x: cabX,
      y: 0.2,
      width: cabWidth,
      depth: 0.6,
      height: 0.58,
      elevation: 0.46,
      palette: bodyPalette
    });

    // Cab windows appear on both visible sides, with a front-facing window
    // nearest the nose so the locomotive direction remains readable.
    const cabWindowWidth = Math.min(0.3, cabWidth * 0.28);
    [cabX + 0.12, cabX + cabWidth - cabWindowWidth - 0.1].forEach(windowX => {
      addPart({
        x: windowX,
        y: 0.24,
        width: cabWindowWidth,
        depth: 0.2,
        height: 0.07,
        elevation: 0.97,
        paletteName: 'WINDOW'
      });
    });
    addPart({
      x: noseX,
      y: 0.18,
      width: noseLength,
      depth: 0.64,
      height: 0.44,
      elevation: 0.24,
      paletteName: 'TRAIN_ACCENT'
    });
    addPart({
      x: locomotiveEnd - Math.min(0.14, noseLength * 0.28),
      y: 0.26,
      width: Math.min(0.14, noseLength * 0.28),
      depth: 0.48,
      height: 0.12,
      elevation: 0.64,
      paletteName: 'METAL'
    });

    return this.drawStage2Model(train.x, train.y, parts, {
      shadow: { width: logicalWidth, depth: 0.62 }
    });
  }

  /**
   * Draw a raised voxel log inside its existing Platform footprint. End caps,
   * ring marks, and bark bands overlap the trunk visually but never alter the
   * Platform record or its logical collision interval.
   */
  drawVoxelLog(platform) {
    if (!platform || !Number.isFinite(platform.x) || !Number.isFinite(platform.y)
      || !Number.isFinite(platform.width) || platform.width <= 0) return 0;

    const logicalWidth = platform.width;
    const visual = platform.visual && typeof platform.visual === 'object'
      ? platform.visual : {};
    const rawVariant = Number.isFinite(visual.modelVariant)
      ? Math.trunc(visual.modelVariant) : 0;
    const variant = ((rawVariant % 3) + 3) % 3;
    const endCapWidth = Math.min(0.18, Math.max(0.1, logicalWidth * 0.05));
    const ringWidth = Math.max(0.035, endCapWidth * 0.3);
    const bandWidth = Math.min(0.11, logicalWidth * 0.03);
    const bandShift = (variant - 1) * logicalWidth * 0.025;
    const barkPalette = this.getStage2Palette('LOG_BARK');
    const endPalette = this.getStage2Palette('LOG_END');
    const detailPalette = this.getStage2Palette('TREE_TRUNK');
    const parts = [
      {
        x: endCapWidth * 0.35,
        y: 0.18,
        width: logicalWidth - endCapWidth * 0.7,
        depth: 0.64,
        height: 0.28,
        elevation: 0.08,
        palette: barkPalette
      },
      {
        x: 0.03,
        y: 0.22,
        width: endCapWidth,
        depth: 0.56,
        height: 0.24,
        elevation: 0.12,
        palette: endPalette
      },
      {
        x: logicalWidth - endCapWidth - 0.03,
        y: 0.22,
        width: endCapWidth,
        depth: 0.56,
        height: 0.24,
        elevation: 0.12,
        palette: endPalette
      }
    ];

    // Raised bands read as bark texture while remaining inside the trunk.
    [logicalWidth * 0.34 + bandShift, logicalWidth * 0.66 - bandShift]
      .forEach(bandX => {
        parts.push({
          x: Math.max(endCapWidth, Math.min(logicalWidth - endCapWidth - bandWidth, bandX)),
          y: 0.2,
          width: bandWidth,
          depth: 0.6,
          height: 0.045,
          elevation: 0.36,
          palette: detailPalette
        });
      });

    // Small inset marks make both contrasting caps read as cut wood rings.
    [0.03 + (endCapWidth - ringWidth) / 2,
      logicalWidth - endCapWidth - 0.03 + (endCapWidth - ringWidth) / 2]
      .forEach(ringX => {
        parts.push({
          x: ringX,
          y: 0.34,
          width: ringWidth,
          depth: 0.3,
          height: 0.04,
          elevation: 0.36,
          palette: barkPalette
        });
      });

    return this.drawStage2Model(platform.x, platform.y, parts, {
      shadow: { width: logicalWidth, depth: 0.46 }
    });
  }

  /**
   * Draw one compact, shallow hexagonal lily pad centered in its one-cell
   * support footprint. The Platform record remains immutable; legacy callers
   * with wider positive widths still receive the same one-cell visual without
   * reviving the obsolete clustered silhouette.
   */
  drawVoxelLilyPad(platform) {
    if (!platform || !Number.isFinite(platform.x) || !Number.isFinite(platform.y)
      || !Number.isFinite(platform.width) || platform.width <= 0) return 0;

    const visual = platform.visual && typeof platform.visual === 'object'
      ? platform.visual : {};
    const rawVariant = Number.isFinite(visual.modelVariant)
      ? Math.trunc(visual.modelVariant) : 0;
    const variant = ((rawVariant % 3) + 3) % 3;
    const paletteIndex = Number.isFinite(visual.paletteIndex)
      ? Math.trunc(visual.paletteIndex) : 0;
    const padPalette = this.getStage2Palette('LILY_PAD', paletteIndex);
    const padWidth = 0.84;
    const padDepth = padWidth * 0.82;
    const padHeight = 0.09;
    const baseElevation = this.TERRAIN_HEIGHT + 0.06;
    const centerX = platform.x + 0.5;
    const centerY = platform.y + 0.5;
    const radiusX = padWidth / 2;
    const radiusY = padDepth / 2;

    const projectPoint = (point, elevation) => {
      const projected = this.worldToIso(point.x, point.y);
      const canvasPoint = this.screenToCanvas(
        projected.screenX,
        projected.screenY
      );
      return {
        x: canvasPoint.x,
        y: canvasPoint.y - elevation * this.TILE_HEIGHT
      };
    };

    // The shadow and silhouette are bounded by [x, x + 1), independent of any
    // historical wider Lily width supplied by a direct caller.
    this.drawGroundShadow(platform.x, platform.y, 1, 0.46);

    const worldHex = [
      { x: centerX - radiusX * 0.5, y: centerY - radiusY },
      { x: centerX + radiusX * 0.5, y: centerY - radiusY },
      { x: centerX + radiusX, y: centerY },
      { x: centerX + radiusX * 0.5, y: centerY + radiusY },
      { x: centerX - radiusX * 0.5, y: centerY + radiusY },
      { x: centerX - radiusX, y: centerY }
    ];
    const base = worldHex.map(point => projectPoint(point, baseElevation));
    const top = worldHex.map(point => projectPoint(
      point,
      baseElevation + padHeight
    ));

    // Six shallow side quads retain voxel depth beneath one contiguous top.
    for (let edge = 0; edge < worldHex.length; edge++) {
      const next = (edge + 1) % worldHex.length;
      const sideColor = edge < 3 ? padPalette.right : padPalette.left;
      this.fillPolygon(
        [top[edge], top[next], base[next], base[edge]],
        sideColor
      );
    }
    this.fillPolygon(top, padPalette.top);

    let drawnParts = 1;

    // One metadata variant keeps a deterministic flower accent centered on the
    // single pad and consumes no render-time randomness.
    if (variant === 1) {
      drawnParts += this.drawStage2Model(platform.x, platform.y, [
        {
          x: 0.46,
          y: 0.46,
          width: 0.08,
          depth: 0.08,
          height: 0.12,
          elevation: 0.15,
          paletteName: 'FLOWER_STEM'
        },
        {
          x: 0.39,
          y: 0.39,
          width: 0.22,
          depth: 0.2,
          height: 0.09,
          elevation: 0.27,
          paletteName: 'FLOWER_BLOSSOM',
          variant: paletteIndex
        }
      ]);
    }

    return drawnParts;
  }

  /**
   * Draw low, non-blocking grass decoration. Flowers and tufts deliberately
   * omit contact shadows and remain well below the Player body so they cannot
   * obscure movement. The immutable record only selects position and variant.
   */
  drawGrassDecoration(decoration) {
    if (!decoration || !Number.isFinite(decoration.x)
      || !Number.isFinite(decoration.y)) return 0;

    const rawVariant = Number.isFinite(decoration.variant)
      ? Math.trunc(decoration.variant) : 0;
    const paletteIndex = Number.isFinite(decoration.paletteIndex)
      ? Math.trunc(decoration.paletteIndex) : rawVariant;

    if (decoration.type === 'FLOWER') {
      const blossomPalette = this.getStage2Palette('FLOWER_BLOSSOM', paletteIndex);
      const parts = [
        {
          x: 0.47,
          y: 0.47,
          width: 0.08,
          depth: 0.08,
          height: 0.2,
          paletteName: 'FLOWER_STEM'
        },
        {
          x: 0.36,
          y: 0.36,
          width: 0.3,
          depth: 0.3,
          height: 0.1,
          elevation: 0.2,
          palette: blossomPalette
        },
        {
          x: rawVariant % 2 === 0 ? 0.4 : 0.52,
          y: 0.47,
          width: 0.16,
          depth: 0.08,
          height: 0.05,
          elevation: 0.1,
          paletteName: 'FLOWER_STEM'
        }
      ];
      return this.drawStage2Model(decoration.x, decoration.y, parts);
    }

    if (decoration.type === 'GRASS_TUFT') {
      const mirrored = Math.abs(rawVariant) % 2 === 1;
      const parts = [
        {
          x: mirrored ? 0.37 : 0.31,
          y: 0.42,
          width: 0.1,
          depth: 0.12,
          height: 0.18,
          paletteName: 'GRASS_TUFT'
        },
        {
          x: 0.46,
          y: 0.36,
          width: 0.1,
          depth: 0.12,
          height: 0.26,
          paletteName: 'GRASS_TUFT'
        },
        {
          x: mirrored ? 0.57 : 0.61,
          y: 0.48,
          width: 0.09,
          depth: 0.11,
          height: 0.14,
          paletteName: 'GRASS_TUFT'
        }
      ];
      return this.drawStage2Model(decoration.x, decoration.y, parts);
    }

    return 0;
  }

  /**
   * Draw a one-cell Blocking_Prop without changing its occupancy record.
   * Trees use a trunk and layered canopy; rocks use stepped overlapping masses.
   * Both receive one-cell contact shadows, unlike low Ground_Decorations.
   */
  drawBlockingProp(prop) {
    if (!prop || !Number.isFinite(prop.x) || !Number.isFinite(prop.y)) return 0;

    const rawVariant = Number.isFinite(prop.variant) ? Math.trunc(prop.variant) : 0;
    const paletteIndex = Number.isFinite(prop.paletteIndex)
      ? Math.trunc(prop.paletteIndex) : rawVariant;

    if (prop.type === 'TREE') {
      const canopyPalette = this.getStage2Palette('TREE_CANOPY', paletteIndex);
      const upperCanopyPalette = this.getStage2Palette(
        'TREE_CANOPY', paletteIndex + 1
      );
      const parts = [
        {
          x: 0.42,
          y: 0.42,
          width: 0.18,
          depth: 0.18,
          height: 0.58,
          paletteName: 'TREE_TRUNK'
        },
        {
          x: 0.12,
          y: 0.12,
          width: 0.78,
          depth: 0.78,
          height: 0.3,
          elevation: 0.38,
          palette: canopyPalette
        },
        {
          x: 0.2,
          y: 0.2,
          width: 0.62,
          depth: 0.62,
          height: 0.3,
          elevation: 0.62,
          palette: upperCanopyPalette
        },
        {
          x: 0.3,
          y: 0.3,
          width: 0.42,
          depth: 0.42,
          height: 0.24,
          elevation: 0.86,
          palette: canopyPalette
        }
      ];
      return this.drawStage2Model(prop.x, prop.y, parts, {
        shadow: { width: 1, depth: 0.62 }
      });
    }

    if (prop.type === 'ROCK') {
      const rockPalette = this.getStage2Palette('ROCK', paletteIndex);
      const accentPalette = this.getStage2Palette('ROCK', paletteIndex + 1);
      const shifted = Math.abs(rawVariant) % 2 === 1;
      const parts = [
        {
          x: shifted ? 0.1 : 0.16,
          y: 0.22,
          width: 0.68,
          depth: 0.58,
          height: 0.28,
          palette: rockPalette
        },
        {
          x: shifted ? 0.32 : 0.26,
          y: 0.28,
          width: 0.5,
          depth: 0.42,
          height: 0.26,
          elevation: 0.22,
          palette: accentPalette
        },
        {
          x: shifted ? 0.42 : 0.36,
          y: 0.34,
          width: 0.28,
          depth: 0.26,
          height: 0.18,
          elevation: 0.43,
          palette: rockPalette
        }
      ];
      return this.drawStage2Model(prop.x, prop.y, parts, {
        shadow: { width: 1, depth: 0.55 }
      });
    }

    return 0;
  }

  /** Normalize rendering-only facing to one cardinal direction. */
  normalizePikachuFacing(facing) {
    if (facing && Number.isFinite(facing.dx) && Number.isFinite(facing.dy)
      && ((facing.dx === 0 && (facing.dy === 1 || facing.dy === -1))
        || (facing.dy === 0 && (facing.dx === 1 || facing.dx === -1)))) {
      return Object.freeze({ dx: facing.dx, dy: facing.dy });
    }
    return Object.freeze({ dx: 0, dy: 1 });
  }

  /**
   * Rotate one canonical positive-y cuboid around the Player footprint center.
   * The returned local coordinates never modify the source part or render origin.
   */
  transformPikachuPart(part, facing) {
    if (!part || typeof part !== 'object'
      || !Number.isFinite(part.x) || !Number.isFinite(part.y)
      || !Number.isFinite(part.width) || !Number.isFinite(part.depth)) {
      return null;
    }

    const direction = this.normalizePikachuFacing(facing);
    let transformedX = part.x;
    let transformedY = part.y;
    let transformedWidth = part.width;
    let transformedDepth = part.depth;

    if (direction.dx === 1) {
      transformedX = part.y;
      transformedY = 1 - part.x - part.width;
      transformedWidth = part.depth;
      transformedDepth = part.width;
    } else if (direction.dy === -1) {
      transformedX = 1 - part.x - part.width;
      transformedY = 1 - part.y - part.depth;
    } else if (direction.dx === -1) {
      transformedX = 1 - part.y - part.depth;
      transformedY = part.x;
      transformedWidth = part.depth;
      transformedDepth = part.width;
    }

    return Object.freeze({
      role: part.role,
      semantic: part.semantic,
      surface: part.surface,
      side: part.side,
      x: transformedX,
      y: transformedY,
      width: transformedWidth,
      depth: transformedDepth,
      height: part.height,
      elevation: part.elevation,
      palette: part.palette
    });
  }

  /**
   * Build the bounded semantic Pikachu model in local Player coordinates.
   * Canonical parts face positive world y; every part is cardinally transformed.
   */
  buildPikachuManifest(facing = { dx: 0, dy: 1 }) {
    const colors = this.PALETTES.pikachu;
    const canonical = [
      { role: 'leftFoot', semantic: 'foot', side: 'left', surface: 'center', x: 0.18, y: 0.25, width: 0.25, depth: 0.28, height: 0.09, elevation: 0, palette: colors.yellowShadow },
      { role: 'rightFoot', semantic: 'foot', side: 'right', surface: 'center', x: 0.57, y: 0.25, width: 0.25, depth: 0.28, height: 0.09, elevation: 0, palette: colors.yellowShadow },
      { role: 'leftLeg', semantic: 'leg', side: 'left', surface: 'center', x: 0.25, y: 0.3, width: 0.16, depth: 0.2, height: 0.25, elevation: 0.06, palette: colors.yellow },
      { role: 'rightLeg', semantic: 'leg', side: 'right', surface: 'center', x: 0.59, y: 0.3, width: 0.16, depth: 0.2, height: 0.25, elevation: 0.06, palette: colors.yellow },
      { role: 'torso', semantic: 'body', surface: 'center', x: 0.22, y: 0.2, width: 0.56, depth: 0.56, height: 0.5, elevation: 0.24, palette: colors.yellow },
      { role: 'belly', semantic: 'belly', surface: 'front', x: 0.34, y: 0.69, width: 0.32, depth: 0.08, height: 0.3, elevation: 0.34, palette: colors.yellowHighlight },
      { role: 'leftArm', semantic: 'arm', side: 'left', surface: 'center', x: 0.1, y: 0.39, width: 0.2, depth: 0.22, height: 0.28, elevation: 0.46, palette: colors.yellow },
      { role: 'rightArm', semantic: 'arm', side: 'right', surface: 'center', x: 0.7, y: 0.39, width: 0.2, depth: 0.22, height: 0.28, elevation: 0.46, palette: colors.yellow },
      { role: 'head', semantic: 'head', surface: 'center', x: 0.2, y: 0.35, width: 0.6, depth: 0.48, height: 0.48, elevation: 0.73, palette: colors.yellowHighlight },
      { role: 'leftEar', semantic: 'ear', side: 'left', surface: 'center', x: 0.25, y: 0.44, width: 0.16, depth: 0.18, height: 0.38, elevation: 1.17, palette: colors.yellow },
      { role: 'rightEar', semantic: 'ear', side: 'right', surface: 'center', x: 0.59, y: 0.44, width: 0.16, depth: 0.18, height: 0.38, elevation: 1.17, palette: colors.yellow },
      { role: 'leftEarUpper', semantic: 'ear', side: 'left', surface: 'center', x: 0.27, y: 0.45, width: 0.12, depth: 0.14, height: 0.28, elevation: 1.51, palette: colors.yellow },
      { role: 'rightEarUpper', semantic: 'ear', side: 'right', surface: 'center', x: 0.61, y: 0.45, width: 0.12, depth: 0.14, height: 0.28, elevation: 1.51, palette: colors.yellow },
      { role: 'leftEarTip', semantic: 'earTip', side: 'left', surface: 'center', x: 0.27, y: 0.45, width: 0.12, depth: 0.14, height: 0.2, elevation: 1.77, palette: colors.black },
      { role: 'rightEarTip', semantic: 'earTip', side: 'right', surface: 'center', x: 0.61, y: 0.45, width: 0.12, depth: 0.14, height: 0.2, elevation: 1.77, palette: colors.black },
      { role: 'leftEye', semantic: 'eye', side: 'left', surface: 'front', x: 0.31, y: 0.79, width: 0.1, depth: 0.07, height: 0.12, elevation: 1.04, palette: colors.dark },
      { role: 'rightEye', semantic: 'eye', side: 'right', surface: 'front', x: 0.59, y: 0.79, width: 0.1, depth: 0.07, height: 0.12, elevation: 1.04, palette: colors.dark },
      { role: 'nose', semantic: 'nose', surface: 'front', x: 0.46, y: 0.82, width: 0.08, depth: 0.07, height: 0.07, elevation: 0.94, palette: colors.dark },
      { role: 'leftCheek', semantic: 'cheek', side: 'left', surface: 'front', x: 0.22, y: 0.77, width: 0.14, depth: 0.1, height: 0.14, elevation: 0.86, palette: colors.red },
      { role: 'rightCheek', semantic: 'cheek', side: 'right', surface: 'front', x: 0.64, y: 0.77, width: 0.14, depth: 0.1, height: 0.14, elevation: 0.86, palette: colors.red },
      { role: 'backMarkingUpper', semantic: 'backMarking', surface: 'rear', x: 0.35, y: 0.14, width: 0.3, depth: 0.08, height: 0.1, elevation: 0.64, palette: colors.brown },
      { role: 'backMarkingLower', semantic: 'backMarking', surface: 'rear', x: 0.39, y: 0.12, width: 0.22, depth: 0.08, height: 0.1, elevation: 0.49, palette: colors.brown },
      { role: 'tailRoot', semantic: 'tail', surface: 'rear', x: 0.72, y: 0.02, width: 0.16, depth: 0.2, height: 0.18, elevation: 0.56, palette: colors.brown },
      { role: 'tailLower', semantic: 'tail', surface: 'rear', x: 0.78, y: -0.12, width: 0.18, depth: 0.22, height: 0.2, elevation: 0.66, palette: colors.yellowShadow },
      { role: 'tailMiddle', semantic: 'tail', surface: 'rear', x: 0.62, y: -0.28, width: 0.34, depth: 0.18, height: 0.22, elevation: 0.8, palette: colors.yellow },
      { role: 'tailUpper', semantic: 'tail', surface: 'rear', x: 0.7, y: -0.43, width: 0.18, depth: 0.22, height: 0.24, elevation: 0.96, palette: colors.yellowHighlight },
      { role: 'tailTip', semantic: 'tail', surface: 'rear', x: 0.54, y: -0.57, width: 0.34, depth: 0.18, height: 0.24, elevation: 1.13, palette: colors.yellow }
    ];

    const direction = this.normalizePikachuFacing(facing);
    return Object.freeze(canonical.slice(0, 32).map(part =>
      this.transformPikachuPart(part, direction)).filter(part => part !== null));
  }

  /** A malformed part is omitted rather than repaired into a different voxel. */
  isValidPikachuPart(part) {
    if (!part || typeof part !== 'object'
      || typeof part.role !== 'string' || part.role.length === 0
      || typeof part.semantic !== 'string' || part.semantic.length === 0
      || !Number.isFinite(part.x) || !Number.isFinite(part.y)
      || !Number.isFinite(part.width) || part.width <= 0
      || !Number.isFinite(part.depth) || part.depth <= 0
      || !Number.isFinite(part.height) || part.height <= 0
      || !Number.isFinite(part.elevation) || part.elevation < 0) return false;

    const palette = part.palette;
    return !!palette && typeof palette === 'object'
      && ['top', 'left', 'right'].every(face =>
        typeof palette[face] === 'string' && palette[face].length > 0);
  }

  /**
   * Draw one semantic Pikachu from safe voxel parts. Hop is normalized once and
   * added to the shared model base, so every valid part rises uniformly.
   */
  drawVoxelPikachu(x, y, visualState = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;

    const state = visualState && typeof visualState === 'object'
      ? visualState : {};
    const facing = this.normalizePikachuFacing(state.facing);
    const hopHeight = Number.isFinite(state.hopHeight) && state.hopHeight >= 0
      ? state.hopHeight : 0;
    const manifest = this.buildPikachuManifest(facing);
    if (!Array.isArray(manifest)) return 0;

    const validParts = manifest.slice(0, 32).filter(part =>
      this.isValidPikachuPart(part));
    if (validParts.length === 0) return 0;

    const drawnParts = this.drawStage2Model(x, y, validParts, {
      elevation: this.TERRAIN_HEIGHT + 0.025 + hopHeight
    });
    return drawnParts > 0 ? 1 : 0;
  }

  /**
   * Procedural voxel chicken assembled from small shaded cuboids. Facing moves
   * the head, beak, wattle, eyes, and feet toward the last input direction.
   * Retained as a compatibility helper; production dispatch is updated later.
   */
  drawVoxelChicken(x, y, visualState = {}) {
    const facing = visualState.facing || { dx: 0, dy: 1 };
    const hopHeight = Math.max(0, visualState.hopHeight || 0);
    const base = this.TERRAIN_HEIGHT + 0.025 + hopHeight;
    const white = this.PALETTES.chicken.white;
    const orange = this.PALETTES.chicken.orange;
    const red = this.PALETTES.chicken.red;
    const eye = this.PALETTES.chicken.eye;

    // Feet and legs.
    this.drawVoxelBlock(x + 0.2, y + 0.18, 0.22, 0.22, 0.08, orange, base);
    this.drawVoxelBlock(x + 0.58, y + 0.18, 0.22, 0.22, 0.08, orange, base);
    this.drawVoxelBlock(x + 0.27, y + 0.27, 0.1, 0.1, 0.22, orange, base + 0.04);
    this.drawVoxelBlock(x + 0.63, y + 0.27, 0.1, 0.1, 0.22, orange, base + 0.04);

    // Body and small wing blocks.
    this.drawVoxelBlock(x + 0.18, y + 0.18, 0.64, 0.58, 0.48, white, base + 0.2);
    this.drawVoxelBlock(x + 0.08, y + 0.31, 0.2, 0.3, 0.24, white, base + 0.31);
    this.drawVoxelBlock(x + 0.72, y + 0.31, 0.2, 0.3, 0.24, white, base + 0.31);

    let headX = x + 0.29;
    let headY = y + 0.48;
    if (facing.dy < 0) headY = y + 0.02;
    if (facing.dx > 0) {
      headX = x + 0.5;
      headY = y + 0.28;
    } else if (facing.dx < 0) {
      headX = x + 0.04;
      headY = y + 0.28;
    }
    this.drawVoxelBlock(headX, headY, 0.44, 0.42, 0.4, white, base + 0.61);

    // Direction-relative face center and front projection.
    let beakX = headX + 0.1;
    let beakY = headY + 0.34;
    let beakWidth = 0.24;
    let beakDepth = 0.18;
    if (facing.dy < 0) beakY = headY - 0.12;
    if (facing.dx > 0) {
      beakX = headX + 0.35;
      beakY = headY + 0.11;
      beakWidth = 0.18;
      beakDepth = 0.24;
    } else if (facing.dx < 0) {
      beakX = headX - 0.09;
      beakY = headY + 0.11;
      beakWidth = 0.18;
      beakDepth = 0.24;
    }
    this.drawVoxelBlock(beakX, beakY, beakWidth, beakDepth, 0.16, orange, base + 0.74);
    this.drawVoxelBlock(beakX + 0.07, beakY + 0.02, 0.1, 0.1, 0.16, red, base + 0.61);

    // Comb and eyes complete the silhouette and recognizable face.
    this.drawVoxelBlock(headX + 0.12, headY + 0.11, 0.2, 0.18, 0.18, red, base + 1.01);
    if (facing.dx === 0) {
      const eyeY = facing.dy < 0 ? headY : headY + 0.31;
      this.drawVoxelBlock(headX + 0.04, eyeY, 0.08, 0.08, 0.08, eye, base + 0.86);
      this.drawVoxelBlock(headX + 0.31, eyeY, 0.08, 0.08, 0.08, eye, base + 0.86);
    } else {
      const eyeX = facing.dx > 0 ? headX + 0.34 : headX;
      this.drawVoxelBlock(eyeX, headY + 0.08, 0.08, 0.08, 0.08, eye, base + 0.86);
      this.drawVoxelBlock(eyeX, headY + 0.28, 0.08, 0.08, 0.08, eye, base + 0.86);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Renderer;
}
