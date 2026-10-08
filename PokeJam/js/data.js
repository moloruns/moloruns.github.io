const dataCache = {
  promise: null,
};

export const TRAITS = {
  "scores like": ["shooting", "layup", "dunk"],
  "handles like": ["passing", "ball_handling", "speed"],
  "defends like": ["steal", "block"],
  "built like": ["speed", "power", "rebound"],
};

export function plain(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function label(attribute) {
  return attribute.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function loadGameData() {
  if (!dataCache.promise) {
    dataCache.promise = Promise.all([
      fetch("data/pokemon.json").then((response) => response.json()),
      fetch("data/nba_players.json").then((response) => response.json()),
      fetch("data/player_images.json").then((response) => response.ok ? response.json() : { players: {} })
        .catch(() => ({ players: {} })),
    ]).then(([pokemonPayload, nbaPayload, portraits]) => {
      const attributes = pokemonPayload.meta.attributes;
      for (const player of nbaPayload.players) {
        player.image_url = portraits.players[player.slug]?.path || "";
      }
      return {
        pokemonPayload,
        nbaPayload,
        pokemon: pokemonPayload.pokemon,
        players: nbaPayload.players,
        attributes,
        profileLevelWeight: pokemonPayload.meta.profile_level_weight,
      };
    });
  }
  return dataCache.promise;
}

export function pokemonArtworkUrl(payload, pokemon) {
  return payload.meta.artwork_url.replace("{id}", pokemon.id);
}

export function pokemonSpriteUrl(payload, pokemon) {
  return payload.meta.sprite_url.replace("{id}", pokemon.id);
}

export function pokemonCryUrl(payload, pokemon) {
  return payload.meta.cry_url.replace("{id}", pokemon.id);
}

export function initials(name) {
  const parts = String(name).split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function searchItems(data) {
  const pokemon = data.pokemon.map((record) => ({
    kind: "pokemon",
    record,
    label: record.name,
    search: plain(`${record.name} ${record.slug} pokemon`),
  }));

  const players = data.players.map((record) => ({
    kind: "player",
    record,
    label: `${record.name} - ${record.team}`,
    search: plain(`${record.name} ${record.team} ${record.positions.join(" ")} nba`),
  }));

  return [...pokemon, ...players];
}

export function resolveSearch(data, rawQuery) {
  const query = plain(rawQuery);
  if (!query) {
    return { kind: "pokemon", record: data.pokemon.find((record) => record.slug === "pikachu") };
  }

  const items = searchItems(data);
  const exact = items.find((item) => (
    plain(item.record.name) === query || plain(item.record.slug) === query || plain(item.label) === query
  ));
  if (exact) {
    return { kind: exact.kind, record: exact.record };
  }

  const starts = items.find((item) => item.search.startsWith(query));
  if (starts) {
    return { kind: starts.kind, record: starts.record };
  }

  const contains = items.find((item) => item.search.includes(query));
  if (contains) {
    return { kind: contains.kind, record: contains.record };
  }

  return null;
}

export function recordSummary(kind, record) {
  if (kind === "pokemon") {
    const roster = record.roster ? `${record.roster[0].toUpperCase()}${record.roster.slice(1)} roster` : `Generation ${record.generation}`;
    return `#${record.id} / ${record.types.join("/")} / BST ${record.bst} / ${roster}`;
  }
  return `${record.team} / ${record.positions.join("/")} / ${record.archetype} / 2K ${record.overall_2k}`;
}
