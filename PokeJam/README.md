# PokeJam

PokeJam is a desktop web game that combines Pokemon with NBA Jam-inspired
2v2 arcade basketball. Pick a team, choose an arena, and play against computer
opponents alone or with a friend on the same keyboard. A companion comparison
tool maps Pokemon and NBA 2K player ratings onto a shared basketball profile.

[Play PokeJam](https://moloruns.github.io/PokeJam/play.html) |
[Game source](https://github.com/moloruns/moloruns.github.io/blob/main/PokeJam/js/play.js)

The public link is the GitHub Pages destination. A local commit alone does not
publish updates; it requires pushing to the repository's configured Pages source.

## How To Play

Open Play, choose your two Pokemon and the opposing pair, then select Indigo
Arena, Sinnoh League, or the Pokemon World Tournament. Random selections are
available for teams and stages. Choose Solo or Co-op; the book button opens
the in-game How to Play guide.

| Action | Player 1 | Player 2 |
| --- | --- | --- |
| Move | WASD | Arrow keys |
| Turbo | Shift | Enter |
| Shoot, dunk, steal, or block | J | K |
| Pass, alley-oop, call, or guard | I | L |
| Ultimate finish | E | O |
| Force an ultimate dunk | Shift + E | Enter + O |
| Shove while defending | Shift + I | Enter + L |
| Switch Pokemon in Solo | Q | - |
| Pause | Escape | - |

Tap shoot without turbo to pump fake. Hold it to jump, then release near the
green target on the off-court timing meter; holding until you land is a travel.
Near the hoop, holding shoot initiates a dunk instead. Hold pass to prepare an
alley-oop and release while your teammate is airborne. A CPU finishes it
automatically; a human receiver presses their shoot key.

Solo control follows the friendly player receiving the ball. Baskets, steals
and blocks charge an ultimate, and a typed aura shows when it is ready. Three
consecutive baskets activate on fire for 15 seconds, enabling Pokemon perks;
another basket adds five seconds. An opposing basket or direct steal ends fire,
but a miss does not. Freeze and sleep can be escaped by alternating shoot/pass.

Matches have four two-minute quarters, overtime for ties, and a 24-second shot
clock. Dunks launched outside the arc count as three. Results show basketball
and style scores, with rematch and new-lineup options. Gameplay is desktop-only;
there are no touch controls or online multiplayer.

## Project Highlights

- Twenty playable Pokemon with directional action animations, signature or
  type-based ultimate finishes, and animated portrait/READY effects.
- On-fire move packages across all eighteen types, including status effects,
  opponent-only targeting, defensive perks, and timed recovery.
- Three illustrated stadiums with projected courts, hoops, animated crowds,
  synthesized audio, and optional browser-voice callouts.
- Shot timing, contextual offense/defense controls, alley-oops, shoves, and
  separate style scoring, all running in the browser without a backend.
- Pokemon/NBA comparisons with overall/star displays and an absolute-fit check:
  a distant nearest neighbor is labeled a closest match, not a good equivalence.
- Thirteen browser regression suites covering gameplay, animation, team/stage
  selection, status effects, resets, and layout.

These are the project's standout features, not a claim that every mechanic is
finished. Basketball actions reuse existing attack/cast poses; CPU behavior and
custom basketball animation remain areas for refinement.

## Run Locally

Requires Python 3 and a desktop browser. From the repository root:

```sh
python3 PokeJam/serve.py
```

The launcher opens the browser and prints its address, starting at port 8003
and choosing another if necessary. Keep that terminal running; Ctrl+C stops
the server. Use `--no-browser` or `--port 8100` as needed. Phaser, Chart.js,
Lucide, and fonts load from CDNs, so an internet connection is required.
Sound starts after a user interaction. No npm install, build step, or API key
is needed to play. Open Compare or Pokedex from the navigation to explore data.

`127.0.0.1` works only on the viewer's own computer. Public play uses static
hosting such as GitHub Pages, not a Render service. For a runtime-only export:

```sh
python3 PokeJam/pipeline/export_site.py /tmp/pokejam-site
```

Use a new or empty destination. The export retains artwork credits and excludes
development tools, tests, local logs, caches, and credentials.

## Source And Testing

The main gameplay file is [js/play.js](js/play.js). Other modules own animation,
arena rendering, team selection, finishes, perks, audio, and comparisons.
`data/` contains exported model/roster data; `assets/` contains images and credits.
The Python `pipeline/` rebuilds data; Python is not a production game backend.

With Python Playwright, Pillow, and Chrome installed, set the `CHROME` path in
the browser tests for your machine, then use the actual preview address:

```sh
python3 PokeJam/tests/run_browser_suites.py http://127.0.0.1:8003
python3 PokeJam/pipeline/audit_assets.py
```

See [current scope](SPEC.md), [attribute model](docs/model.md),
[on-fire rules](on_fire.md), and [AI-generated development notes](docs/development.md)
for implementation details. Narrow-window layout checks are not mobile support.

## Secrets

The browser game has no runtime secrets. The optional NBA data-import script
reads an API key from `pipeline/.env`, which is ignored by Git. Raw fetch caches,
Python caches, the local prompt log, and build exports are ignored too.
Only exported public JSON reaches the browser; never put an API key in JavaScript
or those JSON files, and never force-add `.env` or the local prompt log.

## Sources And Credits

- [Phaser](https://phaser.io/) supplies the game engine; Chart.js and Lucide
  supply charts and interface icons.
- [PokeAPI](https://pokeapi.co/) supplies Pokemon data and fallback art.
- [NBA 2K API](https://nba2kapi.com/) provides NBA 2K ratings sourced from
  2K Ratings; this is not current-season box-score data.
- [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab) supplies
  character action sheets. Original XML, source licenses, and per-species
  credits are retained in [animation credits](assets/animations/CREDITS.md).
- Arena backgrounds were AI-generated for this project, not extracted from
  NBA Jam or King of Fighters. Prompts and provenance are in
  [arena credits](assets/arenas/CREDITS.md).

This is a noncommercial fan prototype, not affiliated with Nintendo, The
Pokemon Company, the NBA, or 2K. Some official-game sprite permissions remain
unresolved; attribution is not permission. Review or replace those assets
before broader distribution, particularly commercial use.

## AI Use And AI-Generated Documentation

**This is an AI-assisted project. [OpenAI Codex](https://openai.com/codex/) produced a substantial portion
of the implementation and tests, and drafted this README and the technical
documentation. These are not presented as independently human-written work.**

The developer supplied the game concept, model/design direction, controls,
move/perk requirements, and iterative playtesting feedback. Codex was used to
help plan, implement, debug, test, and document that design. The built-in
AI image-generation tool created the three stadium backdrops. Existing Pokemon
sprites came from the credited sources above, not from AI generation.

This README is an AI-generated draft for the developer to review and adapt;
it does not substitute for a required personal, own-words coursework write-up.
AI-generated documentation is identified here and in the linked development
notes. AI assistance does not establish correctness or clear third-party rights.
