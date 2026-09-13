ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const generatorSource = readUtf8(root + '/generator.js');
  const rendererSource = readUtf8(root + '/renderer.js');

  const assertions = `
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    function seededRandom(seed) {
      var state = seed >>> 0;
      return function () {
        state += 0x6D2B79F5;
        var value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    }

    // Feature: score-scaled-movement-and-side-occlusion,
    // Property 4: Generated platform dimensions match platform kind.
    // **Validates: Requirements 4.1, 4.4, 7.5**
    var propertyCaseCount = 128;
    var generatedRowCount = 0;
    var generatedPlatformCount = 0;
    var lilyCount = 0;
    var logCount = 0;
    var observedLogWidths = {};

    for (var caseIndex = 0; caseIndex < propertyCaseCount; caseIndex++) {
      var rowCount = caseIndex % 2 === 0 ? 2 : 3;
      var firstY = caseIndex % 3 === 0 ? -caseIndex - 3 : caseIndex * 4 + 1;
      var rowYs = [];
      for (var rowOffset = 0; rowOffset < rowCount; rowOffset++) {
        rowYs.push(firstY + rowOffset);
      }

      var spawnScore = (caseIndex * 37) % 501;
      var random = seededRandom(0x4C494C59 + caseIndex * 7919);
      var rows = generateRiverGroup(rowYs, spawnScore, random);

      assert(rows.length === rowCount,
        'Property 4 case ' + caseIndex + ' generated an unexpected row count');

      rows.forEach(function (row, rowIndex) {
        generatedRowCount++;
        assert(row.type === 'RIVER',
          'Property 4 case ' + caseIndex + ', row ' + rowIndex +
          ' was not a River row');
        assert(row.platforms.length === 5,
          'Property 4 case ' + caseIndex + ', row ' + rowIndex +
          ' did not contain five Platforms');

        row.platforms.forEach(function (platform, platformIndex) {
          generatedPlatformCount++;
          var label = 'Property 4 case ' + caseIndex + ', row ' + rowIndex +
            ', Platform ' + platformIndex;

          if (platform.type === 'LILY_PAD') {
            lilyCount++;
            assert(platform.width === 1,
              label + ' Lily width must be exactly 1, got ' + platform.width);
          } else if (platform.type === 'LOG') {
            logCount++;
            observedLogWidths[platform.width] = true;
            assert(Number.isInteger(platform.width),
              label + ' Log width must be an integer, got ' + platform.width);
            assert(platform.width === 3 || platform.width === 4,
              label + ' Log width must be 3 or 4, got ' + platform.width);
          } else {
            throw new Error(label + ' had unsupported kind ' + platform.type);
          }
        });
      });
    }

    assert(generatedRowCount === 320,
      'Property 4 did not exercise the expected 320 River rows');
    assert(generatedPlatformCount === 1600,
      'Property 4 did not exercise the expected 1600 Platforms');
    assert(lilyCount > 0, 'Property 4 generated no Lily Pads');
    assert(logCount > 0, 'Property 4 generated no Logs');
    assert(observedLogWidths[3] === true && observedLogWidths[4] === true,
      'Property 4 did not exercise both valid Log widths');

    // Feature: score-scaled-movement-and-side-occlusion,
    // Property 5: Lily rendering is one-to-one.
    // **Validates: Requirements 4.2, 4.3, 7.6**
    var primitivePaths = [];
    var activePath = null;
    var canvasContext = {
      fillStyle: '',
      globalAlpha: 1,
      beginPath: function () {
        activePath = { points: [], closed: false };
      },
      moveTo: function (x, y) {
        activePath.points.push({ x: x, y: y });
      },
      lineTo: function (x, y) {
        activePath.points.push({ x: x, y: y });
      },
      closePath: function () {
        activePath.closed = true;
      },
      fill: function () {
        primitivePaths.push({
          color: this.fillStyle,
          closed: activePath.closed,
          points: activePath.points.map(function (point) {
            return { x: point.x, y: point.y };
          })
        });
      }
    };
    var canvas = {
      width: 960,
      height: 640,
      getContext: function () { return canvasContext; }
    };
    var renderer = new Renderer(canvas);
    renderer.worldToIso = function (x, y) {
      return { screenX: x, screenY: y };
    };
    renderer.screenToCanvas = function (x, y) {
      return { x: x, y: y };
    };

    function close(actual, expected) {
      return Math.abs(actual - expected) <= 1e-9;
    }

    function polygonArea(points) {
      var twiceArea = 0;
      for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
        var nextPoint = points[(pointIndex + 1) % points.length];
        twiceArea += points[pointIndex].x * nextPoint.y -
          nextPoint.x * points[pointIndex].y;
      }
      return Math.abs(twiceArea) / 2;
    }

    var lilyPropertyCaseCount = 128;
    var renderedLilyCount = 0;
    var observedLilyVariants = {};
    var padPalette = renderer.PALETTES.stage2.LILY_PAD;
    var topElevation = renderer.TERRAIN_HEIGHT + 0.06 + 0.09;

    for (var lilyCaseIndex = 0; lilyCaseIndex < lilyPropertyCaseCount;
      lilyCaseIndex++) {
      primitivePaths.length = 0;
      var collectionSize = 1 + lilyCaseIndex % 5;
      var lilyRandom = seededRandom(0x50414435 + lilyCaseIndex * 104729);

      for (var lilyIndex = 0; lilyIndex < collectionSize; lilyIndex++) {
        var rawVariant = lilyCaseIndex * 7 + lilyIndex * 5 - 11;
        var normalizedVariant = ((rawVariant % 3) + 3) % 3;
        observedLilyVariants[normalizedVariant] = true;
        var lily = {
          x: -14.5 + lilyRandom() * 29,
          y: -30 + lilyRandom() * 60,
          width: 1,
          velocity: (lilyIndex % 2 === 0 ? 1 : -1) *
            (0.0049 + lilyRandom() * 0.0056),
          type: 'LILY_PAD',
          visual: {
            paletteIndex: lilyCaseIndex - lilyIndex * 3,
            modelVariant: rawVariant
          }
        };
        var firstPrimitiveIndex = primitivePaths.length;
        var drawnParts = renderer.drawVoxelLilyPad(lily);
        var entityPaths = primitivePaths.slice(firstPrimitiveIndex);
        var topHexes = entityPaths.filter(function (path) {
          return path.color === padPalette.top;
        });
        var padFaces = entityPaths.filter(function (path) {
          return path.color === padPalette.top || path.color === padPalette.left ||
            path.color === padPalette.right;
        });
        var label = 'Property 5 case ' + lilyCaseIndex + ', Lily ' + lilyIndex;

        assert(drawnParts >= 1, label + ' emitted no Lily rendering');
        assert(topHexes.length === 1,
          label + ' must emit exactly one top hex, got ' + topHexes.length);
        assert(padFaces.length === 7,
          label + ' must emit one top and six side faces, got ' + padFaces.length);

        var topHex = topHexes[0];
        assert(topHex.closed === true,
          label + ' top hex did not close its Canvas path');
        assert(topHex.points.length === 6,
          label + ' top must contain six connected vertices, got ' +
          topHex.points.length);

        var uniqueCorners = {};
        var centerX = 0;
        var centerY = 0;
        topHex.points.forEach(function (point) {
          assert(Number.isFinite(point.x) && Number.isFinite(point.y),
            label + ' top contained a non-finite vertex');
          uniqueCorners[point.x.toFixed(12) + ':' + point.y.toFixed(12)] = true;
          centerX += point.x;
          centerY += point.y;
        });
        centerX /= topHex.points.length;
        centerY /= topHex.points.length;

        assert(Object.keys(uniqueCorners).length === 6,
          label + ' top did not contain six distinct contiguous corners');
        assert(polygonArea(topHex.points) > 0,
          label + ' top hex collapsed to zero area');
        assert(close(centerX, lily.x + 0.5),
          label + ' top was not centered at logical x + 0.5');
        assert(close(centerY,
          lily.y + 0.5 - topElevation * renderer.TILE_HEIGHT),
          label + ' top was not centered at logical y + 0.5 after elevation');
        renderedLilyCount++;
      }

      var collectionTopHexes = primitivePaths.filter(function (path) {
        return path.color === padPalette.top;
      });
      assert(collectionTopHexes.length === collectionSize,
        'Property 5 case ' + lilyCaseIndex + ' emitted ' +
        collectionTopHexes.length + ' top hexes for ' + collectionSize +
        ' Lily entities');
    }

    assert(renderedLilyCount === 381,
      'Property 5 did not exercise the expected 381 Lily entities');
    assert(observedLilyVariants[0] === true && observedLilyVariants[1] === true &&
      observedLilyVariants[2] === true,
      'Property 5 did not exercise all three normalized Lily visual variants');

    // Feature: score-scaled-movement-and-side-occlusion,
    // Property 6: River construction yields an in-span route without retained route state or RNG drift.
    // **Validates: Requirements 4.5, 4.6, 4.9, 4.10, 4.11, 4.12, 4.13, 7.7, 7.11, 7.12, 7.13**
    function riverRandomRole(callIndex) {
      var rowCallIndex = callIndex % 16;
      if (rowCallIndex === 0) return 'direction';
      var platformCallIndex = rowCallIndex - 1;
      var platformIndex = Math.floor(platformCallIndex / 3);
      var roleIndex = platformCallIndex % 3;
      var roles = ['log-width', 'platform-type', 'horizontal-placement'];
      return 'platform[' + platformIndex + '].' + roles[roleIndex];
    }

    function tracedRandom(seed, trace) {
      var random = seededRandom(seed);
      return function () {
        var callIndex = trace.length;
        var value = random();
        trace.push({
          callIndex: callIndex,
          role: riverRandomRole(callIndex),
          value: value
        });
        return value;
      };
    }

    function assertRouteIsValid(rows, route, label) {
      assert(Array.isArray(route), label + ' did not return a route');
      assert(route.length === rows.length,
        label + ' did not return one Platform per row');

      route.forEach(function (platform, rowIndex) {
        var row = rows[rowIndex];
        assert(row.platforms.indexOf(platform) !== -1,
          label + ', row ' + rowIndex + ' returned a non-member Platform');
        assert(platform.y === row.y,
          label + ', row ' + rowIndex + ' returned a Platform from another row');
        assert(platform.x >= -15,
          label + ', row ' + rowIndex + ' crossed the inclusive left bound');
        assert(platform.x + platform.width <= 16,
          label + ', row ' + rowIndex +
          ' crossed the half-open right bound with complete footprint');

        if (rowIndex > 0) {
          var previousInterval = getPlatformSupportInterval(route[rowIndex - 1]);
          var currentInterval = getPlatformSupportInterval(platform);
          assert(previousInterval && currentInterval,
            label + ', row ' + rowIndex + ' had a malformed Support Interval');
          assert(previousInterval.min < currentInterval.max &&
            currentInterval.min < previousInterval.max,
            label + ', rows ' + (rowIndex - 1) + '/' + rowIndex +
            ' had disjoint Support Intervals');
        }
      });
    }

    function assertNoRouteBookkeeping(value, label) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return;
      }
      if (value instanceof Map) {
        value.forEach(function (entry, key) {
          assertNoRouteBookkeeping(key, label + ' Map key');
          assertNoRouteBookkeeping(entry, label + ' Map value');
        });
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(function (entry, index) {
          assertNoRouteBookkeeping(entry, label + '[' + index + ']');
        });
        return;
      }

      Object.keys(value).forEach(function (key) {
        assert(!/(route|anchor|predecessor|candidate|search|plan|riverGroup)/i.test(key),
          label + ' retained Route Bookkeeping field ' + key);
        assertNoRouteBookkeeping(value[key], label + '.' + key);
      });
    }

    function snapshotWorld(world) {
      return JSON.stringify(Array.from(world.terrainRows.entries()));
    }

    function fixturePlatform(x, y, width, type) {
      return {
        x: x,
        y: y,
        width: width,
        velocity: 0.0049,
        type: type
      };
    }

    function fixtureRiverRow(y, platforms) {
      return {
        y: y,
        type: 'RIVER',
        obstacles: [],
        platforms: platforms,
        metadata: { direction: 1, lockedRowSpeed: 0.0049, speed: 0.0049 }
      };
    }

    function runGeneratedRouteCase(caseIndex) {
      var mode = caseIndex % 3;
      var rowCount = caseIndex % 2 === 0 ? 2 : 3;
      var firstY;
      var step;
      if (mode === 0) {
        firstY = -90 + caseIndex * 3;
        step = 1;
      } else if (mode === 1) {
        firstY = 140 - caseIndex * 2;
        step = -1;
      } else {
        firstY = -400 + caseIndex * 5;
        step = 1;
      }

      var rowYs = [];
      for (var rowOffset = 0; rowOffset < rowCount; rowOffset++) {
        rowYs.push(firstY + rowOffset * step);
      }

      var spawnScore = (caseIndex * 53) % 701;
      var routeSeed = (0x524F5554 + caseIndex * 65537) >>> 0;
      var routeTrace = [];
      var baselineTrace = [];
      var rows = generateRiverGroup(
        rowYs,
        spawnScore,
        tracedRandom(routeSeed, routeTrace)
      );
      var baselineRows = rowYs.map(function (rowY) {
        return generateRiver(rowY, spawnScore, tracedBaselineRandom);
      });

      function tracedBaselineRandom() {
        if (!tracedBaselineRandom.random) {
          tracedBaselineRandom.random = tracedRandom(routeSeed, baselineTrace);
        }
        return tracedBaselineRandom.random();
      }

      var label = 'Property 6 case ' + caseIndex;
      var expectedCallCount = rowCount * 16;
      assert(routeTrace.length === expectedCallCount,
        label + ' route generation consumed ' + routeTrace.length +
        ' RNG calls instead of ' + expectedCallCount);
      assert(baselineTrace.length === expectedCallCount,
        label + ' baseline generation consumed ' + baselineTrace.length +
        ' RNG calls instead of ' + expectedCallCount);

      routeTrace.forEach(function (call, callIndex) {
        var baselineCall = baselineTrace[callIndex];
        assert(call.callIndex === baselineCall.callIndex,
          label + ' reordered RNG call ' + callIndex);
        assert(call.role === baselineCall.role,
          label + ' changed RNG membership at call ' + callIndex +
          ': ' + call.role + ' versus ' + baselineCall.role);
        assert(call.value === baselineCall.value,
          label + ' changed RNG value/order at call ' + callIndex);
      });

      rows.forEach(function (row, rowIndex) {
        var baselineRow = baselineRows[rowIndex];
        var replacedPlacementCall = rowIndex * 16 + 9;
        assert(routeTrace[replacedPlacementCall].role ===
          'platform[2].horizontal-placement',
          label + ', row ' + rowIndex +
          ' did not consume the replaced horizontal-placement sample');
        assert(row.metadata.direction === baselineRow.metadata.direction,
          label + ', row ' + rowIndex + ' changed sampled direction');
        assert(row.metadata.lockedRowSpeed === baselineRow.metadata.lockedRowSpeed,
          label + ', row ' + rowIndex + ' changed movement speed');

        row.platforms.forEach(function (platform, platformIndex) {
          var baselinePlatform = baselineRow.platforms[platformIndex];
          assert(platform.type === baselinePlatform.type,
            label + ', row ' + rowIndex + ', Platform ' + platformIndex +
            ' changed sampled type');
          assert(platform.width === baselinePlatform.width,
            label + ', row ' + rowIndex + ', Platform ' + platformIndex +
            ' changed sampled width');
          assert(platform.velocity === baselinePlatform.velocity,
            label + ', row ' + rowIndex + ', Platform ' + platformIndex +
            ' changed movement velocity');
          if (platformIndex === 2) {
            var sampledX = (routeTrace[replacedPlacementCall].value - 0.5) * 0.4;
            assert(Math.abs(baselinePlatform.x - sampledX) <= 1e-12,
              label + ', row ' + rowIndex +
              ' baseline did not use the sampled horizontal placement');
            assert(platform.x === getRiverRouteAnchor(row.y),
              label + ', row ' + rowIndex +
              ' did not use the coordinate-derived route anchor');
          } else {
            assert(platform.x === baselinePlatform.x,
              label + ', row ' + rowIndex + ', Platform ' + platformIndex +
              ' changed an unrelated horizontal placement');
          }
        });
      });

      var rowsBeforeSearch = JSON.stringify(rows);
      var route = findInSpanCrossingRoute(rows);
      assertRouteIsValid(rows, route, label);
      assert(JSON.stringify(rows) === rowsBeforeSearch,
        label + ' route search mutated completed rows or Platforms');

      var world = new World();
      rows.forEach(function (row) { world.addTerrainRow(row); });
      assert(Object.keys(world).length === 1 &&
        Object.keys(world)[0] === 'terrainRows',
        label + ' World retained data outside ordinary terrainRows');
      rows.forEach(function (row) {
        assert(world.getTerrainAt(0, row.y) === row,
          label + ' World did not retain the ordinary completed Terrain Row');
      });
      assertNoRouteBookkeeping(rows, label + ' completed rows');
      assertNoRouteBookkeeping(world, label + ' World');

      var supportPlayer = { x: route[0].x, y: route[0].y };
      var collisionBefore = checkCollisions(supportPlayer, world);
      var movementDelta = 1 + caseIndex % 97;
      var movementBefore = calculateEntityMovement(route[0], movementDelta);
      var wrapFixture = {
        x: route[0].velocity > 0 ? 19.9 : -19.9,
        velocity: route[0].velocity
      };
      var wrapBefore = calculateEntityMovement(wrapFixture, 1000);
      var worldBeforeRepeatSearch = snapshotWorld(world);
      var repeatedRoute = findInSpanCrossingRoute(rows);
      var collisionAfter = checkCollisions(supportPlayer, world);
      var movementAfter = calculateEntityMovement(route[0], movementDelta);
      var wrapAfter = calculateEntityMovement(wrapFixture, 1000);

      assertRouteIsValid(rows, repeatedRoute, label + ' repeated search');
      assert(collisionBefore === 'SAFE' && collisionAfter === collisionBefore,
        label + ' route search changed logical support/collision outcome');
      assert(JSON.stringify(movementAfter) === JSON.stringify(movementBefore),
        label + ' route search changed Platform movement');
      assert(wrapBefore.wrapped === true &&
        JSON.stringify(wrapAfter) === JSON.stringify(wrapBefore),
        label + ' route search changed Platform wrapping');
      assert(snapshotWorld(world) === worldBeforeRepeatSearch,
        label + ' route search changed retained-world state');

      if (mode === 2) {
        var distractionYs = rowCount === 2
          ? [firstY + 1000, firstY + 1001]
          : [firstY + 1000, firstY + 1001, firstY + 1002];
        generateRiverGroup(
          distractionYs,
          spawnScore + 25,
          seededRandom(routeSeed ^ 0xA5A5A5A5)
        );
        var regeneratedRows = generateRiverGroup(
          rowYs,
          spawnScore,
          seededRandom(routeSeed)
        );
        assert(JSON.stringify(regeneratedRows) === JSON.stringify(rows),
          label + ' gap regeneration retained cross-invocation route state');
      }
    }

    var routePropertyCaseCount = 132;
    for (var routeCaseIndex = 0; routeCaseIndex < routePropertyCaseCount;
      routeCaseIndex++) {
      runGeneratedRouteCase(routeCaseIndex);
    }

    (function testPureRouteSearchEdges() {
      var alternateRows = [
        fixtureRiverRow(10, [
          fixturePlatform(-10, 10, 1, 'LILY_PAD'),
          fixturePlatform(2, 10, 1, 'LILY_PAD')
        ]),
        fixtureRiverRow(11, [
          fixturePlatform(-9.5, 11, 1, 'LILY_PAD'),
          fixturePlatform(2.5, 11, 1, 'LILY_PAD')
        ]),
        fixtureRiverRow(12, [
          fixturePlatform(-9, 12, 1, 'LILY_PAD'),
          fixturePlatform(3, 12, 1, 'LILY_PAD')
        ])
      ];
      var alternateSnapshot = JSON.stringify(alternateRows);
      var alternateRoute = findInSpanCrossingRoute(alternateRows);
      assertRouteIsValid(alternateRows, alternateRoute,
        'Property 6 alternate-path fixture');
      assert(JSON.stringify(alternateRows) === alternateSnapshot,
        'Property 6 alternate-path search mutated its input');

      var noPathRows = [
        fixtureRiverRow(20, [fixturePlatform(-10, 20, 1, 'LILY_PAD')]),
        fixtureRiverRow(21, [fixturePlatform(10, 21, 1, 'LILY_PAD')])
      ];
      assert(findInSpanCrossingRoute(noPathRows) === null,
        'Property 6 no-path fixture unexpectedly returned a route');

      var malformedWidthRows = [
        fixtureRiverRow(30, [fixturePlatform(0, 30, 2, 'LILY_PAD')]),
        fixtureRiverRow(31, [fixturePlatform(0, 31, 5, 'LOG')])
      ];
      assert(findInSpanCrossingRoute(malformedWidthRows) === null,
        'Property 6 malformed widths unexpectedly returned a route');

      var leftOutOfSpanRows = [
        fixtureRiverRow(40, [fixturePlatform(-15.01, 40, 1, 'LILY_PAD')]),
        fixtureRiverRow(41, [fixturePlatform(-15, 41, 1, 'LILY_PAD')])
      ];
      assert(findInSpanCrossingRoute(leftOutOfSpanRows) === null,
        'Property 6 accepted a footprint crossing the left bound');

      var rightOutOfSpanRows = [
        fixtureRiverRow(50, [fixturePlatform(15.01, 50, 1, 'LILY_PAD')]),
        fixtureRiverRow(51, [fixturePlatform(15, 51, 1, 'LILY_PAD')])
      ];
      assert(findInSpanCrossingRoute(rightOutOfSpanRows) === null,
        'Property 6 accepted a footprint crossing the half-open right bound');

      var exactLeftBoundaryRows = [
        fixtureRiverRow(60, [fixturePlatform(-15, 60, 1, 'LILY_PAD')]),
        fixtureRiverRow(61, [fixturePlatform(-15, 61, 1, 'LILY_PAD')])
      ];
      assertRouteIsValid(
        exactLeftBoundaryRows,
        findInSpanCrossingRoute(exactLeftBoundaryRows),
        'Property 6 exact left-boundary fixture'
      );

      var exactRightBoundaryRows = [
        fixtureRiverRow(70, [fixturePlatform(15, 70, 1, 'LILY_PAD')]),
        fixtureRiverRow(71, [fixturePlatform(15, 71, 1, 'LILY_PAD')])
      ];
      assertRouteIsValid(
        exactRightBoundaryRows,
        findInSpanCrossingRoute(exactRightBoundaryRows),
        'Property 6 exact half-open right-boundary fixture'
      );

      var noncontiguousRows = [
        fixtureRiverRow(80, [fixturePlatform(0, 80, 1, 'LILY_PAD')]),
        fixtureRiverRow(82, [fixturePlatform(0, 82, 1, 'LILY_PAD')])
      ];
      assert(findInSpanCrossingRoute(noncontiguousRows) === null,
        'Property 6 accepted noncontiguous River rows');
    })();

    // Feature: score-scaled-movement-and-side-occlusion,
    // Property 7: One-cell lilies preserve support and carry.
    // **Validates: Requirements 4.7, 4.8**
    function propertyPlatform(x, y, width, velocity, type, routeValue) {
      var platform = {
        x: x,
        y: y,
        width: width,
        velocity: velocity,
        type: type
      };
      if (routeValue !== undefined) {
        platform.routeSelected = routeValue;
        platform.initialCrossingRoute = routeValue;
      }
      return platform;
    }

    function propertyRiverRow(y, platform, direction, speed, routeValue) {
      var metadata = {
        direction: direction,
        lockedRowSpeed: speed,
        speed: speed
      };
      if (routeValue !== undefined) {
        metadata.routeSelected = routeValue;
        metadata.initialCrossingRoute = routeValue;
        metadata.routePlan = routeValue ? { anchorX: platform.x } : null;
      }
      return {
        y: y,
        type: 'RIVER',
        obstacles: [],
        platforms: [platform],
        metadata: metadata
      };
    }

    function propertyGame(row, playerX) {
      var game = Object.create(Game.prototype);
      game.world = new World();
      game.world.addTerrainRow(row);
      game.player = new Player(playerX, row.y);
      game.gameState = {
        state: 'PLAYING',
        score: 0,
        maxYReached: 0,
        lastFrameTime: 0
      };
      game.random = seededRandom(0x47414D45 + row.y);
      game.visualSeed = 0;
      game.updateScore = function () {};
      game.ensureTerrainAroundPlayer = function () {};
      game.cleanupOldTerrain = function () {};
      return game;
    }

    function runLilyCarryVariant(fixture, routeValue) {
      var lily = propertyPlatform(
        fixture.x,
        fixture.y,
        1,
        fixture.direction * fixture.speed,
        'LILY_PAD',
        routeValue
      );
      var row = propertyRiverRow(
        fixture.y,
        lily,
        fixture.direction,
        fixture.speed,
        routeValue
      );
      var playerStartX = fixture.x + fixture.supportOffset;
      var game = propertyGame(row, playerStartX);
      var relativeBefore = game.player.x - lily.x;
      game.update(fixture.delta);
      return {
        game: game,
        lily: lily,
        playerStartX: playerStartX,
        lilyStartX: fixture.x,
        relativeBefore: relativeBefore,
        relativeAfter: game.player.x - lily.x
      };
    }

    var supportCarryCaseCount = 128;
    var supportEpsilon = 1e-9;
    var wrapResetCounts = { negative: 0, positive: 0 };
    var logWidthsObserved = {};

    for (var supportCaseIndex = 0; supportCaseIndex < supportCarryCaseCount;
      supportCaseIndex++) {
      var supportRandom = seededRandom(
        (0x53555050 + supportCaseIndex * 131071) >>> 0
      );
      var direction = supportCaseIndex % 2 === 0 ? 1 : -1;
      var speed = 0.0049 + supportRandom() * 0.0056;
      var delta = 1 + Math.floor(supportRandom() * 100);
      var lilyX = -14 + supportRandom() * 28;
      var supportOffset;
      if (supportCaseIndex % 4 === 0) {
        supportOffset = -0.35;
      } else if (supportCaseIndex % 4 === 1) {
        supportOffset = 1.35 - supportEpsilon;
      } else {
        supportOffset = -0.35 + supportRandom() * (1.7 - supportEpsilon);
      }
      var fixture = {
        x: lilyX,
        y: 1000 + supportCaseIndex,
        direction: direction,
        speed: speed,
        delta: delta,
        supportOffset: supportOffset
      };
      var label = 'Property 7 case ' + supportCaseIndex;

      var boundaryLily = propertyPlatform(
        lilyX,
        fixture.y,
        1,
        direction * speed,
        'LILY_PAD'
      );
      var boundaryRow = propertyRiverRow(
        fixture.y,
        boundaryLily,
        direction,
        speed
      );
      var boundaryWorld = new World();
      boundaryWorld.addTerrainRow(boundaryRow);
      assert(checkCollisions({ x: lilyX - 0.35, y: fixture.y }, boundaryWorld) ===
        'SAFE', label + ' rejected the inclusive left tolerance boundary');
      assert(checkCollisions({ x: lilyX - 0.35 - supportEpsilon, y: fixture.y },
        boundaryWorld) === 'WATER_HAZARD',
        label + ' accepted a position left of the support interval');
      assert(checkCollisions({ x: lilyX + 1.35 - supportEpsilon, y: fixture.y },
        boundaryWorld) === 'SAFE',
        label + ' rejected the interior next to the right tolerance boundary');
      assert(checkCollisions({ x: lilyX + 1.35, y: fixture.y }, boundaryWorld) ===
        'WATER_HAZARD',
        label + ' accepted the half-open right tolerance boundary');

      var routedRide = runLilyCarryVariant(fixture, true);
      var ordinaryRide = runLilyCarryVariant(fixture, undefined);
      var rides = [routedRide, ordinaryRide];
      var expectedDisplacement = direction * speed * delta;
      rides.forEach(function (ride, rideIndex) {
        var routeLabel = rideIndex === 0 ? ' route-marked' : ' ordinary';
        assert(ride.game.gameState.state === 'PLAYING',
          label + routeLabel + ' supported rider became a water hazard');
        assert(close(ride.lily.x - ride.lilyStartX, expectedDisplacement),
          label + routeLabel + ' Lily displacement was not velocity * delta');
        assert(close(ride.game.player.x - ride.playerStartX,
          expectedDisplacement),
          label + routeLabel + ' Player did not receive equal displacement');
        assert(close(ride.relativeAfter, ride.relativeBefore),
          label + routeLabel + ' changed the Player-to-Lily relative offset');
      });
      assert(close(routedRide.game.player.x, ordinaryRide.game.player.x) &&
        close(routedRide.lily.x, ordinaryRide.lily.x) &&
        routedRide.game.gameState.state === ordinaryRide.game.gameState.state,
        label + ' outcome depended on route-selection metadata');

      var wrapDirection = supportCaseIndex % 2 === 0 ? 1 : -1;
      var wrapSpeed = wrapDirection * speed;
      var wrapDelta = 100;
      var wrapStartX = wrapDirection > 0
        ? 20 - speed * wrapDelta / 2
        : -20 + speed * wrapDelta / 2;
      var wrappingLily = propertyPlatform(
        wrapStartX,
        fixture.y + 1000,
        1,
        wrapSpeed,
        'LILY_PAD',
        true
      );
      var wrappingRow = propertyRiverRow(
        fixture.y + 1000,
        wrappingLily,
        wrapDirection,
        speed,
        true
      );
      var wrappingPlayerStartX = wrapStartX + 0.5;
      var wrappingGame = propertyGame(wrappingRow, wrappingPlayerStartX);
      wrappingGame.update(wrapDelta);
      assert(close(wrappingGame.player.x, wrappingPlayerStartX),
        label + ' wrapping Lily teleported its Player');
      assert(wrappingGame.gameState.state === 'GAME_OVER',
        label + ' wrapping Lily did not produce WATER_HAZARD');
      if (wrapDirection > 0) {
        assert(wrappingLily.x === -25,
          label + ' positive wrapping Lily did not reset to -25');
        wrapResetCounts.negative++;
      } else {
        assert(wrappingLily.x === 25,
          label + ' negative wrapping Lily did not reset to 25');
        wrapResetCounts.positive++;
      }

      var logWidth = supportCaseIndex % 2 === 0 ? 3 : 4;
      logWidthsObserved[logWidth] = true;
      var logX = -10 + supportRandom() * 20;
      var log = propertyPlatform(
        logX,
        fixture.y + 2000,
        logWidth,
        direction * speed,
        'LOG'
      );
      var logRow = propertyRiverRow(
        fixture.y + 2000,
        log,
        direction,
        speed
      );
      var logWorld = new World();
      logWorld.addTerrainRow(logRow);
      assert(checkCollisions({
        x: logX + logWidth + 0.35 - supportEpsilon,
        y: logRow.y
      }, logWorld) === 'SAFE',
      label + ' changed Log support based on one-cell Lily geometry');
      assert(checkCollisions({
        x: logX + logWidth + 0.35,
        y: logRow.y
      }, logWorld) === 'WATER_HAZARD',
      label + ' changed the Log half-open right tolerance boundary');
    }

    assert(wrapResetCounts.negative === 64 && wrapResetCounts.positive === 64,
      'Property 7 did not exercise both Lily wrap directions equally');
    assert(logWidthsObserved[3] === true && logWidthsObserved[4] === true,
      'Property 7 preservation checks did not exercise both Log widths');
  `;

  const worldSource = readUtf8(root + '/world.js');
  const collisionSource = readUtf8(root + '/collision.js');
  const playerSource = readUtf8(root + '/player.js');
  const gameSource = readUtf8(root + '/game.js');
  var console = { log: function () {}, error: function () {} };
  var window = { addEventListener: function () {} };
  eval(generatorSource + '\n' + worldSource + '\n' + collisionSource + '\n' +
    rendererSource + '\n' + playerSource + '\n' + gameSource + '\n' + assertions);
  return 'PASS: Properties 4, 5, 6, and 7; 128 dimension cases, 128 Lily collection cases (381 rendered entities), 132 deterministic River route cases, and 128 one-cell Lily support/carry cases validated';
}
