# AI-Generated Development Notes

These technical notes were drafted with OpenAI Codex. See the project README
for the AI-use disclosure and a shorter introduction.

Desktop Pokemon arcade basketball, plus Pokemon/NBA comparisons using NBA 2K
attributes. Static JavaScript and Phaser; no build step or backend.

## Run

From the repository root:

```sh
python3 PokeJam/serve.py
```

The launcher opens the browser and prints the actual address (starting at port
8003, moving to a free port if occupied). Keep its terminal running; Ctrl+C stops
the preview. Pass `--no-browser` to suppress opening a tab, or `--port 8100` to
start elsewhere. Comparison and roster pages are available
from the navigation. Phaser, Lucide and fonts currently load from CDNs, so an
internet connection is required for those dependencies. Sound unlocks after
the first user interaction.

## Sharing And Hosting

`127.0.0.1` means the viewer's own computer, not a public website. A local
preview stops working when its server stops, and someone else cannot use your
loopback address. PokeJam needs static hosting, not a Render backend.

This repository is `moloruns/moloruns.github.io`. With GitHub Pages configured
to publish `main` at the repository root, committing/pushing the `PokeJam`
runtime files would make the game available at
`https://moloruns.github.io/PokeJam/play.html`. That is the intended public URL,
not confirmation that the current uncommitted app has been deployed.
See [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
Do not upload `pipeline/.env`, caches or the local prompt log. These are ignored
by Git; never force-add them. Existing unrelated repository files need no change.

For another static host or a clean hosting artifact:

```sh
python3 PokeJam/pipeline/export_site.py /tmp/pokejam-site
```

Use a new/empty destination. The export includes only the four HTML pages,
CSS, JavaScript, data, assets and their credits. It excludes development docs,
tests, import tools, logs and secrets. Relative paths support deployment beneath
`/PokeJam/` as well as at a domain root. CDN dependencies still require internet.
No deployment, commit or push is performed by these tools. Review the asset
rights notes below before distributing the prototype widely.

## Controls

| Action | Player 1 | Player 2 (co-op) |
| --- | --- | --- |
| Move | WASD (arrows also work in solo) | Arrow keys |
| Turbo | Shift | Enter |
| Shoot / dunk / steal / block | J | K |
| Pass / alley-oop / call / jockey | I | L |
| Ultimate | E; Shift + E for dunk | O; Enter + O for dunk |
| Switch mon (solo) | Q or toolbar switch | - |
| Pause | Escape or pause button | - |
| Shove (defense) | Shift + I | Enter + L |
| Final-second results preview (local/debug) | 0 | 0 |

Tap shoot without turbo to pump fake; hold to shoot or gather for a dunk within
range. Hold pass to prepare an alley-oop, then release while the teammate is
airborne. A human receiver presses their shoot button to finish. Ultimates need
full charge and possession. Baskets, steals and blocks earn charge.
Solo control follows friendly ball catches, including after a manual Q switch;
co-op assignments remain fixed.

Jumpers have a fighting-game-style gauge below the canvas, with Arc/Bar
alternatives in settings. The reserved band never covers player sprites.
Release near the target for a green grade and a stronger make chance, not an
automatic basket. Holding through an unreleased jumper's landing is travel.
Shoves cost 20 stamina and share defensive recovery; airborne and active
ultimate users are protected. Successful shoves have a power-based 10-35% chance
to stun for three seconds, reduced by burn. The temporary `0` preview is enabled on localhost
or with `?debug=1`; real tied games still enter overtime.
The shot clock is 24 seconds, with 14 after an offensive rim rebound. Passing
does not reset it; new possession does. No eight-second violation is used.
Its mini timer sits inside the scoreboard, with tenths and a warning in the final
five seconds; the floating canvas clock has been removed.
Dunks, including ultimates, score three when takeoff is outside the painted arc;
inside/on the line is two. Jumpers use that same boundary at release.
Open How to Play from the book icon in the toolbar or the main-menu link for
solo/co-op keycaps and gameplay rules. The manual pauses a live match and
preserves a match that was already paused.

## Roster And Stages

All twenty outlined mons are playable: Pikachu, Charizard, Lucario, Snorlax,
Wartortle, Venusaur, Gengar, Mewtwo, Gardevoir, Weavile, Arcanine, Onix, Marowak,
Infernape, Luxray, Croagunk, Staraptor, Darkrai, Tangrowth and Garchomp.
Play opens the team/opponent selection screen, then stage selection. Random
buttons cover individual slots, either team, the entire lineup and the stage.
Solo and co-op are available; each match still contains four distinct mons.
Indigo Arena, Sinnoh League and Unova's PWT share identical court geometry,
with distinct original illustrated backgrounds, floor colors and animated scenery.
Back preserves the draft; cancel preserves the live/completed match. The lineup
toolbar and results button reopen setup. Rematches retain the selected stage.
The menu previews each selection's existing model overall, ultimate and on-fire
package. Rematches keep your lineup; changing lineups resets the entire match.
`data/playable_roster.json` is the shared roster and presentation manifest; the
Pokedex's playable section reflects the full twenty.
Two-minute quarters, basketball score, independent style score, player meters,
results/rematch, volume controls and reduced effects are implemented.
Animated canvas portrait icons show charge percentages, stamina and control/READY
status above the court. The stage name sits on a rear-corner tournament plaque.

Directional movement uses real action-sheet frames. Passing, shooting and
dunking reuse available attack/charge poses rather than custom basketball art.
The sixteen newer mons also have species-specific native reach, block, slam, cast and
celebration poses, timed to basketball events. Gengar floats and reaches with its
tongue; Mewtwo hovers and uses punch/special-attack frames; Gardevoir casts and
celebrates with Appeal; Weavile uses Quick Strike. Venusaur has a heavier stride,
Strike dunk and Shake celebration; Wartortle uses Swing and Hop. Turbo/slowdowns
adjust walking cadence. Subtle lean, recoil and landing squash are visual only;
Reduced Effects removes that secondary motion while retaining native frames.
Passing, catching, pump fakes, shot gather/release, dunks, casts and celebrations
now progress through short timed sequences instead of truncating slow source
animations. Freeze/sleep stop them; pause and reset clear/freeze them correctly.
Audio is synthesized; optional spoken callouts use the browser's speech voice.
See [current scope](../SPEC.md) and [attribute model](model.md).
See [on-fire rules](../on_fire.md) for enabled perks, status durations and editable
named assignments. Freeze/sleep use alternating J/I presses (K/L for P2).
All 18 type fallbacks exist. This batch adds Gengar's Shadow Ball, Mewtwo's
Psystrike and Gardevoir's Moonblast signature ultimates. Wartortle, Venusaur and
Weavile use Water, Grass and Dark generic finishes; Shift + E forces a dunk.
Their on-fire packages are Hydro Pump, Razor Blade, Shadow Ball, Psybeam,
Hypnosis + Unlimited Passing, and Powder Snow + Sucker Punch respectively.
Dual types get one automatic active move and their applicable passive perks.
The final ten use their outlined signatures where given: Infernape's Flame Wheel,
Darkrai's Dark Void and Garchomp's Earthquake. Other finishes and fire perks use
the existing type rules; no extra unapproved attack streams were added.
Staraptor hovers, Onix slams, Marowak swings, Infernape spins, and native
cast/celebration frames also appear in the canvas HUD portraits.
Visible neutral silhouettes determine a stable, bounded court scale, rather than
transparent sheet dimensions. Venusaur is deliberately bulkier than Wartortle
in all eight directions. Every action retains that neutral scale to avoid jitter.
These are playable mechanics with reused action poses and procedural move effects,
not newly authored basketball sprite animations. Asset credits remain applicable.
Shove frames stay centered on the visible body, with a gentler Arcanine brace
and a short recovery. Darkrai keeps its upright idle instead of switching into
a prone float. These changes do not alter shove hit chances or knockback.
The gauge has symmetric beveled rails, clipped fills and a double-resolution
canvas for clean edges, with unchanged shot timing and green windows.
Non-scoring attack perks also work off ball, including defensive Flamethrower.
Three consecutive makes activate 15 seconds of fire. Each make while active adds
five seconds; only expiry, an opposing basket or a direct steal ends it. Misses
reset the pre-activation streak, not active fire. Pause and dead inbounds freeze
the timer, and remaining seconds appear beside the owner's portrait name.
READY portraits and court sprites carry animated typed auras; reduced effects
keeps static readiness markings.

## Verification

Browser regression checks use Python Playwright and Pillow. Set `CHROME` in each
test to the installed Chrome executable for your machine. With the server running:

```sh
python3 PokeJam/tests/browser_game.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_finishes.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_arena.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_phase21.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_shotclock.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_fire_perks.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_courtside.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_fire_timer.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_roster.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_animations.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_full_roster.py http://127.0.0.1:8002
python3 PokeJam/tests/browser_match_setup.py http://127.0.0.1:8002
```

`?test=1` exposes the match scene for deterministic fixtures. Narrow screenshots
check desktop window layout only. Mobile gameplay and Render/AI announcer work
are removed from scope; optional browser speech remains a local sound setting.
Run the full suite with `python3 PokeJam/tests/run_browser_suites.py URL`.

To import/update selected action sheets while preserving the other entries:

```sh
python3 PokeJam/pipeline/fetch_action_sprites.py wartortle venusaur gengar mewtwo gardevoir weavile
```

The importer reads the shared roster, resolves source animation aliases and
imports the additional native poses referenced by each animation profile. It
retains original per-species source XML/credits. Run the roster asset audit and
browser checks after an art update.

## Files

- Four HTML pages, `css/`, `js/`, `data/`, `assets/`: the static app.
- `serve.py`: the reliable desktop preview launcher.
- `pipeline/`: source fetchers, model formulas/CSV inputs, validation, asset audit
  and static export. Ignored caches and API credentials stay local.
- `tests/`: browser regression checks.
- `SPEC.md`, `docs/model.md`, `on_fire.md`, this README: current documentation.
- `prompt_log.txt`: your preserved local work log, excluded from publication.

Superseded phase blueprints/revision reports have been retired. Before removal,
their contents and old spec were backed up outside the repository in
`/tmp/pokejam-retired-20261007.tar.gz`. Source artwork, XML, licenses and credits
are retained even when an unused imported animation sheet is pruned.

## Asset Rights

Noncommercial fan prototype; no affiliation with Nintendo, The Pokemon Company,
the NBA or 2K. Local action sheets include original credits and source records in
[art credits](../assets/animations/CREDITS.md). Some official-game sprite rights are
unresolved; attribution and a fan disclaimer do not grant permission. Review or
replace those assets before public distribution, especially commercial release.
