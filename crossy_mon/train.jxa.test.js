ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const source = ['generator.js', 'collision.js', 'renderer.js'].map(function (file) {
    return readUtf8(root + '/' + file);
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
    function worldFor(row) {
      return {
        getTerrainAt: function (x, y) { return y === row.y ? row : null; },
        getObstaclesAt: function (x, y) {
          if (y !== row.y) return [];
          return row.obstacles.filter(function (obstacle) {
            return x >= obstacle.x && x < obstacle.x + obstacle.width;
          });
        },
        getPlatformAt: function () { return null; }
      };
    }

    var firstTrack = generateTrainTrack(1, function () { return 0; });
    var secondTrack = generateTrainTrack(2, function () { return 0.75; });
    assert(firstTrack.metadata.idleRemaining !== secondTrack.metadata.idleRemaining,
      'Track idle delays were not independently randomized');
    assert(firstTrack.obstacles.length === 0, 'Train spawned before warning');

    updateTrainTrackLifecycle(firstTrack, TRAIN_TRACK_CONFIG.idleMin, function () { return 0; });
    assert(firstTrack.metadata.trainState === 'WARNING', 'Track did not enter warning');
    assert(firstTrack.metadata.warningLightOn === true, 'Warning did not begin lit');
    updateTrainTrackLifecycle(firstTrack, TRAIN_TRACK_CONFIG.flashInterval, function () { return 0; });
    assert(firstTrack.metadata.warningLightOn === false, 'Warning did not alternate off');
    updateTrainTrackLifecycle(firstTrack, TRAIN_TRACK_CONFIG.flashInterval, function () { return 0; });
    assert(firstTrack.metadata.warningLightOn === true, 'Warning did not alternate back on');
    updateTrainTrackLifecycle(firstTrack,
      TRAIN_TRACK_CONFIG.warningDuration - TRAIN_TRACK_CONFIG.flashInterval * 2 - 1,
      function () { return 0; });
    assert(firstTrack.obstacles.length === 0, 'Train spawned before 3000ms warning completed');

    var eventRandom = sequenceRandom([0.75, 0, 0.999999, 0.25, 0.25, 0.5, 0], 0);
    updateTrainTrackLifecycle(firstTrack, 1, eventRandom);
    assert(firstTrack.metadata.trainState === 'ACTIVE', 'Train did not activate after warning');
    assert(firstTrack.obstacles.length === 1, 'Active event did not contain one train');
    var train = firstTrack.obstacles[0];
    assert(train.width === TRAIN_TRACK_CONFIG.maxWidth, 'Train was not in 7-11 cell range');
    assert(train.velocity === INITIAL_SPEED_RANGES.TRAIN.min, 'Tuned train speed changed');

    var startX = train.x;
    updateTrainTrackLifecycle(firstTrack, 100, eventRandom);
    assert(train.x === startX + train.velocity * 100, 'Train movement is not velocity * time');
    assert(checkCollisions({ x: train.x, y: firstTrack.y }, worldFor(firstTrack)) === 'COLLISION',
      'Occupying train was not lethal');

    var exitTime = ((TRAIN_TRACK_CONFIG.worldEdge - train.x) / train.velocity) + 1;
    updateTrainTrackLifecycle(firstTrack, exitTime, eventRandom);
    assert(firstTrack.metadata.trainState === 'IDLE', 'Passed train did not return to idle');
    assert(firstTrack.obstacles.length === 0, 'Passed train was not removed');
    assert(checkCollisions({ x: 0, y: firstTrack.y }, worldFor(firstTrack)) === 'SAFE',
      'Warning/idle track was incorrectly hazardous');

    updateTrainTrackLifecycle(firstTrack, firstTrack.metadata.idleRemaining, eventRandom);
    assert(firstTrack.metadata.trainState === 'WARNING', 'Lifecycle did not repeat warning');
    updateTrainTrackLifecycle(firstTrack, TRAIN_TRACK_CONFIG.warningDuration, eventRandom);
    assert(firstTrack.metadata.trainState === 'ACTIVE', 'Lifecycle did not repeat active event');

    var fills = [];
    var context = {
      fillStyle: '',
      clearRect: function () {},
      beginPath: function () {},
      moveTo: function () {},
      lineTo: function () {},
      closePath: function () {},
      fill: function () { fills.push(this.fillStyle); }
    };
    var renderer = new Renderer({
      width: 800,
      height: 600,
      getContext: function () { return context; }
    });
    renderer.drawTrainTrackTile(0, 3);
    renderer.drawWarningSignal(-2, 3, true);
    renderer.drawWarningSignal(-2, 3, false);
    assert(fills.indexOf('#6B5B4D') !== -1, 'Track ballast was not drawn');
    assert(fills.indexOf('#4A2C1A') !== -1, 'Track tie was not drawn');
    assert(fills.filter(function (color) { return color === '#C0C0C0'; }).length >= 2,
      'Two rails were not drawn');
    assert(fills.indexOf(renderer.PALETTES.stage2.METAL.top) !== -1 &&
      fills.indexOf(renderer.PALETTES.stage2.SIGNAL_POST.top) !== -1,
      'Voxel signal base, post, or crossbar was not drawn');
    assert(fills.indexOf(renderer.PALETTES.stage2.SIGNAL_LIT.top) !== -1 &&
      fills.indexOf(renderer.PALETTES.stage2.SIGNAL_HOUSING.top) !== -1,
      'Lit and dark voxel signal faces were not drawn');
  `;

  eval(source + '\n' + assertions);
  return 'PASS: train idle/warning/active lifecycle, rendering, movement, repeat, and collisions';
}
