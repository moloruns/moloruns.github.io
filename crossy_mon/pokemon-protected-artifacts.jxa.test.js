ObjC.import('Foundation');

/*
 * Feature: pokemon-reskin-and-pokeballs
 * Property 16: Static architecture and protected artifacts remain unchanged
 *
 * Task 0.1 wave-0 behavior: if the dedicated snapshot does not exist, this
 * harness creates it from the untouched workspace and immediately validates
 * the resulting snapshot. Subsequent executions are validation-only.
 */

var FEATURE_NAME = 'pokemon-reskin-and-pokeballs';
var BASELINE_FILE = '.pokemon-protected-baseline.json';
var TARGET_SPEC = '.kiro/specs/' + FEATURE_NAME;
var ROOT_SCRIPTS = Object.freeze([
  'player.js',
  'world.js',
  'generator.js',
  'collision.js',
  'renderer.js',
  'input.js',
  'game.js'
]);

/* Only files explicitly named by the implementation plan may change later. */
var MUTABLE_ALLOWLIST = Object.freeze([
  'generator.js',
  'renderer.js',
  'game.js',
  'input.js',
  'player.js',
  'pokemon-cosmetic-eligibility.jxa.test.js',
  'pokemon-cosmetic-placement.jxa.test.js',
  'pokemon-cosmetic-determinism.jxa.test.js',
  'pokemon-cosmetic-rng-neutrality.jxa.test.js',
  'pokemon-game-cosmetic-lifecycle.jxa.test.js',
  'renderer-pokeball.jxa.test.js',
  'pokemon-game-pokeball-render.jxa.test.js',
  'pokemon-game-pokeball-safety.jxa.test.js',
  'pokemon-game-cosmetic-neutrality.jxa.test.js',
  'pokemon-timed-speed-effects.jxa.test.js',
  'pokemon-auto-boost.jxa.test.js',
  'pokemon-auto-boost-nonstacking.jxa.test.js',
  'pokemon-gameplay-regression-property.jxa.test.js'
]);

