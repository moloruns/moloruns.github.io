import { label, loadGameData, plain, pokemonSpriteUrl } from "./data.js";

const elements = {
  roster: document.querySelector("#roster-cards"),
  all: document.querySelector("#all-cards"),
  search: document.querySelector("#pokedex-search"),
};

let data;
let playableRoster;

function starWidth(value) {
  return `${Math.max(0, Math.min(100, (value / 5) * 100))}%`;
}

function starRow(name, value) {
  const row = document.createElement("div");
  row.className = "star-row";
  row.innerHTML = `
    <span>${name}</span>
    <span class="star-meter" aria-label="${value} of 5"><span style="width:${starWidth(value)}"></span></span>
  `;
  return row;
}

function pokemonCard(record) {
  const card = document.createElement("article");
  card.className = "card pokemon-card";

  const top = document.createElement("div");
  top.className = "pokemon-card-top";

  const img = document.createElement("img");
  const playable = playableRoster.players.some((entry) => entry.slug === record.slug);
  img.src = playable ? `assets/pokemon/${record.slug}.png` : pokemonSpriteUrl(data.pokemonPayload, record);
  img.alt = record.name;

  const title = document.createElement("div");
  title.innerHTML = `
    <h3>${record.name}</h3>
    <div class="small-text">#${record.id} / ${record.types.join("/")} / ${record.roster || `gen ${record.generation}`}</div>
  `;

  top.append(img, title);

  const tags = document.createElement("div");
  tags.className = "tag-row";
  for (const type of record.types) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = type;
    tags.append(tag);
  }
  for (const bonus of record.bonuses) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `+ ${label(bonus)}`;
    tags.append(tag);
  }

  const stars = document.createElement("div");
  stars.className = "stars-grid";
  stars.append(starRow("Overall", record.stars.overall));
  for (const attribute of data.attributes) {
    stars.append(starRow(label(attribute), record.stars[attribute]));
  }
  stars.append(starRow("Clutch", record.stars.clutch));

  const compare = document.createElement("a");
  compare.className = "button-link";
  compare.href = `compare.html?kind=pokemon&q=${encodeURIComponent(record.slug)}`;
  compare.textContent = "Compare";

  card.append(top, tags, stars, compare);
  return card;
}

function renderCards() {
  const query = plain(elements.search.value);
  const playable = new Set(playableRoster.players.map((entry) => entry.slug));
  const roster = data.pokemon.filter((record) => playable.has(record.slug));
  const others = data.pokemon.filter((record) => !playable.has(record.slug));
  const filtered = query
    ? others.filter((record) => plain(`${record.name} ${record.slug} ${record.types.join(" ")}`).includes(query))
    : others.slice(0, 72);

  elements.roster.innerHTML = "";
  for (const record of roster) {
    elements.roster.append(pokemonCard(record));
  }

  elements.all.innerHTML = "";
  for (const record of filtered) {
    elements.all.append(pokemonCard(record));
  }
}

async function init() {
  data = await loadGameData();
  const response = await fetch("data/playable_roster.json");
  if (!response.ok) throw new Error("Playable roster missing");
  playableRoster = await response.json();
  elements.search.addEventListener("input", renderCards);
  renderCards();
}

init().catch((error) => {
  console.error(error);
});
