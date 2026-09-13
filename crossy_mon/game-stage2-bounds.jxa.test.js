ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const scripts = [
    'player.js', 'world.js', 'generator.js', 'collision.js',
    'renderer.js', 'input.js', 'game.js'
  ];
  const source = scripts.map(function (script) {
    return readUtf8(root + '/' + script);
  }).join('\n;\n');

  const assertions = `
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }
    function row(y, decorations, obstacles, platforms) {
      return {
        y: y,
        type: 'GRASS',
        decorations: decorations || [],
        obstacles: obstacles || [],
        platforms: platforms || [],
        metadata: {}
      };
    }
    function decoration(type, x, y, blocking, ordinal) {
      return {
        id: y + ':' + x + ':' + type + ':' + ordinal,
        type: type,
        x: x,
        y: y,
        blocking: blocking,
        variant: 0,
        paletteIndex: 0
      };
    }

    assert(GAMEPLAY_CONFIG.maxFrameDelta === 100,
      'The existing 100ms frame delta clamp changed');
    assert(GAMEPLAY_CONFIG.maxRetainedRows === 36,
      'The retained-world hard ceiling is not 36 rows');
    assert(STAGE2_WORKLOAD_CONFIG.maxGroundDecorationsPerRow === 10 &&
      STAGE2_WORKLOAD_CONFIG.maxBlockingPropsPerRow === 6 &&
      STAGE2_WORKLOAD_CONFIG.maxCloudsPerFrame === 5,
      'Stage 2 workload caps do not match the specification');

    // Generation enforces independent storage caps for every sampled seed.
    for (var seed = 0; seed < 100; seed++) {
      var generated = generateGrass(seed - 50, 'task-30.2-' + seed);
      var generatedGround = generated.decorations.filter(function (record) {
        return record.blocking === false;
      }).length;
      var generatedBlocking = generated.decorations.filter(function (record) {
        return record.blocking === true;
      }).length;
      assert(generatedGround <= 10 && generatedBlocking <= 6,
        'Generated grass exceeded decoration caps for seed ' + seed);
    }

    var game = new Game({ random: function () { return 0; } });
    var expectedRows = GAMEPLAY_CONFIG.rowsBehind + GAMEPLAY_CONFIG.rowsAhead + 1;
    assert(expectedRows === 36, 'Configured retained window is not 36 rows');

    for (var playerY = 0; playerY <= 200; playerY++) {
      game.ensureTerrainAroundPlayer(playerY);
      game.cleanupOldTerrain(playerY);
      assert(game.world.terrainRows.size === 36,
        'Forward traversal retained ' + game.world.terrainRows.size + ' rows at ' + playerY);
    }
    for (var reverseY = 199; reverseY >= -50; reverseY--) {
      game.ensureTerrainAroundPlayer(reverseY);
      game.cleanupOldTerrain(reverseY);
      assert(game.world.terrainRows.size === 36,
        'Reverse traversal retained ' + game.world.terrainRows.size + ' rows at ' + reverseY);
    }

    // Malformed externally-added rows are also reduced to the hard ceiling.
    game.world.addTerrainRow(row(10000));
    game.world.addTerrainRow(row(-10000));
    game.cleanupOldTerrain(-50);
    assert(game.world.terrainRows.size <= GAMEPLAY_CONFIG.maxRetainedRows,
      'Defensive cleanup allowed more than 36 rows');

    // Decoration lifetime is exactly the lifetime of the owning row.
    var ownedDecorations = Object.freeze([
      Object.freeze(decoration('TREE', 0, 400, true, 0))
    ]);
    var ownedRow = row(400, ownedDecorations);
    game.world.addTerrainRow(ownedRow);
    assert(game.world.getDecorationsAt(400) === ownedDecorations,
      'World did not return the owning row decoration array');
    game.world.removeTerrainRow(400);
    assert(!game.world.terrainRows.has(400) && game.world.getDecorationsAt(400).length === 0,
      'Removing terrain did not remove access to its row-owned decorations');

    game.world.terrainRows.clear();
    game.player.x = 0;
    game.player.y = 0;
    game.renderer.centerCameraOnPlayer(0, 0);
    assert(game.renderer.isWorldFootprintVisible(0, 0, 1, 1, {
      elevation: game.renderer.TERRAIN_HEIGHT,
      height: 1,
      margin: STAGE2_WORKLOAD_CONFIG.cullMarginPixels
    }), 'A centered Stage 2 footprint was incorrectly culled');
    assert(!game.renderer.isWorldFootprintVisible(1000, 1000, 1, 1, {
      elevation: game.renderer.TERRAIN_HEIGHT,
      height: 1,
      margin: STAGE2_WORKLOAD_CONFIG.cullMarginPixels
    }), 'A distant Stage 2 footprint was not culled');

    var denseDecorations = [];
    for (var groundIndex = 0; groundIndex < 12; groundIndex++) {
      denseDecorations.push(decoration(
        groundIndex % 2 === 0 ? 'FLOWER' : 'GRASS_TUFT',
        groundIndex - 6,
        0,
        false,
        groundIndex
      ));
    }
    for (var blockerIndex = 0; blockerIndex < 8; blockerIndex++) {
      denseDecorations.push(decoration(
        blockerIndex % 2 === 0 ? 'TREE' : 'ROCK',
        blockerIndex - 4,
        0,
        true,
        blockerIndex
      ));
    }
    denseDecorations.push(decoration('FLOWER', 1000, 1000, false, 99));
    denseDecorations.push(decoration('TREE', 1000, 1000, true, 100));

    var denseRow = row(0, denseDecorations, [
      { x: 0, y: 0, width: 2, velocity: 0.01, type: 'CAR' },
      { x: 1000, y: 1000, width: 2, velocity: 0.01, type: 'CAR' }
    ], [
      { x: -2, y: 0, width: 3, velocity: 0.005, type: 'LOG' },
      { x: 1000, y: 1000, width: 3, velocity: 0.005, type: 'LOG' }
    ]);
    game.world.addTerrainRow(denseRow);
    var worldBeforeRender = clone(Array.from(game.world.terrainRows.values()));
    var lowDraws = 0;
    var blockerDraws = 0;
    var carDraws = 0;
    var platformDraws = 0;
    game.renderer.drawGrassDecoration = function () { lowDraws++; };
    game.renderer.drawBlockingProp = function () { blockerDraws++; };
    game.renderer.drawVoxelCar = function () { carDraws++; };
    game.renderer.drawVoxelLog = function () { platformDraws++; };
    game.renderLowDecorations();
    game.renderObstaclesAndPlatforms();
    assert(lowDraws === 10,
      'Render drew ' + lowDraws + ' ground decorations instead of the cap of 10');
    assert(blockerDraws === 6,
      'Render drew ' + blockerDraws + ' blockers instead of the cap of 6');
    assert(carDraws === 1 && platformDraws === 1,
      'Off-canvas moving Stage 2 items were not culled');
    assert(JSON.stringify(Array.from(game.world.terrainRows.values())) ===
      JSON.stringify(worldBeforeRender),
      'Render-time culling or caps modified World records');

    var cloudDraws = 0;
    var excessClouds = [];
    for (var cloudIndex = 0; cloudIndex < 8; cloudIndex++) {
      excessClouds.push({ id: 'cloud:' + cloudIndex });
    }
    var cloudReference = excessClouds;
    var cloudsBeforeRender = clone(excessClouds);
    game.clouds = excessClouds;
    game.renderer.drawCloud = function () { cloudDraws++; };
    game.renderClouds();
    assert(cloudDraws === 5, 'Render drew ' + cloudDraws + ' Clouds instead of at most 5');
    assert(game.clouds === cloudReference &&
      JSON.stringify(game.clouds) === JSON.stringify(cloudsBeforeRender),
      'Cloud draw capping replaced or modified descriptors');

    var observedDelta = null;
    game.update = function (deltaTime) { observedDelta = deltaTime; };
    game.render = function () {};
    game.gameState.lastFrameTime = 0;
    game.gameLoop(5000);
    assert(observedDelta === 100,
      'A delayed frame was not clamped to the preserved 100ms maximum');
  `;

  var __context = {
    fillStyle: '', globalAlpha: 1, font: '', textAlign: '',
    clearRect: function () {}, fillRect: function () {}, fillText: function () {},
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    closePath: function () {}, fill: function () {},
    save: function () {}, restore: function () {}
  };
  var __canvas = {
    width: 800,
    height: 600,
    getContext: function () { return __context; }
  };
  var __frames = [];
  var console = { log: function () {}, error: function () {} };
  var document = {
    getElementById: function (id) { return id === 'gameCanvas' ? __canvas : null; }
  };
  var performance = { now: function () { return 0; } };
  var requestAnimationFrame = function (callback) {
    __frames.push(callback);
    return __frames.length;
  };
  var window = {
    document: document,
    performance: performance,
    requestAnimationFrame: requestAnimationFrame,
    addEventListener: function () {},
    removeEventListener: function () {}
  };

  eval(source + '\n' + assertions);
  return 'PASS: 36-row retention, row-owned cleanup, Stage 2 culling, decoration/Cloud caps, render purity, and 100ms clamp';
}
