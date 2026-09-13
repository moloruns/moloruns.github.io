'use strict';

function executeVisualDataTests(api) {
  'use strict';

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message + '\nExpected: ' + expected + '\nActual: ' + actual);
    }
  }

  function assertDeepEqual(actual, expected, message) {
    var actualJson = JSON.stringify(actual);
    var expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
      throw new Error(message + '\nExpected: ' + expectedJson + '\nActual: ' + actualJson);
    }
  }

  function assertThrows(callback, message) {
    var threw = false;
    try {
      callback();
    } catch (error) {
      threw = true;
    }
    assert(threw, message);
  }

  function seededRandom(seed) {
    var state = seed >>> 0;
    return function next() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  var passed = 0;
  function test(name, callback) {
    callback();
    passed++;
  }

  test('visual hashes are stable unsigned values and channels remain separate', function () {
    var first = api.visualHash('stage-2', 'car-palette', 12, -3, 2);
    var repeated = api.visualHash('stage-2', 'car-palette', 12, -3, 2);
    var otherChannel = api.visualHash('stage-2', 'car-model', 12, -3, 2);

    assertEqual(first, repeated, 'Equal visual inputs must have equal hashes');
    assert(Number.isInteger(first), 'Visual hash must be an integer');
    assert(first >= 0 && first <= 0xffffffff, 'Visual hash must be unsigned 32-bit');
    assert(first !== otherChannel, 'Independent visual channels should be separated');

    var unit = api.visualUnit('stage-2', 'unit', -4, 8, 1);
    assert(unit >= 0 && unit < 1, 'Visual unit must be in [0, 1)');
  });

  test('entity visual metadata is stable, type-specific, and immutable', function () {
    var cases = [
      { type: 'CAR', paletteCount: 6 },
      { type: 'TRAIN', paletteCount: 3 },
      { type: 'LOG', paletteCount: 3 },
      { type: 'LILY_PAD', paletteCount: 4 }
    ];

    cases.forEach(function (entry) {
      var first = api.createEntityVisual('visual-seed', 14, entry.type, 2, 5);
      var repeated = api.createEntityVisual('visual-seed', 14, entry.type, 2, 5);

      assertDeepEqual(first, repeated, entry.type + ' metadata must be deterministic');
      assert(Object.isFrozen(first), entry.type + ' metadata must be frozen');
      assert(first.paletteIndex >= 0 && first.paletteIndex < entry.paletteCount,
        entry.type + ' palette index is out of range');
      assert(first.modelVariant >= 0 && first.modelVariant < 3,
        entry.type + ' model variant is out of range');
      assertThrows(function () {
        first.paletteIndex = 99;
      }, entry.type + ' metadata accepted mutation');
    });

    assertEqual(
      typeof api.createEntityVisual('visual-seed', 14, 'lily_pad', 2).hasFlowerAccent,
      'boolean',
      'Lily-pad metadata must include a deterministic flower accent flag'
    );
  });

  test('coordinates, ordinals, and train event indexes produce stable identities', function () {
    var car0 = api.createEntityVisual(123, 8, 'CAR', 0);
    var car1 = api.createEntityVisual(123, 8, 'CAR', 1);
    var carOtherRow = api.createEntityVisual(123, 9, 'CAR', 0);
    var train0 = api.createEntityVisual(123, 8, 'TRAIN', 0, 0);
    var train1 = api.createEntityVisual(123, 8, 'TRAIN', 0, 1);

    assert(car0.id !== car1.id, 'Entity ordinal must affect identity');
    assert(car0.id !== carOtherRow.id, 'Row coordinate must affect identity');
    assert(train0.id !== train1.id, 'Train event index must affect identity');
    assertDeepEqual(
      train1,
      api.createEntityVisual(123, 8, 'TRAIN', 0, 1),
      'Train event metadata must be repeatable'
    );
  });

  test('Cloud descriptors are deterministic, immutable, and within bounds', function () {
    for (var seed = 0; seed < 50; seed++) {
      var clouds = api.generateClouds(seed);
      var repeated = api.generateClouds(seed);

      assertDeepEqual(clouds, repeated, 'Cloud generation must be deterministic');
      assert(Object.isFrozen(clouds), 'Cloud descriptor array must be frozen');
      assert(clouds.length >= 2 && clouds.length <= 5,
        'Cloud count must be between two and five');

      clouds.forEach(function (cloud) {
        assert(Object.isFrozen(cloud), 'Each Cloud descriptor must be frozen');
        assert(cloud.formCount >= 3 && cloud.formCount <= 6,
          'Cloud form count must be between three and six');
        assert(cloud.opacity >= 0.18 && cloud.opacity <= 0.35,
          'Cloud opacity must be between 0.18 and 0.35');
        assert(cloud.anchorX >= 0.08 && cloud.anchorX <= 0.92,
          'Cloud horizontal anchor must remain normalized');
        assert(cloud.anchorY >= 0.06 && cloud.anchorY <= 0.28,
          'Cloud vertical anchor must remain in the background band');
        assert(cloud.scale >= 0.8 && cloud.scale <= 1.25,
          'Cloud scale must remain bounded');
      });
    }
  });

  test('visual generation neither calls Math.random nor perturbs gameplay RNG', function () {
    var originalRandom = Math.random;
    Math.random = function () {
      throw new Error('Visual generation must not call Math.random');
    };

    try {
      api.visualHash('isolated', 'hash', 1, 2, 3);
      api.createEntityVisual('isolated', 7, 'CAR', 1);
      api.createEntityVisual('isolated', 7, 'TRAIN', 0, 4);
      api.createEntityVisual('isolated', 7, 'LOG', 2);
      api.createEntityVisual('isolated', 7, 'LILY_PAD', 3);
      api.generateClouds('isolated');
    } finally {
      Math.random = originalRandom;
    }

    var baselineRoad = api.generateRoad(11, seededRandom(98765));
    var gameplayRandom = seededRandom(98765);
    api.createEntityVisual('isolated', 11, 'CAR', 0);
    api.generateClouds('isolated');
    var roadAfterVisualGeneration = api.generateRoad(11, gameplayRandom);

    assertDeepEqual(
      roadAfterVisualGeneration,
      baselineRoad,
      'Visual generation changed the injected gameplay-random sequence'
    );
  });

  return passed + ' Task 27.1 visual-data unit tests passed.';
}

if (typeof module !== 'undefined' && module.exports) {
  console.log(executeVisualDataTests(require('./generator.js')));
} else {
  ObjC.import('Foundation');
}

function readUtf8(filePath) {
  var data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) {
    throw new Error('Unable to read ' + filePath);
  }
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  var root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  var generatorSource = readUtf8(root + '/generator.js');
  var invocation = '\n;(' + executeVisualDataTests.toString() + ')({' +
    'createEntityVisual:createEntityVisual,' +
    'generateClouds:generateClouds,' +
    'generateRoad:generateRoad,' +
    'visualHash:visualHash,' +
    'visualUnit:visualUnit' +
    '});';
  return eval(generatorSource + invocation);
}
