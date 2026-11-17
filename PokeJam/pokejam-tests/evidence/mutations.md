# Mutation evidence
AI-generated factual record, November 16, 2026. All excerpts below are captured output.
Test snapshot / `TESTS_SHA` / `FINAL_TESTS_SHA`: `1cc73ed43673da41965f2220391e5e832970f1e1`.
Command from `PokeJam/`: `node --test --test-reporter=tap tests/*.test.js`.
Node: `v26.13.1`.
Baseline: 18 passing tests, exit 0. Each mutation changes one source line and is restored before the next.

| ID | Source line | Failure exit | Detecting tests | Restored run |
| --- | --- | --- | --- | --- |
| M1 | `js/catalog_logic.js:18` | 1 | a Pokémon query only includes eligible NBA players | 18 pass, exit 0 |
| M2 | `js/catalog_logic.js:11` | 1 | blank Pokédex search returns the first 72 non-playable records | 18 pass, exit 0 |
| M3 | `js/catalog_logic.js:10` | 1 | Pokédex search normalizes accents, case and spaces and matches inside name, slug or second type | 18 pass, exit 0 |
| M4 | `js/catalog_logic.js:28` | 1 | attribute comparison returns absolute gaps and extrema in the requested order; equal absolute gaps preserve both rows and tied extrema | 18 pass, exit 0 |
| M5 | `js/match.js:29` | 1 | a 25-point gap is close and a 26-point gap is not | 18 pass, exit 0 |

Surviving mutations: none.
No test changes were needed during these experiments. This does not prove every test can catch every bug.

## M1

Original: `(record) => record.match_pool`

Mutated: `(record) => !record.match_pool`

[Exact diff](logs/M1.diff), [mutation output](logs/M1-mutated.txt), [restored output](logs/M1-restored.txt).

```text
not ok 1 - a Pokémon query only includes eligible NBA players
  ---
  duration_ms: 2.699625
  type: 'test'
  location: '/Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/catalog_logic.test.js:10:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      [
    +   'ineligible',
    +   'missing-flag'
    -   'eligible-first',
    -   'eligible-second'
      ]
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 'eligible-first'
    1: 'eligible-second'
  actual:
    0: 'ineligible'
    1: 'missing-flag'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/catalog_logic.test.js:24:10)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1402:25)
    Test.start (node:internal/test_runner/test:1262:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
  ...
```

## M2

Original: `others.slice(0, 72)`

Mutated: `others.slice(0, 71)`

[Exact diff](logs/M2.diff), [mutation output](logs/M2-mutated.txt), [restored output](logs/M2-restored.txt).

```text
not ok 5 - blank Pokédex search returns the first 72 non-playable records
  ---
  duration_ms: 1.300041
  type: 'test'
  location: '/Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/catalog_logic.test.js:59:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    ... Skipped lines
    
      [
        'other-0',
        'other-1',
        'other-2',
        'other-3',
    ...
        'other-70',
    -   'other-71'
      ]
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 'other-0'
    1: 'other-1'
    2: 'other-2'
    3: 'other-3'
    4: 'other-4'
    5: 'other-5'
    6: 'other-6'
    7: 'other-7'
    8: 'other-8'
    9: 'other-9'
    10: 'other-10'
    11: 'other-11'
    12: 'other-12'
    13: 'other-13'
    14: 'other-14'
    15: 'other-15'
    16: 'other-16'
    17: 'other-17'
    18: 'other-18'
    19: 'other-19'
    20: 'other-20'
    21: 'other-21'
    22: 'other-22'
    23: 'other-23'
    24: 'other-24'
    25: 'other-25'
    26: 'other-26'
    27: 'other-27'
    28: 'other-28'
    29: 'other-29'
    30: 'other-30'
    31: 'other-31'
    32: 'other-32'
    33: 'other-33'
    34: 'other-34'
    35: 'other-35'
    36: 'other-36'
    37: 'other-37'
    38: 'other-38'
    39: 'other-39'
    40: 'other-40'
    41: 'other-41'
    42: 'other-42'
    43: 'other-43'
    44: 'other-44'
    45: 'other-45'
    46: 'other-46'
    47: 'other-47'
    48: 'other-48'
    49: 'other-49'
    50: 'other-50'
    51: 'other-51'
    52: 'other-52'
    53: 'other-53'
    54: 'other-54'
    55: 'other-55'
    56: 'other-56'
    57: 'other-57'
    58: 'other-58'
    59: 'other-59'
    60: 'other-60'
    61: 'other-61'
    62: 'other-62'
    63: 'other-63'
    64: 'other-64'
    65: 'other-65'
    66: 'other-66'
    67: 'other-67'
    68: 'other-68'
    69: 'other-69'
    70: 'other-70'
    71: 'other-71'
  actual:
    0: 'other-0'
    1: 'other-1'
    2: 'other-2'
    3: 'other-3'
    4: 'other-4'
    5: 'other-5'
    6: 'other-6'
    7: 'other-7'
    8: 'other-8'
    9: 'other-9'
    10: 'other-10'
    11: 'other-11'
    12: 'other-12'
    13: 'other-13'
    14: 'other-14'
    15: 'other-15'
    16: 'other-16'
    17: 'other-17'
    18: 'other-18'
    19: 'other-19'
    20: 'other-20'
    21: 'other-21'
    22: 'other-22'
    23: 'other-23'
    24: 'other-24'
    25: 'other-25'
    26: 'other-26'
    27: 'other-27'
    28: 'other-28'
    29: 'other-29'
    30: 'other-30'
    31: 'other-31'
    32: 'other-32'
    33: 'other-33'
    34: 'other-34'
    35: 'other-35'
    36: 'other-36'
    37: 'other-37'
    38: 'other-38'
    39: 'other-39'
    40: 'other-40'
    41: 'other-41'
    42: 'other-42'
    43: 'other-43'
    44: 'other-44'
    45: 'other-45'
    46: 'other-46'
    47: 'other-47'
    48: 'other-48'
    49: 'other-49'
    50: 'other-50'
    51: 'other-51'
    52: 'other-52'
    53: 'other-53'
    54: 'other-54'
    55: 'other-55'
    56: 'other-56'
    57: 'other-57'
    58: 'other-58'
    59: 'other-59'
    60: 'other-60'
    61: 'other-61'
    62: 'other-62'
    63: 'other-63'
    64: 'other-64'
    65: 'other-65'
    66: 'other-66'
    67: 'other-67'
    68: 'other-68'
    69: 'other-69'
    70: 'other-70'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/catalog_logic.test.js:68:12)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1402:25)
    Test.processPendingSubtests (node:internal/test_runner/test:974:18)
    Test.postRun (node:internal/test_runner/test:1542:19)
    Test.run (node:internal/test_runner/test:1467:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
  ...
```

