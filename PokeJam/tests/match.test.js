import { test } from "node:test";
import assert from "node:assert/strict";
import { assessProfileMatch, profileResults, topProfileMatches } from "../js/match.js";

const attributes = ["speed", "power", "passing", "shooting", "block"];

function profile(slug, values, level = 50) {
  return { slug, level, attributes: Object.fromEntries(attributes.map((name, index) => [name, values[index]])) };
}

test("a 25-point gap is close and a 26-point gap is not", () => {
  const query = profile("query", [50, 50, 50, 50, 50]);

  assert.deepEqual(assessProfileMatch(query, profile("boundary", [25, 25, 25, 25, 25]), attributes), {
    rmsGap: 25, meanGap: 25, withinTolerance: 5, close: true,
  });
  assert.deepEqual(assessProfileMatch(query, profile("outside", [24, 24, 24, 24, 24]), attributes), {
    rmsGap: 26, meanGap: 26, withinTolerance: 0, close: false,
  });
});

test("60 percent overlap is close but 40 percent fails even below the RMS limit", () => {
  const query = profile("query", [50, 50, 50, 50, 50]);
  const atBoundary = assessProfileMatch(query, profile("three", [50, 50, 50, 24, 24]), attributes);
  const belowBoundary = assessProfileMatch(query, profile("two", [50, 50, 24, 24, 24]), attributes);

  assert.equal(atBoundary.withinTolerance, 3);
  assert.equal(atBoundary.close, true);
  assert.equal(belowBoundary.withinTolerance, 2);
  assert.equal(belowBoundary.close, false);
  // Independent RMS calculations: two or three squared gaps of 26 over five axes.
  // 1e-12 comfortably covers floating-point rounding at this magnitude.
  assert.ok(Math.abs(atBoundary.rmsGap - Math.sqrt(270.4)) < 1e-12);
  assert.ok(Math.abs(belowBoundary.rmsGap - Math.sqrt(405.6)) < 1e-12);
  assert.ok(belowBoundary.rmsGap < 25);
});

test("when no close profile exists the nearest fallbacks remain in ranked order", () => {
  const query = profile("query", [0, 0, 0, 0, 0], 0);
  const candidates = [profile("farther", [60, 60, 60, 60, 60], 60), profile("nearer", [40, 40, 40, 40, 40], 40)];
  const before = structuredClone({ query, candidates });
  const result = profileResults(query, candidates, attributes, 1);

  assert.equal(result.hasCloseMatch, false);
  assert.deepEqual(result.matches.map((match) => match.record.slug), ["nearer", "farther"]);
  assert.deepEqual(result.matches.map((match) => match.distance), [40, 60]);
  assert.deepEqual(result.matches.map((match) => match.fit.close), [false, false]);
  assert.deepEqual({ query, candidates }, before);
});

test("when close profiles exist the results exclude far candidates", () => {
  const query = profile("query", [50, 50, 50, 50, 50]);
  const candidates = [
    profile("far", [90, 90, 90, 90, 90], 90),
    profile("close", [60, 60, 60, 60, 60], 60),
    profile("closest", [52, 52, 52, 52, 52], 52),
  ];
  const result = profileResults(query, candidates, attributes, 1);

  assert.equal(result.hasCloseMatch, true);
  assert.deepEqual(result.matches.map((match) => match.record.slug), ["closest", "close"]);
  assert.deepEqual(result.matches.map((match) => match.fit.close), [true, true]);
  assert.deepEqual(profileResults(query, candidates, attributes, 1, 1).matches.map((match) => match.record.slug), ["closest"]);
});

test("an empty match pool reports no close match and no fallbacks", () => {
  assert.deepEqual(profileResults(profile("query", [50, 50, 50, 50, 50]), [], attributes, 10), {
    hasCloseMatch: false, matches: [],
  });
});

test("profile ranking sorts by distance, preserves ties and respects the limit", () => {
  const query = profile("query", [50, 50, 50, 50, 50]);
  const candidates = [
    profile("far", [54, 46, 50, 50, 50]),
    profile("tie-first", [52, 48, 50, 50, 50]),
    profile("exact", [50, 50, 50, 50, 50]),
    profile("tie-second", [48, 52, 50, 50, 50]),
  ];
  const before = structuredClone(candidates);
  const result = topProfileMatches(query, candidates, attributes, 0, 3);

  assert.deepEqual(result.map((match) => match.record.slug), ["exact", "tie-first", "tie-second"]);
  assert.equal(result[0].distance, 0);
  // Each tied candidate differs by +2 and -2 on two axes, giving squared distance 8.
  assert.ok(Math.abs(result[1].distance - Math.sqrt(8)) < 1e-12);
  assert.equal(result[1].distance, result[2].distance);
  assert.deepEqual(candidates, before);
});

test("positive level weight favors the closer level while zero weight removes that contribution", () => {
  const query = profile("query", [50, 50, 50, 50, 50], 50);
  const candidates = [
    profile("level-far", [80, 80, 80, 80, 80], 80),
    profile("level-near", [55, 55, 55, 55, 55], 55),
  ];
  const weighted = topProfileMatches(query, candidates, attributes, 4);
  const unweighted = topProfileMatches(query, candidates, attributes, 0);

  assert.deepEqual(weighted.map((match) => match.record.slug), ["level-near", "level-far"]);
  assert.deepEqual(weighted.map((match) => match.distance), [10, 60]);
  assert.deepEqual(unweighted.map((match) => match.record.slug), ["level-far", "level-near"]);
  assert.deepEqual(unweighted.map((match) => match.distance), [0, 0]);
});
