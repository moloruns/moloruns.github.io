ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  var generatorApi;
  eval('(function () {\n' + readUtf8(root + '/generator.js') + '\n;generatorApi = {' +
    'config: GRASS_DECORATION_CONFIG,' +
    'generateGrass: generateGrass,' +
    'generateGrassDecorations: generateGrassDecorations,' +
    'getReservedRouteCells: getReservedRouteCells,' +
    'repairGrassDecorations: repairGrassDecorations,' +
    'validateGrassRoute: validateGrassRoute' +
  '};\n})();');

  const config = generatorApi.config;
  const generateGrass = generatorApi.generateGrass;
  const generateGrassDecorations = generatorApi.generateGrassDecorations;
  const getReservedRouteCells = generatorApi.getReservedRouteCells;
  const repairGrassDecorations = generatorApi.repairGrassDecorations;
  const validateGrassRoute = generatorApi.validateGrassRoute;

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function canonical(value) {
    return JSON.stringify(value);
  }

  function independentlyHasRoute(rows, minX, maxX) {
    const ordered = rows.slice().sort(function (left, right) { return left.y - right.y; });
    const blocked = new Set();
    ordered.forEach(function (row) {
      row.decorations.forEach(function (record) {
        if (record.blocking === true) blocked.add(record.x + ':' + row.y);
      });
    });

    const firstY = ordered[0].y;
    const lastY = ordered[ordered.length - 1].y;
    const queue = [];
    const visited = new Set();
    for (let x = minX; x <= maxX; x++) {
      const key = x + ':' + firstY;
      if (!blocked.has(key)) {
        queue.push({ x: x, y: firstY });
        visited.add(key);
      }
    }

    for (let index = 0; index < queue.length; index++) {
      const cell = queue[index];
      if (cell.y === lastY) return true;
      const neighbors = [
        { x: cell.x - 1, y: cell.y },
        { x: cell.x + 1, y: cell.y },
        { x: cell.x, y: cell.y - 1 },
        { x: cell.x, y: cell.y + 1 }
      ];
      neighbors.forEach(function (neighbor) {
        if (neighbor.x < minX || neighbor.x > maxX ||
            neighbor.y < firstY || neighbor.y > lastY) return;
        const key = neighbor.x + ':' + neighbor.y;
        if (!blocked.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push(neighbor);
        }
      });
    }
    return false;
  }

  const seenTypes = new Set();
  for (let seed = 0; seed < 128; seed++) {
    const forward = new Map();
    const reverse = new Map();

    for (let y = -12; y <= 12; y++) {
      forward.set(y, generateGrass(y, seed, forward));
    }
    for (let y = 12; y >= -12; y--) {
      reverse.set(y, generateGrass(y, seed, reverse));
    }

    const forwardRows = [];
    for (let y = -12; y <= 12; y++) {
      const row = forward.get(y);
      const reverseRow = reverse.get(y);
      forwardRows.push(row);
      assert(canonical(row.decorations) === canonical(reverseRow.decorations),
        'Forward/reverse generation changed decorations for seed ' + seed + ', y ' + y);
      assert(Object.isFrozen(row.decorations), 'Decoration array is mutable');

      let blockingCount = 0;
      let groundCount = 0;
      const occupied = new Set();
      const reserved = getReservedRouteCells(seed, y);
      row.decorations.forEach(function (record) {
        seenTypes.add(record.type);
        assert(Object.isFrozen(record), 'Decoration record is mutable');
        assert(Number.isInteger(record.x) && record.x >= -15 && record.x <= 15,
          'Decoration x is outside the integer placement span');
        assert(record.y === y, 'Decoration is not owned by its row');
        assert(!occupied.has(record.x), 'Duplicate decoration coordinate');
        occupied.add(record.x);

        if (record.blocking) {
          blockingCount++;
          assert(record.type === 'TREE' || record.type === 'ROCK',
            'Unknown blocking decoration type');
          assert(!reserved.has(record.x), 'Blocking prop entered reserved corridor');
          assert(!(y >= -2 && y <= 2 && record.x >= -2 && record.x <= 2),
            'Blocking prop entered Starting_Area');
        } else {
          groundCount++;
          assert(record.type === 'FLOWER' || record.type === 'GRASS_TUFT',
            'Unknown ground decoration type');
        }
      });
      assert(groundCount >= 2 && groundCount <= 8 && groundCount <= 10,
        'Ground decoration count is outside target/cap');
      assert(blockingCount >= 1 && blockingCount <= 4 && blockingCount <= 6,
        'Blocking decoration count is outside target/cap');
    }

    assert(validateGrassRoute(forward),
      'Generator route validator rejected seed ' + seed);
    assert(independentlyHasRoute(forwardRows, -15, 15),
      'Independent four-neighbor search found no route for seed ' + seed);
  }

  ['FLOWER', 'GRASS_TUFT', 'TREE', 'ROCK'].forEach(function (type) {
    assert(seenTypes.has(type), 'Generated seeds never produced ' + type);
  });

  const barrier = [];
  for (let x = -15; x <= 15; x++) {
    barrier.push({
      id: 'barrier:' + x,
      type: 'TREE',
      x: x,
      y: 40,
      blocking: true,
      variant: 0,
      paletteIndex: 0
    });
  }
  assert(!validateGrassRoute([{ y: 40, type: 'GRASS', decorations: barrier }]),
    'Route validator accepted a fully blocked boundary');
  const repairedA = repairGrassDecorations(40, 'repair-seed', barrier, null);
  const repairedB = repairGrassDecorations(40, 'repair-seed', barrier, null);
  assert(validateGrassRoute([{ y: 40, type: 'GRASS', decorations: repairedA }]),
    'Deterministic repair did not restore a route');
  assert(canonical(repairedA) === canonical(repairedB),
    'Blocker repair order is not deterministic');
  assert(repairedA.length < barrier.length,
    'Repair did not remove a blocking record');

  const originalRandom = Math.random;
  let randomCalls = 0;
  Math.random = function () {
    randomCalls++;
    throw new Error('Grass decoration consumed gameplay randomness');
  };
  try {
    generateGrassDecorations(7, 'rng-isolation');
  } finally {
    Math.random = originalRandom;
  }
  assert(randomCalls === 0, 'Grass decoration advanced Math.random');

  const defaultRowA = generateGrass(9);
  const defaultRowB = generateGrass(9);
  assert(canonical(defaultRowA.decorations) === canonical(defaultRowB.decorations),
    'Backward-compatible default seed is unstable');
  assert(config.maxGroundLimit === 10 && config.maxBlockingLimit === 6,
    'Hard decoration limits changed');

  return 'PASS: 128 seeds, immutable bounded records, Starting_Area safety, ' +
    'forward/reverse stability, independent route BFS, deterministic repair, RNG isolation';
}
