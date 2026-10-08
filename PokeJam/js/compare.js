import {
  initials,
  label,
  loadGameData,
  pokemonArtworkUrl,
  pokemonSpriteUrl,
  recordSummary,
  resolveSearch,
  searchItems,
} from "./data.js";
import { profileResults, topTraitMatches } from "./match.js";

let data;
let chart;

const elements = {
  form: document.querySelector("#compare-form"),
  input: document.querySelector("#query"),
  datalist: document.querySelector("#search-options"),
  message: document.querySelector("#message"),
  pokemonCard: document.querySelector("#pokemon-card"),
  playerCard: document.querySelector("#player-card"),
  chart: document.querySelector("#radar-chart"),
  whole: document.querySelector("#whole-matches"),
  traits: document.querySelector("#trait-matches"),
  why: document.querySelector("#why-match"),
};

function setQueryParams(kind, record) {
  const url = new URL(window.location);
  url.searchParams.set("kind", kind);
  url.searchParams.set("q", record.slug || record.name);
  window.history.replaceState({}, "", url);
}

function kindForCandidates(queryKind) {
  return queryKind === "pokemon" ? "player" : "pokemon";
}

function candidatesFor(queryKind) {
  if (queryKind === "pokemon") {
    return data.players.filter((record) => record.match_pool);
  }
  return data.pokemon;
}

function createPokemonArt(record) {
  const img = document.createElement("img");
  img.src = pokemonArtworkUrl(data.pokemonPayload, record);
  img.alt = record.name;
  img.onerror = () => {
    img.onerror = null;
    img.src = pokemonSpriteUrl(data.pokemonPayload, record);
  };
  return img;
}

function createPlayerArt(record) {
  if (record.image_url) {
    const img = document.createElement("img");
    img.className = "player-photo";
    img.src = record.image_url;
    img.decoding = "async";
    img.alt = record.name;
    img.onerror = () => {
      const parent = img.parentElement;
      img.remove();
      const badge = createPlayerBadge(record);
      badge.classList.add("image-fallback");
      badge.setAttribute("title", "Image unavailable");
      if (parent) parent.append(badge);
    };
    return img;
  }
  return createPlayerBadge(record);
}

function createPlayerBadge(record) {
  const badge = document.createElement("div");
  badge.className = "initials-badge";
  badge.textContent = initials(record.name);
  badge.setAttribute("aria-label", record.name);
  return badge;
}