## M3

Original: `.includes(query)`

Mutated: `.startsWith(query)`

[Exact diff](logs/M3.diff), [mutation output](logs/M3-mutated.txt), [restored output](logs/M3-restored.txt).

```text
not ok 6 - Pokédex search normalizes accents, case and spaces and matches inside name, slug or second type
  ---
  duration_ms: 1.667375
  type: 'test'
  location: '/Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/catalog_logic.test.js:73:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
    + []
    - [
    -   'first'
    - ]
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 'first'
  actual:
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/catalog_logic.test.js:81:12)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1402:25)
    Test.processPendingSubtests (node:internal/test_runner/test:974:18)
    Test.postRun (node:internal/test_runner/test:1542:19)
    Test.run (node:internal/test_runner/test:1467:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
  ...
```

## M4

Original: `gap: Math.abs(queryRecord.attributes[attribute] - matchRecord.attributes[attribute]),`

Mutated: `gap: (queryRecord.attributes[attribute] - matchRecord.attributes[attribute]),`

[Exact diff](logs/M4.diff), [mutation output](logs/M4-mutated.txt), [restored output](logs/M4-restored.txt).

```text
not ok 9 - attribute comparison returns absolute gaps and extrema in the requested order
  ---
  duration_ms: 1.7245
  type: 'test'
  location: '/Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/catalog_logic.test.js:101:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    ... Skipped lines
    
      {
    +   maxGap: 20,
    +   minGap: -30,
    -   maxGap: 30,
    -   minGap: 20,
        rows: [
          {
            attribute: 'power',
            gap: 20,
            match: 70,
    ...
            attribute: 'speed',
    +       gap: -30,
    -       gap: 30,
            match: 40,
            query: 10
          }
        ]
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    rows:
      0:
        attribute: 'power'
        query: 90
        match: 70
        gap: 20
      1:
        attribute: 'speed'
        query: 10
        match: 40
        gap: 30
    minGap: 20
    maxGap: 30
  actual:
    rows:
      0:
        attribute: 'power'
        query: 90
        match: 70
        gap: 20
      1:
        attribute: 'speed'
        query: 10
        match: 40
        gap: -30
    minGap: -30
    maxGap: 20
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/catalog_logic.test.js:107:10)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1402:25)
    Test.processPendingSubtests (node:internal/test_runner/test:974:18)
    Test.postRun (node:internal/test_runner/test:1542:19)
    Test.run (node:internal/test_runner/test:1467:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
  ...

not ok 10 - equal absolute gaps preserve both rows and tied extrema
  ---
  duration_ms: 0.460333
  type: 'test'
  location: '/Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/catalog_logic.test.js:118:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
        maxGap: 20,
    +   minGap: -20,
    -   minGap: 20,
        rows: [
          {
            attribute: 'speed',
    +       gap: -20,
    -       gap: 20,
            match: 30,
            query: 10
          },
          {
            attribute: 'power',
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    rows:
      0:
        attribute: 'speed'
        query: 10
        match: 30
        gap: 20
      1:
        attribute: 'power'
        query: 40
        match: 20
        gap: 20
    minGap: 20
    maxGap: 20
  actual:
    rows:
      0:
        attribute: 'speed'
        query: 10
        match: 30
        gap: -20
      1:
        attribute: 'power'
        query: 40
        match: 20
        gap: 20
    minGap: -20
    maxGap: 20
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/catalog_logic.test.js:119:10)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1402:25)
    Test.processPendingSubtests (node:internal/test_runner/test:974:18)
    Test.postRun (node:internal/test_runner/test:1542:19)
    Test.run (node:internal/test_runner/test:1467:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
  ...
```

## M5

Original: `rmsGap <= PROFILE_FIT.maxRmsGap`

Mutated: `rmsGap < PROFILE_FIT.maxRmsGap`

[Exact diff](logs/M5.diff), [mutation output](logs/M5-mutated.txt), [restored output](logs/M5-restored.txt).

```text
not ok 12 - a 25-point gap is close and a 26-point gap is not
  ---
  duration_ms: 2.755833
  type: 'test'
  location: '/Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/match.test.js:11:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   close: false,
    -   close: true,
        meanGap: 25,
        rmsGap: 25,
        withinTolerance: 5
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    rmsGap: 25
    meanGap: 25
    withinTolerance: 5
    close: true
  actual:
    rmsGap: 25
    meanGap: 25
    withinTolerance: 5
    close: false
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/mook/Documents/GitHub/moloruns.github.io/PokeJam/tests/match.test.js:14:10)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1402:25)
    Test.start (node:internal/test_runner/test:1262:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
  ...
```
