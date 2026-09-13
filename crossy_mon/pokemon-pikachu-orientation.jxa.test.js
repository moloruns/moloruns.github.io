ObjC.import('Foundation');

function readUtf8(filePath) {
  const data = $.NSFileManager.defaultManager.contentsAtPath(filePath);
  if (!data) throw new Error('Unable to read ' + filePath);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function run() {
  const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  const rendererSource = readUtf8(root + '/renderer.js');
  const assertions = `
    // Feature: pokemon-reskin-and-pokeballs, Property 2: Pikachu orientation follows cardinal facing
    // **Validates: Requirements 1.4, 2.1, 8.1**
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    function close(actual, expected, message) {
      if (Math.abs(actual - expected) > 1e-9) {
        throw new Error(message + ': expected ' + expected + ', received ' + actual);
      }
    }
    function snapshot(value) {
      return JSON.stringify(value);
    }
    function center(part) {
      return {
        x: part.x + part.width / 2,
        y: part.y + part.depth / 2
      };
    }
    function dotFromFootprintCenter(part, facing) {
      var partCenter = center(part);
      return (partCenter.x - 0.5) * facing.dx +
        (partCenter.y - 0.5) * facing.dy;
    }
    function findRole(manifest, role) {
      for (var index = 0; index < manifest.length; index++) {
        if (manifest[index].role === role) return manifest[index];
      }
      return null;
    }
    function expectedGeometry(part, facing) {
      if (facing.dx === 1) {
        return {
          x: part.y,
          y: 1 - part.x - part.width,
          width: part.depth,
          depth: part.width
        };
      }
      if (facing.dy === -1) {
        return {
          x: 1 - part.x - part.width,
          y: 1 - part.y - part.depth,
          width: part.width,
          depth: part.depth
        };
      }
      if (facing.dx === -1) {
        return {
          x: 1 - part.y - part.depth,
          y: part.x,
          width: part.depth,
          depth: part.width
        };
      }
      return {
        x: part.x,
        y: part.y,
        width: part.width,
        depth: part.depth
      };
    }
    function invalidFacing(caseIndex) {
      var values = [
        { dx: 0, dy: 0 },
        { dx: 1, dy: 1 },
        { dx: 2, dy: 0 },
        { dx: 'east', dy: 0 },
        null
      ];
      return values[caseIndex % values.length];
    }

    var renderer = new Renderer(__canvas);
    assert(typeof renderer.normalizePikachuFacing === 'function',
      'Pikachu facing normalization is missing');
    assert(typeof renderer.transformPikachuPart === 'function',
      'Pikachu cardinal transform is missing');
    assert(typeof renderer.buildPikachuManifest === 'function',
      'Pikachu manifest builder is missing');
    assert(typeof renderer.drawVoxelPikachu === 'function',
      'Pikachu semantic draw helper is missing');

    var canonicalFacing = Object.freeze({ dx: 0, dy: 1 });
    var canonical = renderer.buildPikachuManifest(canonicalFacing);
    assert(Object.isFrozen(canonical) && canonical.length > 0 && canonical.length <= 32,
      'Canonical Pikachu manifest is not frozen and bounded');

    var pairedRoles = [
      ['leftFoot', 'rightFoot'],
      ['leftLeg', 'rightLeg'],
      ['leftArm', 'rightArm'],
      ['leftEar', 'rightEar'],
      ['leftEarUpper', 'rightEarUpper'],
      ['leftEarTip', 'rightEarTip'],
      ['leftEye', 'rightEye'],
      ['leftCheek', 'rightCheek']
    ];
    pairedRoles.forEach(function (pair) {
      assert(findRole(canonical, pair[0]) && findRole(canonical, pair[1]),
        'Canonical manifest is missing paired roles ' + pair.join('/'));
    });

    var drawCalls = [];
    renderer.drawStage2Model = function (x, y, parts, options) {
      drawCalls.push({ x: x, y: y, parts: parts, options: options });
      return parts.length;
    };

    var facingCases = [
      { name: 'positive-y', input: { dx: 0, dy: 1 }, expected: { dx: 0, dy: 1 } },
      { name: 'positive-x', input: { dx: 1, dy: 0 }, expected: { dx: 1, dy: 0 } },
      { name: 'negative-y', input: { dx: 0, dy: -1 }, expected: { dx: 0, dy: -1 } },
      { name: 'negative-x', input: { dx: -1, dy: 0 }, expected: { dx: -1, dy: 0 } },
      { name: 'invalid-fallback', input: null, expected: { dx: 0, dy: 1 } }
    ];
    var coverage = {
      'positive-y': 0,
      'positive-x': 0,
      'negative-y': 0,
      'negative-x': 0,
      'invalid-fallback': 0
    };
    var propertyCases = 125;

    for (var caseIndex = 0; caseIndex < propertyCases; caseIndex++) {
      var facingCase = facingCases[caseIndex % facingCases.length];
      var suppliedFacing = facingCase.name === 'invalid-fallback'
        ? invalidFacing(caseIndex) : facingCase.input;
      var suppliedFacingBefore = snapshot(suppliedFacing);
      var expectedFacing = facingCase.expected;
      var originX = (((caseIndex * 37) % 601) - 300) / 10;
      var originY = (((caseIndex * 53) % 809) - 404) / 8;
      var playerLogicalData = Object.freeze({
        position: Object.freeze({ x: originX, y: originY }),
        footprint: Object.freeze({ width: 1, depth: 1 }),
        collisionInterval: Object.freeze({
          minX: originX,
          maxXExclusive: originX + 1,
          minY: originY,
          maxYExclusive: originY + 1
        })
      });
      var logicalBefore = snapshot(playerLogicalData);

      var normalized = renderer.normalizePikachuFacing(suppliedFacing);
      assert(normalized.dx === expectedFacing.dx && normalized.dy === expectedFacing.dy,
        'Facing normalization mismatch for ' + facingCase.name + ' case ' + caseIndex);
      assert(snapshot(suppliedFacing) === suppliedFacingBefore,
        'Facing input was mutated in case ' + caseIndex);

      var manifest = renderer.buildPikachuManifest(suppliedFacing);
      assert(Object.isFrozen(manifest) && manifest.length === canonical.length &&
        manifest.length <= 32,
        'Oriented manifest changed inventory or bound in case ' + caseIndex);

      for (var partIndex = 0; partIndex < canonical.length; partIndex++) {
        var sourcePart = canonical[partIndex];
        var orientedPart = findRole(manifest, sourcePart.role);
        var expected = expectedGeometry(sourcePart, expectedFacing);
        assert(orientedPart && Object.isFrozen(orientedPart),
          'Oriented manifest lost or unfroze ' + sourcePart.role + ' in case ' + caseIndex);
        close(orientedPart.x, expected.x,
          sourcePart.role + ' x transform mismatch in case ' + caseIndex);
        close(orientedPart.y, expected.y,
          sourcePart.role + ' y transform mismatch in case ' + caseIndex);
        close(orientedPart.width, expected.width,
          sourcePart.role + ' width transform mismatch in case ' + caseIndex);
        close(orientedPart.depth, expected.depth,
          sourcePart.role + ' depth transform mismatch in case ' + caseIndex);
        close(orientedPart.width * orientedPart.depth,
          sourcePart.width * sourcePart.depth,
          sourcePart.role + ' footprint area changed in case ' + caseIndex);
        assert(orientedPart.semantic === sourcePart.semantic &&
          orientedPart.side === sourcePart.side &&
          orientedPart.surface === sourcePart.surface,
          sourcePart.role + ' semantic identity changed in case ' + caseIndex);
      }

      ['eye', 'nose', 'cheek'].forEach(function (semantic) {
        var matching = manifest.filter(function (part) {
          return part.semantic === semantic;
        });
        assert(matching.length > 0,
          'Missing forward ' + semantic + ' features in case ' + caseIndex);
        matching.forEach(function (part) {
          assert(dotFromFootprintCenter(part, expectedFacing) > 0,
            part.role + ' is not on the facing side in case ' + caseIndex);
        });
      });

      ['backMarking', 'tail'].forEach(function (semantic) {
        var matching = manifest.filter(function (part) {
          return part.semantic === semantic;
        });
        assert(matching.length > 0,
          'Missing rear ' + semantic + ' features in case ' + caseIndex);
        matching.forEach(function (part) {
          assert(dotFromFootprintCenter(part, expectedFacing) < 0,
            part.role + ' is not on the rear side in case ' + caseIndex);
        });
      });

      pairedRoles.forEach(function (pair) {
        var canonicalLeft = findRole(canonical, pair[0]);
        var canonicalRight = findRole(canonical, pair[1]);
        var orientedLeft = findRole(manifest, pair[0]);
        var orientedRight = findRole(manifest, pair[1]);
        var canonicalLeftCenter = center(canonicalLeft);
        var canonicalRightCenter = center(canonicalRight);
        var orientedLeftCenter = center(orientedLeft);
        var orientedRightCenter = center(orientedRight);
        var canonicalDistanceSquared =
          Math.pow(canonicalLeftCenter.x - canonicalRightCenter.x, 2) +
          Math.pow(canonicalLeftCenter.y - canonicalRightCenter.y, 2);
        var orientedDistanceSquared =
          Math.pow(orientedLeftCenter.x - orientedRightCenter.x, 2) +
          Math.pow(orientedLeftCenter.y - orientedRightCenter.y, 2);
        assert(orientedLeft.side === 'left' && orientedRight.side === 'right',
          'Paired side identity changed for ' + pair.join('/') + ' in case ' + caseIndex);
        assert(orientedDistanceSquared > 0,
          'Paired parts collapsed for ' + pair.join('/') + ' in case ' + caseIndex);
        close(orientedDistanceSquared, canonicalDistanceSquared,
          'Paired separation changed for ' + pair.join('/') + ' in case ' + caseIndex);
      });

      if (facingCase.name === 'invalid-fallback') {
        assert(snapshot(manifest) === snapshot(canonical),
          'Invalid facing did not fall back to canonical positive-y in case ' + caseIndex);
      }

      var callStart = drawCalls.length;
      var visualState = Object.freeze({ facing: suppliedFacing, hopHeight: 0 });
      assert(renderer.drawVoxelPikachu(
        playerLogicalData.position.x,
        playerLogicalData.position.y,
        visualState
      ) === 1, 'Oriented Pikachu did not draw one semantic object in case ' + caseIndex);
      assert(drawCalls.length === callStart + 1,
        'Oriented Pikachu did not dispatch exactly one model in case ' + caseIndex);
      var call = drawCalls[callStart];
      assert(call.x === originX && call.y === originY,
        'Pikachu transform changed the Player render origin in case ' + caseIndex);
      assert(call.parts.length === canonical.length,
        'Pikachu draw changed the transformed part inventory in case ' + caseIndex);
      assert(snapshot(playerLogicalData) === logicalBefore &&
        playerLogicalData.footprint.width === 1 &&
        playerLogicalData.footprint.depth === 1 &&
        Math.abs(
          playerLogicalData.collisionInterval.maxXExclusive -
          playerLogicalData.collisionInterval.minX - 1
        ) <= 1e-9 &&
        Math.abs(
          playerLogicalData.collisionInterval.maxYExclusive -
          playerLogicalData.collisionInterval.minY - 1
        ) <= 1e-9,
        'Rendering changed one-cell logical footprint data in case ' + caseIndex);
      assert(snapshot(suppliedFacing) === suppliedFacingBefore,
        'Manifest build or draw mutated facing input in case ' + caseIndex);
      coverage[facingCase.name]++;
    }

    assert(drawCalls.length === propertyCases,
      'Expected one model dispatch for each deterministic property case');
    Object.keys(coverage).forEach(function (name) {
      assert(coverage[name] === 25,
        name + ' did not receive exactly 25 deterministic cases');
    });
  `;

  var __context = {};
  var __canvas = {
    width: 800,
    height: 600,
    getContext: function () { return __context; }
  };

  eval(rendererSource + '\n' + assertions);
  return 'PASS: Property 2 (125 deterministic cases; 25 per cardinal/fallback facing), forward faces, rear markings/tails, paired parts, render origin, and one-cell logical footprint preservation';
}
