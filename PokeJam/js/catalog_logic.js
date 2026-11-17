import { plain } from "./data.js";

// Playable records stay pinned; only the rest of the catalog follows the search.
export function selectPokedexRecords(pokemon, playablePlayers, rawQuery) {
  const query = plain(rawQuery);
  const playable = new Set(playablePlayers.map((entry) => entry.slug));
  const roster = pokemon.filter((record) => playable.has(record.slug));
  const others = pokemon.filter((record) => !playable.has(record.slug));
  const filtered = query
    ? others.filter((record) => plain(`${record.name} ${record.slug} ${record.types.join(" ")}`).includes(query))
    : others.slice(0, 72);

  return { roster, filtered };
}

export function candidatesFor(queryKind, data) {
  if (queryKind === "pokemon") {
    return data.players.filter((record) => !record.match_pool);
  }
  return data.pokemon;
}

export function attributeComparison(queryRecord, matchRecord, attributes) {
  const rows = attributes.map((attribute) => ({
    attribute,
    query: queryRecord.attributes[attribute],
    match: matchRecord.attributes[attribute],
    gap: Math.abs(queryRecord.attributes[attribute] - matchRecord.attributes[attribute]),
  }));

  const minGap = Math.min(...rows.map((row) => row.gap));
  const maxGap = Math.max(...rows.map((row) => row.gap));

  return { rows, minGap, maxGap };
}