var DEPENDENCY_BUILD_PATTERN = /(^|\/)(package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|deno\.jsonc?|bower\.json|composer\.(?:json|lock)|Gemfile(?:\.lock)?|Pipfile(?:\.lock)?|poetry\.lock|requirements\.txt|Cargo\.(?:toml|lock)|go\.(?:mod|sum)|Makefile|CMakeLists\.txt|tsconfig(?:\.[^/]+)?\.json|jsconfig\.json|babel\.config\.[^/]+|\.babelrc(?:\.[^/]+)?|vite\.config\.[^/]+|webpack\.config\.[^/]+|rollup\.config\.[^/]+|gulpfile\.[^/]+|gruntfile\.[^/]+)$/i;
var ASSET_PATTERN = /\.(?:png|jpe?g|gif|webp|svg|ico|bmp|avif|mp3|wav|ogg|m4a|aac|flac|mp4|webm|mov|ttf|otf|woff2?|eot)$/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readUtf8(path) {
  var data = $.NSFileManager.defaultManager.contentsAtPath(path);
  if (!data) throw new Error('Unable to read ' + path);
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function writeUtf8(path, text) {
  var value = $.NSString.stringWithString(text);
  var error = Ref();
  var wrote = value.writeToFileAtomicallyEncodingError(
    path,
    true,
    $.NSUTF8StringEncoding,
    error
  );
  if (!wrote) throw new Error('Unable to write ' + path);
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function sha256(path) {
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  var command = '/usr/bin/shasum -a 256 ' + shellQuote(path) +
    " | /usr/bin/awk '{print $1}'";
  return String(app.doShellScript(command)).trim();
}

function listFiles(root) {
  var manager = $.NSFileManager.defaultManager;
  var raw = ObjC.deepUnwrap(manager.subpathsAtPath(root)) || [];
  return raw.filter(function (relativePath) {
    if (relativePath === BASELINE_FILE) return false;
    var isDirectory = Ref();
    var exists = manager.fileExistsAtPathIsDirectory(root + '/' + relativePath, isDirectory);
    return exists && !isDirectory[0];
  }).sort();
}

function normalizeTaskCheckboxes(source) {
  /* Preserve every byte except a Markdown task marker's workflow state. */
  return source.replace(/^(\s*-\s*)\[[ xX]\](?=\s)/gm, '$1[ ]');
}

function hashEntry(root, relativePath) {
  return { path: relativePath, sha256: sha256(root + '/' + relativePath) };
}

function normalizedTasksEntry(root) {
  var relativePath = TARGET_SPEC + '/tasks.md';
  var normalized = normalizeTaskCheckboxes(readUtf8(root + '/' + relativePath));
  var temporaryPath = root + '/.' + FEATURE_NAME + '-normalized-tasks.tmp';
  try {
    writeUtf8(temporaryPath, normalized);
    return {
      path: relativePath,
      sha256: sha256(temporaryPath),
      normalization: 'Only leading Markdown workflow task states [ ], [x], or [X] are normalized to [ ].'
    };
  } finally {
    $.NSFileManager.defaultManager.removeItemAtPathError(temporaryPath, null);
  }
}

function selectEntries(root, inventory, predicate) {
  return inventory.filter(predicate).map(function (path) {
    return hashEntry(root, path);
  });
}

function createBaseline(root) {
  var inventory = listFiles(root);
  var targetRequirements = TARGET_SPEC + '/requirements.md';
  var targetDesign = TARGET_SPEC + '/design.md';
  var targetTasks = TARGET_SPEC + '/tasks.md';
  var protectedInventory = inventory.filter(function (path) {
    return MUTABLE_ALLOWLIST.indexOf(path) === -1 && path !== targetTasks;
  });

  var snapshot = {
    schemaVersion: 1,
    feature: FEATURE_NAME,
    purpose: 'Task 0.1 pre-implementation protected-artifact baseline',
    baselineFile: BASELINE_FILE,
    baselineExcludedFromMutableAllowlist: MUTABLE_ALLOWLIST.indexOf(BASELINE_FILE) === -1,
    mutableAllowlist: MUTABLE_ALLOWLIST.slice(),
    rootScriptOrder: ROOT_SCRIPTS.slice(),
    workspaceInventory: inventory,
    protectedArtifacts: {
      readme: hashEntry(root, 'README.md'),
      requirements: hashEntry(root, targetRequirements),
      design: hashEntry(root, targetDesign),
      normalizedTasks: normalizedTasksEntry(root),
      taskMetadata: selectEntries(root, inventory, function (path) {
        return /(^|\/)(tasks\.meta\.json|\.config(?:\.kiro)?)$/.test(path);
      }),
      unrelatedSpecs: selectEntries(root, inventory, function (path) {
        return path.indexOf('.kiro/specs/') === 0 && path.indexOf(TARGET_SPEC + '/') !== 0;
      }),
      dependencyBuildFiles: selectEntries(root, inventory, function (path) {
        return DEPENDENCY_BUILD_PATTERN.test(path);
      }),
      assets: selectEntries(root, inventory, function (path) {
        return ASSET_PATTERN.test(path);
      }),
      protectedFiles: protectedInventory.map(function (path) {
        return hashEntry(root, path);
      })
    },
    architecture: {
      staticRootEntry: 'index.html',
      stylesheet: 'style.css',
      renderer: 'renderer.js',
      requiredCanvasContext: '2d',
      directGuardedLoadScripts: ROOT_SCRIPTS.slice(),
      forbiddenRuntimeResources: [
        'package/dependency/build manifests',
        'framework/module imports',
        'WebGL contexts',
        'external image/font/media assets',
        'network resource URLs or requests'
      ]
    }
  };

  assert(snapshot.baselineExcludedFromMutableAllowlist,
    BASELINE_FILE + ' must never be mutable');
  writeUtf8(root + '/' + BASELINE_FILE, JSON.stringify(snapshot, null, 2) + '\n');
  return snapshot;
}

function compareEntry(root, expected, label) {
  assert(expected && typeof expected.path === 'string' &&
    /^[0-9a-f]{64}$/.test(expected.sha256), 'Malformed ' + label + ' snapshot entry');
  assert(sha256(root + '/' + expected.path) === expected.sha256,
    label + ' changed: ' + expected.path);
}

function compareEntryList(root, entries, label) {
  assert(Array.isArray(entries), 'Missing ' + label + ' inventory');
  entries.forEach(function (entry) { compareEntry(root, entry, label); });
}

function assertSameStrings(actual, expected, label) {
  assert(Array.isArray(actual) && Array.isArray(expected), 'Missing ' + label);
  assert(JSON.stringify(actual) === JSON.stringify(expected), label + ' changed');
}

function validateArchitecture(root, baseline, currentInventory) {
  assertSameStrings(baseline.rootScriptOrder, ROOT_SCRIPTS, 'root script baseline');
  assertSameStrings(baseline.mutableAllowlist, MUTABLE_ALLOWLIST, 'mutable allowlist');
  assert(baseline.baselineExcludedFromMutableAllowlist === true &&
    MUTABLE_ALLOWLIST.indexOf(BASELINE_FILE) === -1,
    BASELINE_FILE + ' entered the mutable allowlist');

  var indexSource = readUtf8(root + '/index.html');
  var scriptSources = [];
  var scriptPattern = /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;
  var match;
  while ((match = scriptPattern.exec(indexSource)) !== null) scriptSources.push(match[1]);
  assertSameStrings(scriptSources, ROOT_SCRIPTS, 'root production script order');

  var styleLinks = [];
  var stylePattern = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  while ((match = stylePattern.exec(indexSource)) !== null) styleLinks.push(match[1]);
  assert(styleLinks.length === 1 && styleLinks[0] === 'style.css',
    'Root stylesheet loading changed');

  var guardedWindow = {
    addEventListener: function () {},
    removeEventListener: function () {},
    requestAnimationFrame: function () {}
  };
  var guardedDocument = { getElementById: function () { return null; } };
  var quietConsole = { log: function () {}, error: function () {}, warn: function () {} };
  ROOT_SCRIPTS.forEach(function (script) {
    var source = readUtf8(root + '/' + script);
    var loader = new Function(
      'window', 'document', 'module', 'exports', 'console',
      'requestAnimationFrame', 'performance', source
    );
    loader(guardedWindow, guardedDocument, undefined, undefined, quietConsole,
      function () {}, { now: function () { return 0; } });
  });

  var rendererSource = readUtf8(root + '/renderer.js');
  assert(/getContext\s*\(\s*['"]2d['"]\s*\)/.test(rendererSource),
    'Renderer no longer acquires a Canvas 2D context');

  var productionText = ROOT_SCRIPTS.map(function (script) {
    return readUtf8(root + '/' + script);
  }).join('\n') + '\n' + indexSource + '\n' + readUtf8(root + '/style.css');

  var forbiddenChecks = [
    { pattern: /getContext\s*\(\s*['"](?:webgl|webgl2|experimental-webgl)['"]/i, label: 'WebGL context' },
    { pattern: /\bWebGL(?:2)?RenderingContext\b/, label: 'WebGL API' },
    { pattern: /\b(?:fetch|XMLHttpRequest)\s*(?:\(|\b)/, label: 'network request API' },
    { pattern: /\b(?:new\s+Image|createImageBitmap|drawImage)\s*\(/, label: 'external image path' },
    { pattern: /https?:\/\//i, label: 'network resource URL' },
    { pattern: /\b(?:import\s*(?:\(|[^;]*\bfrom\b)|require\s*\()/, label: 'module dependency' },
    { pattern: /\b(?:React|Vue|Angular|Svelte)\b/, label: 'framework dependency' }
  ];
  forbiddenChecks.forEach(function (check) {
    assert(!check.pattern.test(productionText), 'Introduced forbidden ' + check.label);
  });

  var dependencyFiles = currentInventory.filter(function (path) {
    return DEPENDENCY_BUILD_PATTERN.test(path);
  });
  var assetFiles = currentInventory.filter(function (path) {
    return ASSET_PATTERN.test(path);
  });
  assertSameStrings(
    dependencyFiles,
    baseline.protectedArtifacts.dependencyBuildFiles.map(function (entry) { return entry.path; }),
    'dependency/build inventory'
  );
  assertSameStrings(
    assetFiles,
    baseline.protectedArtifacts.assets.map(function (entry) { return entry.path; }),
    'asset inventory'
  );
}

function validateBaseline(root, baseline) {
  assert(baseline && baseline.schemaVersion === 1 && baseline.feature === FEATURE_NAME,
    'Wrong or malformed protected baseline');
  assert(baseline.baselineFile === BASELINE_FILE, 'Baseline identity changed');

  var currentInventory = listFiles(root);
  baseline.workspaceInventory.forEach(function (path) {
    assert(currentInventory.indexOf(path) !== -1, 'Baseline file was removed: ' + path);
  });
  currentInventory.forEach(function (path) {
    assert(baseline.workspaceInventory.indexOf(path) !== -1 ||
      MUTABLE_ALLOWLIST.indexOf(path) !== -1,
      'File outside the mutable allowlist was introduced: ' + path);
  });

  compareEntry(root, baseline.protectedArtifacts.readme, 'README');
  compareEntry(root, baseline.protectedArtifacts.requirements, 'requirements');
  compareEntry(root, baseline.protectedArtifacts.design, 'design');
  compareEntryList(root, baseline.protectedArtifacts.taskMetadata, 'task metadata');
  compareEntryList(root, baseline.protectedArtifacts.unrelatedSpecs, 'unrelated spec');
  compareEntryList(root, baseline.protectedArtifacts.dependencyBuildFiles, 'dependency/build file');
  compareEntryList(root, baseline.protectedArtifacts.assets, 'asset');
  compareEntryList(root, baseline.protectedArtifacts.protectedFiles, 'protected file');

  var tasksEntry = baseline.protectedArtifacts.normalizedTasks;
  var normalized = normalizeTaskCheckboxes(readUtf8(root + '/' + tasksEntry.path));
  var temporaryPath = root + '/.' + FEATURE_NAME + '-normalized-tasks.tmp';
  try {
    writeUtf8(temporaryPath, normalized);
    assert(sha256(temporaryPath) === tasksEntry.sha256,
      'tasks.md changed outside workflow-managed checkbox state');
  } finally {
    $.NSFileManager.defaultManager.removeItemAtPathError(temporaryPath, null);
  }

  validateArchitecture(root, baseline, currentInventory);
}

function run() {
  var root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  assert($.NSFileManager.defaultManager.fileExistsAtPath(root + '/index.html'),
    'Run this harness from the project root');

  var baselinePath = root + '/' + BASELINE_FILE;
  var manager = $.NSFileManager.defaultManager;
  var created = false;
  if (!manager.fileExistsAtPath(baselinePath)) {
    createBaseline(root);
    created = true;
  }

  var baseline = JSON.parse(readUtf8(baselinePath));
  validateBaseline(root, baseline);
  var digest = sha256(baselinePath);
  assert(/^[0-9a-f]{64}$/.test(digest), 'Unable to digest protected baseline');
  return 'PASS: Feature: pokemon-reskin-and-pokeballs, Property 16: Static architecture and protected artifacts remain unchanged; wave-0=' +
    (created ? 'created-and-validated' : 'validated') + '; snapshot-sha256=' + digest;
}

try {
  run();
} catch (error) {
  throw new Error('FAIL: ' + error.message);
}
