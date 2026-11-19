# Browser verification after branch cleanup

AI-generated factual evidence, November 19, 2026.

Checked branch `pokejam-tests` at `084ea92ab428da1000faf228f8fd26fc1ec3915a` using installed Google Chrome through
Python Playwright in `/tmp/pokejam-hw9-browser`. This temporary environment
provides the previously missing browser dependency without changing application
dependencies. The local launcher served PokeJam at `http://127.0.0.1:8005`.

## Passed checks

- Pokédex: 20 pinned playable cards and 72 default catalog cards.
- Name search with mixed case and surrounding spaces; type search; unknown
  search returns no catalog cards while keeping the pinned roster.
- Direct `compare.html?kind=pokemon&q=pikachu` navigation; both profile cards;
  two radar-chart datasets; ten attribute rows with minimum/maximum highlights.
- NBA-to-Pokémon comparison; match-button navigation; unknown comparison query.
- Normal `play.html` loads the 20-character setup menu.
- A chosen four-character lineup and Sinnoh arena start successfully.
- Movement changes the controlled player's position; Escape pauses and resumes.
- No uncaught JavaScript errors in the completed gameplay check.

The completed gameplay check exited 0. Its two console resource errors were
requests for `/favicon.ico`, confirmed against the preview server log. They did
not prevent rendering or gameplay. No application source was changed for this
verification. These are focused smoke checks, not all thirteen Python regression
suites or a full match playthrough.

## Raw output and harness correction

[UI check output](logs/browser-ui-smoke-2026-11-19.txt) records the successful
Pokédex and comparison checks, then a timeout in the initial gameplay harness.
That harness mistakenly expected `window.pokeJamGame` on the production URL;
`js/play.js` exposes that debug variable only with the `test` query parameter.
The timeout therefore does not establish a game startup failure.

The corrected check first verified the normal production page's visible menu,
then used the existing `play.html?test=1&setup=1` hook to inspect game state during
lineup selection, movement and pause/resume. It passed; see
[gameplay output](logs/browser-game-smoke-2026-11-19.txt).

This result supersedes earlier notes that browser checks were unavailable.
The original baseline was not run retroactively; its missing-dependency result
remains part of the historical record. The owned preview server was stopped
after verification.