function starRating(name, value) {
  const row = document.createElement("div");
  row.className = "profile-star-row";
  const title = document.createElement("span");
  title.textContent = name;
  const stars = document.createElement("span");
  stars.className = "profile-stars";
  stars.setAttribute("role", "img");
  stars.setAttribute("aria-label", `${name}: ${value} out of 5 stars`);
  for (let i = 0; i < 5; i++) {
    const star = document.createElement("span");
    star.className = "rating-star";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(0, Math.min(1, value - i)) * 100}%`;
    star.append(fill);
    stars.append(star);
  }
  const number = document.createElement("b");
  number.textContent = `${value.toFixed(1)} / 5`;
  row.append(title, stars, number);
  return row;
}

function profileRatings(kind, record) {
  const root = document.createElement("section");
  root.className = "profile-ratings";
  root.setAttribute("aria-label", `${record.name} ratings`);
  if (kind === "pokemon") {
    root.append(starRating("Overall", record.stars.overall));
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Attribute Stars";
    const rows = document.createElement("div");
    rows.className = "profile-star-list";
    for (const attribute of [...data.attributes, "clutch"]) rows.append(starRating(label(attribute), record.stars[attribute]));
    details.append(summary, rows);
    root.append(details);
  } else {
    const heading = document.createElement("span");
    heading.textContent = "2K Overall";
    const rating = document.createElement("strong");
    rating.className = "profile-overall";
    rating.textContent = record.overall_2k;
    root.append(heading, rating);
  }
  return root;
}

function renderProfileCard(container, kind, record, isQuery, hasCloseMatch) {
  const art = kind === "pokemon" ? createPokemonArt(record) : createPlayerArt(record);
  const tags = kind === "pokemon" ? record.types : record.positions;

  container.innerHTML = "";
  const artBox = document.createElement("div");
  artBox.className = "profile-art";
  artBox.append(art);

  const title = document.createElement("h2");
  title.textContent = record.name;

  const meta = document.createElement("div");
  meta.className = "meta-line";
  meta.textContent = recordSummary(kind, record);

  const role = document.createElement("div");
  role.className = "small-text";
  role.textContent = isQuery ? "Search" : hasCloseMatch ? "Close whole-profile match" : "Closest available profile";

  const tagRow = document.createElement("div");
  tagRow.className = "tag-row";
  for (const tag of tags) {
    const item = document.createElement("span");
    item.className = "tag";
    item.textContent = tag;
    tagRow.append(item);
  }

  container.append(role, artBox, title, profileRatings(kind, record), meta, tagRow);
}

function chartDataset(record, kind, color) {
  return {
    label: `${record.name} (${kind === "pokemon" ? "Pokemon" : "NBA"})`,
    data: data.attributes.map((attribute) => record.attributes[attribute]),
    borderColor: color,
    backgroundColor: color.replace("1)", "0.18)"),
    pointBackgroundColor: color,
    borderWidth: 2,
  };
}

function renderChart(queryKind, queryRecord, matchKind, matchRecord) {
  const labels = data.attributes.map(label);
  const datasets = [
    chartDataset(queryRecord, queryKind, "rgba(255, 77, 90, 1)"),
    chartDataset(matchRecord, matchKind, "rgba(94, 200, 255, 1)"),
  ];

  if (!chart) {
    chart = new Chart(elements.chart, {
      type: "radar",
      data: { labels, datasets },
      options: {
        responsive: true,
        animation: false,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              display: false,
              stepSize: 20,
            },
            grid: { color: "rgba(255, 255, 255, 0.14)" },
            angleLines: { color: "rgba(255, 255, 255, 0.14)" },
            pointLabels: {
              color: "#f7f7fb",
              font: { size: 11 },
            },
          },
        },
        plugins: {
          legend: {
            labels: { color: "#f7f7fb" },
          },
        },
      },
    });
  } else {
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update();
  }
}

function matchButton(kind, item, rank) {
  const button = document.createElement("button");
  button.className = "match-button";
  button.type = "button";

  const name = document.createElement("strong");
  name.textContent = `${rank}. ${item.record.name}`;

  const distance = document.createElement("span");
  distance.className = "distance";
  distance.textContent = item.distance.toFixed(1);

  button.append(name, distance);
  button.addEventListener("click", () => {
    elements.input.value = item.record.name;
    renderComparison(kind, item.record);
  });

  return button;
}

function renderWholeMatches(matchKind, matches, hasCloseMatch) {
  elements.whole.innerHTML = hasCloseMatch ? "<h3>Close Profiles</h3>" : "<h3>Closest Available Profiles</h3>";
  matches.forEach((item, index) => {
    elements.whole.append(matchButton(matchKind, item, index + 1));
  });
}

function renderTraitMatches(queryKind, matchKind, traits) {
  elements.traits.innerHTML = "<h3>Plays Like</h3>";
  for (const [trait, matches] of Object.entries(traits)) {
    if (queryKind === "player" && trait === "built like") {
      continue;
    }
    const row = document.createElement("button");
    row.className = "match-button";
    row.type = "button";
    row.innerHTML = `<strong>${trait}</strong><span>${matches[0].record.name}</span>`;
    row.addEventListener("click", () => {
      elements.input.value = matches[0].record.name;
      renderComparison(matchKind, matches[0].record);
    });
    elements.traits.append(row);

    const runners = document.createElement("div");
    runners.className = "small-text";
    runners.textContent = `Then ${matches.slice(1).map((item) => item.record.name).join(", ")}`;
    elements.traits.append(runners);
  }
}

function renderWhy(queryRecord, matchRecord, hasCloseMatch) {
  const rows = data.attributes.map((attribute) => ({
    attribute,
    query: queryRecord.attributes[attribute],
    match: matchRecord.attributes[attribute],
    gap: Math.abs(queryRecord.attributes[attribute] - matchRecord.attributes[attribute]),
  }));

  const minGap = Math.min(...rows.map((row) => row.gap));
  const maxGap = Math.max(...rows.map((row) => row.gap));

  elements.why.innerHTML = hasCloseMatch ? "<h3>Why They Match</h3>" : "<h3>Attribute Comparison</h3>";
  for (const row of rows) {
    const line = document.createElement("div");
    line.className = "attribute-row";
    if (row.gap === minGap) line.classList.add("closest");
    if (row.gap === maxGap) line.classList.add("furthest");

    line.innerHTML = `
      <div class="attribute-name">${label(row.attribute)}</div>
      <div class="bar query" title="${row.query.toFixed(1)}"><span style="width:${row.query}%"></span></div>
      <div class="bar match" title="${row.match.toFixed(1)}"><span style="width:${row.match}%"></span></div>
      <div class="distance">${row.gap.toFixed(1)}</div>
    `;
    elements.why.append(line);
  }
}

function renderComparison(queryKind, queryRecord) {
  const matchKind = kindForCandidates(queryKind);
  const candidates = candidatesFor(queryKind);
  const result = profileResults(
    queryRecord,
    candidates,
    data.attributes,
    data.profileLevelWeight,
    5,
  );
  const wholeMatches = result.matches;
  const primary = wholeMatches[0].record;
  const traits = topTraitMatches(queryRecord, candidates, 3);

  const pokemonRecord = queryKind === "pokemon" ? queryRecord : primary;
  const playerRecord = queryKind === "player" ? queryRecord : primary;

  renderProfileCard(elements.pokemonCard, "pokemon", pokemonRecord, queryKind === "pokemon", result.hasCloseMatch);
  renderProfileCard(elements.playerCard, "player", playerRecord, queryKind === "player", result.hasCloseMatch);
  renderChart(queryKind, queryRecord, matchKind, primary);
  renderWholeMatches(matchKind, wholeMatches, result.hasCloseMatch);
  renderTraitMatches(queryKind, matchKind, traits);
  renderWhy(queryRecord, primary, result.hasCloseMatch);

  const noClose = queryKind === "pokemon" ? "No close NBA match in the 78+ pool." : "No close Pokemon match.";
  elements.message.textContent = result.hasCloseMatch
    ? `Average attribute gap: ${wholeMatches[0].fit.meanGap.toFixed(1)} points.`
    : `${noClose} Closest available: ${primary.name}. Average attribute gap: ${wholeMatches[0].fit.meanGap.toFixed(1)} points.`;
  elements.message.classList.toggle("match-warning", !result.hasCloseMatch);
  setQueryParams(queryKind, queryRecord);
}

function fillSearchOptions() {
  const fragment = document.createDocumentFragment();
  for (const item of searchItems(data)) {
    const option = document.createElement("option");
    option.value = item.label;
    fragment.append(option);
  }
  elements.datalist.append(fragment);
}

function waitForChart() {
  if (window.Chart) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (window.Chart) {
        window.clearInterval(timer);
        resolve();
      } else if (attempts > 80) {
        window.clearInterval(timer);
        reject(new Error("Chart.js did not load"));
      }
    }, 50);
  });
}

function resolveFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("q");
  const preferredKind = params.get("kind");
  const found = resolveSearch(data, raw);
  if (!found || !preferredKind) {
    return found;
  }
  if (found.kind === preferredKind) {
    return found;
  }
  return found;
}

async function init() {
  data = await loadGameData();
  await waitForChart();
  fillSearchOptions();

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const found = resolveSearch(data, elements.input.value);
    if (!found) {
      elements.message.textContent = `No match for "${elements.input.value}".`;
      return;
    }
    renderComparison(found.kind, found.record);
  });

  const initial = resolveFromUrl() || { kind: "pokemon", record: data.pokemon.find((record) => record.slug === "pikachu") };
  elements.input.value = initial.record.name;
  renderComparison(initial.kind, initial.record);
}

init().catch((error) => {
  elements.message.textContent = "The comparison data could not be loaded.";
  console.error(error);
});
