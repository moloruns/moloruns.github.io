import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributeComparison,
  candidatesFor,
  selectPokedexRecords,
} from "../js/catalog_logic.js";

// The student chose this behavior; Codex translated it into executable code.
test("a Pokémon query only includes eligible NBA players", () => {
  const data = {
    players: [
      { slug: "eligible-first", match_pool: true, overall_2k: 70 },
      { slug: "ineligible", match_pool: false, overall_2k: 99 },
      { slug: "missing-flag", overall_2k: 99 },
      { slug: "eligible-second", match_pool: true, overall_2k: 85 },
    ],
    pokemon: [],
  };
  const before = structuredClone(data);

  const result = candidatesFor("pokemon", data);

  assert.deepEqual(result.map((player) => player.slug), ["eligible-first", "eligible-second"]);
  assert.strictEqual(result[0], data.players[0]);
  assert.deepEqual(data, before);
});

test("a player query uses the Pokémon collection without NBA eligibility filtering", () => {
  const pokemon = [{ slug: "pikachu" }, { slug: "eevee", match_pool: false }];
  const data = { pokemon, players: [{ slug: "nba", match_pool: true }] };

  assert.strictEqual(candidatesFor("player", data), pokemon);
  assert.deepEqual(candidatesFor("player", data).map((record) => record.slug), ["pikachu", "eevee"]);
});

test("an empty NBA candidate pool returns an empty array", () => {
  assert.deepEqual(candidatesFor("pokemon", { players: [], pokemon: [{ slug: "pikachu" }] }), []);
});

function pokemonRecord(slug, name = slug, types = ["normal"]) {
  return { slug, name, types };
}

test("Pokédex partitions playable records in source order and retains record identity", () => {
  const pokemon = ["eevee", "pikachu", "ditto", "charizard"].map((slug) => pokemonRecord(slug));
  const playable = [{ slug: "charizard" }, { slug: "pikachu" }];
  const before = structuredClone({ pokemon, playable });

  const { roster, filtered } = selectPokedexRecords(pokemon, playable, "");

  assert.deepEqual(roster.map((record) => record.slug), ["pikachu", "charizard"]);
  assert.deepEqual(filtered.map((record) => record.slug), ["eevee", "ditto"]);
  assert.strictEqual(roster[0], pokemon[1]);
  assert.strictEqual(filtered[0], pokemon[0]);
  assert.deepEqual({ pokemon, playable }, before);
});

test("blank Pokédex search returns the first 72 non-playable records", () => {
  const others = Array.from({ length: 75 }, (_, index) => pokemonRecord(`other-${index}`));
  const pokemon = [pokemonRecord("pinned-first"), ...others.slice(0, 30),
    pokemonRecord("pinned-middle"), ...others.slice(30)];
  const playable = [{ slug: "pinned-first" }, { slug: "pinned-middle" }];
  const expected = Array.from({ length: 72 }, (_, index) => `other-${index}`);

  for (const query of ["", "  \t\n"]) {
    const result = selectPokedexRecords(pokemon, playable, query);
    assert.deepEqual(result.filtered.map((record) => record.slug), expected);
    assert.deepEqual(result.roster.map((record) => record.slug), ["pinned-first", "pinned-middle"]);
  }
});

test("Pokédex search normalizes accents, case and spaces and matches inside name, slug or second type", () => {
  const pokemon = [
    pokemonRecord("first", "Flabébé", ["fairy"]),
    pokemonRecord("regional-fox", "Vulpix", ["ice"]),
    pokemonRecord("third", "Gengar", ["ghost", "poison"]),
  ];
  const cases = [["  BÉBÉ  ", "first"], ["ONAL-FO", "regional-fox"], ["oiso", "third"]];
  for (const [query, slug] of cases) {
    assert.deepEqual(selectPokedexRecords(pokemon, [], query).filtered.map((record) => record.slug), [slug]);
  }
});

test("a nonempty Pokédex search is not capped at 72 results", () => {
  const pokemon = Array.from({ length: 75 }, (_, index) => pokemonRecord(`match-${index}`));
  const result = selectPokedexRecords(pokemon, [], "match");

  assert.deepEqual(result.filtered.map((record) => record.slug),
    Array.from({ length: 75 }, (_, index) => `match-${index}`));
});

test("an unmatched Pokédex query leaves the playable roster pinned", () => {
  const pokemon = [pokemonRecord("pikachu"), pokemonRecord("eevee")];
  const result = selectPokedexRecords(pokemon, [{ slug: "pikachu" }], "no-such-pokemon");

  assert.deepEqual(result.filtered, []);
  assert.deepEqual(result.roster.map((record) => record.slug), ["pikachu"]);
});

test("attribute comparison returns absolute gaps and extrema in the requested order", () => {
  const query = { attributes: { speed: 10, power: 90 } };
  const match = { attributes: { speed: 40, power: 70 } };
  const attributes = ["power", "speed"];
  const before = structuredClone({ query, match, attributes });

  assert.deepEqual(attributeComparison(query, match, attributes), {
    rows: [
      { attribute: "power", query: 90, match: 70, gap: 20 },
      { attribute: "speed", query: 10, match: 40, gap: 30 },
    ],
    minGap: 20,
    maxGap: 30,
  });
  assert.deepEqual({ query, match, attributes }, before);
});

test("equal absolute gaps preserve both rows and tied extrema", () => {
  assert.deepEqual(attributeComparison(
    { attributes: { speed: 10, power: 40 } },
    { attributes: { speed: 30, power: 20 } },
    ["speed", "power"],
  ), {
    rows: [
      { attribute: "speed", query: 10, match: 30, gap: 20 },
      { attribute: "power", query: 40, match: 20, gap: 20 },
    ],
    minGap: 20,
    maxGap: 20,
  });
});

test("empty comparison attributes preserve empty rows and infinite extrema", () => {
  assert.deepEqual(attributeComparison({ attributes: {} }, { attributes: {} }, []), {
    rows: [], minGap: Infinity, maxGap: -Infinity,
  });
});
