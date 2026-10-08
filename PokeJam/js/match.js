import { TRAITS } from "./data.js";

export function vectorFor(record, attributes) {
  return attributes.map((attribute) => record.attributes[attribute]);
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export const PROFILE_FIT = {
  maxRmsGap: 25,
  attributeTolerance: 25,
  minOverlap: 0.6,
};

// Ranking finds the nearest candidate; this separately checks absolute fit.
export function assessProfileMatch(queryRecord, candidateRecord, attributes) {
  const gaps = attributes.map((attribute) => Math.abs(
    queryRecord.attributes[attribute] - candidateRecord.attributes[attribute],
  ));
  const rmsGap = Math.sqrt(mean(gaps.map((gap) => gap * gap)));
  const meanGap = mean(gaps);
  const withinTolerance = gaps.filter((gap) => gap <= PROFILE_FIT.attributeTolerance).length;
  return {
    rmsGap,
    meanGap,
    withinTolerance,
    close: rmsGap <= PROFILE_FIT.maxRmsGap && withinTolerance / gaps.length >= PROFILE_FIT.minOverlap,
  };
}

export function profileResults(queryRecord, candidates, attributes, levelWeight, count = 5) {
  const ranked = topProfileMatches(queryRecord, candidates, attributes, levelWeight, candidates.length)
    .map((match) => ({ ...match, fit: assessProfileMatch(queryRecord, match.record, attributes) }));
  const close = ranked.filter((match) => match.fit.close);
  return { hasCloseMatch: close.length > 0, matches: (close.length ? close : ranked).slice(0, count) };
}

function profileDistance(queryRecord, candidateRecord, attributes, levelWeight) {
  const query = vectorFor(queryRecord, attributes);
  const candidate = vectorFor(candidateRecord, attributes);
  const queryMean = mean(query);
  const candidateMean = mean(candidate);

  let shape = 0;
  for (let i = 0; i < attributes.length; i += 1) {
    const gap = (candidate[i] - candidateMean) - (query[i] - queryMean);
    shape += gap * gap;
  }

  const levelGap = candidateRecord.level - queryRecord.level;
  return Math.sqrt(shape + levelWeight * levelGap * levelGap);
}

function traitDistance(queryRecord, candidateRecord, columns) {
  let total = 0;
  for (const attribute of columns) {
    const gap = candidateRecord.attributes[attribute] - queryRecord.attributes[attribute];
    total += gap * gap;
  }
  return Math.sqrt(total);
}

function ranked(records, distanceFor) {
  return records
    .map((record, index) => ({
      record,
      index,
      distance: distanceFor(record),
    }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index);
}

export function topProfileMatches(queryRecord, candidates, attributes, levelWeight, count = 5) {
  return ranked(
    candidates,
    (candidate) => profileDistance(queryRecord, candidate, attributes, levelWeight),
  ).slice(0, count);
}

export function topTraitMatches(queryRecord, candidates, count = 3) {
  const output = {};
  for (const [trait, columns] of Object.entries(TRAITS)) {
    output[trait] = ranked(
      candidates,
      (candidate) => traitDistance(queryRecord, candidate, columns),
    ).slice(0, count);
  }
  return output;
}
