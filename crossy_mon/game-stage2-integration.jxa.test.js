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
    function sequenceRandom(values, fallback) {
      var index = 0;
      return function () {
        return index < values.length ? values[index++] : fallback;
      };
    }
    function countedRandom(values, fallback) {
      var random = sequenceRandom(values, fallback);
      random.calls = 0;
      return function () {
        random.calls++;
        countedRandom.lastCalls = random.calls;
        return random();
      };
    }
    function row(y, type, obstacles, platforms, decorations, metadata) {
      return {
        y: y,
        type: type,
        obstacles: obstacles || [],
        platforms: platforms || [],
        decorations: decorations || [],
        metadata: metadata || {}
      };
    }

    var originalGenerateClouds = generateClouds;
    var cloudGenerationCalls = 0;
    generateClouds = function (seed) {
      cloudGenerationCalls++;
      return originalGenerateClouds(seed);
    };

    var gameplayRandomCalls = 0;
    var game = new Game({
      visualSeed: 'task-30.1-seed',
      random: function () { gameplayRandomCalls++; return 0; }
    });
    assert(game.visualSeed === 'task-30.1-seed', 'Game did not retain the supplied Visual_Seed');
    assert(cloudGenerationCalls === 1, 'Cloud descriptors were not generated exactly once at initialization');
    assert(Object.isFrozen(game.clouds) && game.clouds.length >= 2 && game.clouds.length <= 5,
      'Game did not retain the bounded immutable Cloud descriptor set');

    var callsBeforeGrass = gameplayRandomCalls;
    var grass = game.createTerrainRow(2);
    assert(gameplayRandomCalls === callsBeforeGrass,
      'Grass decoration generation advanced the gameplay random source');
    assert(Object.isFrozen(grass.decorations), 'Grass Decoration_Records are not immutable');
    assert(grass.decorations.every(function (decoration) {
      return decoration.y === 2;
    }), 'Grass decoration was not owned by its creation row');

    game.random = sequenceRandom([0.5], 0);
    var road = game.createTerrainRow(30);
    assert(road.type === 'ROAD' && road.obstacles.length >= 2,
      'Controlled row creation did not produce a road');
    road.obstacles.forEach(function (car, ordinal) {
      assert(car.visual && Object.isFrozen(car.visual),
        'Car did not receive immutable visual metadata at row creation');
      assert(car.visual.id === 'road:30:car:' + ordinal,
        'Car visual ID was not stable by row and ordinal');
    });
    assert(Object.isFrozen(road.decorations) && road.decorations.length === 0,
      'Non-grass row did not receive a compatible empty decoration collection');

    game.random = sequenceRandom([0.8], 0);
    var river = game.createTerrainRow(31);
    assert(river.type === 'RIVER' && river.platforms.length === 5,
      'Controlled row creation did not produce a river');
    river.platforms.forEach(function (platform, ordinal) {
      var expectedKind = platform.type === 'LOG' ? 'log' : 'lily-pad';
      assert(platform.visual && Object.isFrozen(platform.visual),
        'Platform did not receive immutable visual metadata at row creation');
      assert(platform.visual.id === 'river:31:' + expectedKind + ':' + ordinal,
        'Platform visual ID was not stable by row, type, and ordinal');
    });

    var roadAgain = game.attachStage2RowData(generateRoad(30, function () { return 0; }));
    var roadRepeat = game.attachStage2RowData(generateRoad(30, function () { return 0; }));
    assert(JSON.stringify(roadAgain.obstacles.map(function (car) { return car.visual; })) ===
      JSON.stringify(roadRepeat.obstacles.map(function (car) { return car.visual; })),
      'Equivalent row creation did not reproduce stable entity visuals');

    var track = generateTrainTrack(40, function () { return 0; });
    track.metadata.trainState = 'WARNING';
    track.metadata.warningElapsed = TRAIN_TRACK_CONFIG.warningDuration - 1;
    game.world.terrainRows.clear();
    game.world.addTerrainRow(track);
    var activationCalls = 0;
    game.random = sequenceRandom([0.75, 0.25, 0.5], 0);
    var activationRandom = game.random;
    game.random = function () { activationCalls++; return activationRandom(); };
    game.updateMovingEntities(1);
    assert(activationCalls === 3,
      'Train visual metadata perturbed the three lifecycle activation RNG samples');
    assert(track.obstacles.length === 1 && track.obstacles[0].visual &&
      track.obstacles[0].visual.id === 'track:40:train:0',
      'First activated train did not receive event-indexed visual metadata');

    track.obstacles[0].x = TRAIN_TRACK_CONFIG.worldEdge + 1;
    game.updateMovingEntities(1);
    assert(track.metadata.completedEvents === 1 && track.metadata.trainState === 'IDLE',
      'First train event did not complete normally');
    track.metadata.trainState = 'WARNING';
    track.metadata.warningElapsed = TRAIN_TRACK_CONFIG.warningDuration - 1;
    track.metadata.warningLightOn = true;
    track.obstacles = [];
    activationCalls = 0;
    game.random = sequenceRandom([0.25, 0.5, 0.75], 0);
    activationRandom = game.random;
    game.random = function () { activationCalls++; return activationRandom(); };
    game.updateMovingEntities(1);
    assert(activationCalls === 3 && track.obstacles[0].visual.id === 'track:40:train:1',
      'Successive train did not use completedEvents without extra lifecycle RNG');

    var renderCalls = [];
    game.world.terrainRows.clear();
    game.world.addTerrainRow(game.attachStage2RowData(row(12, 'ROAD', [
      { x: 4, y: 12, width: 2, velocity: 0.01, type: 'CAR' }
    ], [], [
      { id: 'rock:12:-2', type: 'ROCK', x: -2, y: 12, blocking: true, variant: 0, paletteIndex: 0 }
    ])));
    game.world.addTerrainRow(game.attachStage2RowData(row(11, 'TRAIN_TRACK', [
      { x: 0, y: 11, width: 8, velocity: -0.03, type: 'TRAIN' }
    ], [], [], { warningLightOn: false, completedEvents: 2 })));
    game.world.addTerrainRow(game.attachStage2RowData(row(10, 'GRASS', [], [], [
      { id: 'tree:10:1', type: 'TREE', x: 1, y: 10, blocking: true, variant: 1, paletteIndex: 1 },
      { id: 'flower:10:2', type: 'FLOWER', x: 2, y: 10, blocking: false, variant: 0, paletteIndex: 0 }
    ])));
    game.world.addTerrainRow(game.attachStage2RowData(row(8, 'RIVER', [], [
      { x: -3, y: 8, width: 4, velocity: 0.005, type: 'LOG' },
      { x: 3, y: 8, width: 3, velocity: -0.005, type: 'LILY_PAD' }
    ])));

    game.renderer.clear = function () {};
    game.renderer.centerCameraOnPlayer = function () {};
    game.renderer.drawCloud = function (cloud) { renderCalls.push('cloud:' + cloud.id); };
    game.renderer.drawTerrainSlab = function (type, x, y) { renderCalls.push('terrain:' + y); };
    game.renderer.drawTrainTrackDetails = function () {};
    game.renderer.drawWarningSignal = function () {};
    game.renderer.drawGrassDecoration = function (decoration) {
      renderCalls.push('low:' + decoration.type + ':' + decoration.y + ':' + decoration.x);
    };
    game.renderer.drawVoxelCar = function (entity) {
      renderCalls.push('scene:CAR:' + entity.y + ':' + entity.x);
    };
    game.renderer.drawVoxelTrain = function (entity) {
      renderCalls.push('scene:TRAIN:' + entity.y + ':' + entity.x);
    };
    game.renderer.drawVoxelLog = function (entity) {
      renderCalls.push('scene:LOG:' + entity.y + ':' + entity.x);
    };
    game.renderer.drawVoxelLilyPad = function (entity) {
      renderCalls.push('scene:LILY_PAD:' + entity.y + ':' + entity.x);
    };
    game.renderer.drawBlockingProp = function (entity) {
      renderCalls.push('scene:' + entity.type + ':' + entity.y + ':' + entity.x);
    };
    game.renderer.drawEntity = function () {
      throw new Error('Known Stage 2 entity used the legacy flat render path');
    };
    game.renderer.drawGroundShadow = function () { renderCalls.push('player-shadow'); };
    game.renderer.drawVoxelChicken = function () { renderCalls.push('player-chicken'); };

    var cloudReference = game.clouds;
    game.render();
    game.render();
    assert(game.clouds === cloudReference && cloudGenerationCalls === 1,
      'Render regenerated or replaced immutable Cloud descriptors');

    var firstCloud = renderCalls.findIndex(function (entry) { return entry.indexOf('cloud:') === 0; });
    var firstTerrain = renderCalls.findIndex(function (entry) { return entry.indexOf('terrain:') === 0; });
    var firstLow = renderCalls.findIndex(function (entry) { return entry.indexOf('low:') === 0; });
    var firstScene = renderCalls.findIndex(function (entry) { return entry.indexOf('scene:') === 0; });
    var firstPlayer = renderCalls.indexOf('player-shadow');
    assert(firstCloud >= 0 && firstCloud < firstTerrain && firstTerrain < firstLow &&
      firstLow < firstScene && firstScene < firstPlayer,
      'Game render phases did not preserve Cloud, Terrain, low, scene, Player order');

    var firstFrameScene = renderCalls.filter(function (entry) {
      return entry.indexOf('scene:') === 0;
    }).slice(0, 6);
    assert(firstFrameScene.join(',') === [
      'scene:ROCK:12:-2',
      'scene:CAR:12:4',
      'scene:TRAIN:11:0',
      'scene:TREE:10:1',
      'scene:LOG:8:-3',
      'scene:LILY_PAD:8:3'
    ].join(','), 'Moving entities and Blocking_Props were not stably depth sorted');
    assert(renderCalls.indexOf('player-chicken') > firstScene,
      'Stage 1 Player rendering no longer follows world scene rendering');
  `;

  var __stack = [];
  var __context = {
    fillStyle: '', globalAlpha: 1, font: '', textAlign: '',
    clearRect: function () {}, fillRect: function () {}, fillText: function () {},
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    closePath: function () {}, fill: function () {},
    save: function () {
      __stack.push({ fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
    },
    restore: function () {
      var state = __stack.pop();
      this.fillStyle = state.fillStyle;
      this.globalAlpha = state.globalAlpha;
    }
  };
  var __canvas = {
    width: 800,
    height: 600,
    getContext: function () { return __context; }
  };
  var console = { log: function () {}, error: function () {} };
  var document = {
    getElementById: function (id) { return id === 'gameCanvas' ? __canvas : null; }
  };
  var performance = { now: function () { return 0; } };
  var requestAnimationFrame = function () { return 1; };
  var window = {
    document: document,
    performance: performance,
    requestAnimationFrame: requestAnimationFrame,
    addEventListener: function () {},
    removeEventListener: function () {}
  };

  eval(source + '\n' + assertions);
  return 'PASS: Task 30.1 visual seed, creation-time data, train metadata, voxel paths, and scene phases';
}
