# PokeJam: Current Scope

Desktop-only, static JavaScript/Phaser 2v2 arcade basketball with Pokemon.
NBA comparisons use NBA 2K attributes, not season box-score statistics.
This document replaces the retired specifications and phase blueprints.
The working implementation, [README](README.md), [model](docs/model.md) and
[on-fire rules](on_fire.md) are the current references.

## Match

- Solo with a CPU teammate, or two keyboard players against the CPU.
- Team/opponent selection precedes stage selection; both support random picks.
- Four two-minute quarters, then overtime if tied.
- 24-second possessions; 14 on an offensive rim rebound; no eight-second rule.
- Jump shots use a reserved, off-court timing gauge. Green improves probability.
- Dunk eligibility depends on range and attributes. Takeoff outside the arc is three.
- Passes, alley-oops, pump fakes, rebounds, steals, blocks, shoves and boundaries.
- Holding an unreleased jumper through landing is an up-and-down violation.
- Solo control follows friendly possession, including resets; Q also switches.
- Pause, settings, How to Play, match results, rematch and change-lineup actions.
- Basketball score and style score are separate.
- Baskets, steals and blocks earn ultimate charge. Every mon has a typed finish.
- Three consecutive makes ignite 15 seconds of fire; makes add five seconds.
  Misses do not extinguish active fire. Expiry, an opposing basket or a direct
  steal does. On-fire abilities/statuses affect opponents, never teammates.
- One court spot means 32 units. Shove mechanics stay independent of animation.

## Twenty Playable Mons

| Project Group | Pokemon | Ultimate |
| --- | --- | --- |
| Kanto | Wartortle | Typed Water finish |
| Kanto | Charizard | Flare Blitz |
| Kanto | Venusaur | Typed Grass finish |
| Kanto | Gengar | Shadow Ball |
| Kanto | Mewtwo | Psystrike |
| Kanto | Arcanine | Typed Fire finish |
| Kanto | Pikachu | Volt Tackle |
| Kanto | Onix | Typed Rock finish |
| Kanto | Marowak | Typed Ground finish |
| Kanto | Snorlax | Giga Impact |
| Sinnoh | Infernape | Flame Wheel |
| Sinnoh | Luxray | Typed Electric finish |
| Sinnoh | Croagunk | Typed Poison finish |
| Sinnoh | Lucario | Aura Sphere |
| Sinnoh | Gardevoir | Moonblast |
| Sinnoh | Staraptor | Typed Normal finish |
| Sinnoh | Darkrai | Dark Void |
| Sinnoh | Weavile | Typed Dark finish |
| Sinnoh | Tangrowth | Typed Grass finish |
| Sinnoh | Garchomp | Earthquake |

These are the project's grouping labels, not a claim about every species'
original generation. `data/playable_roster.json` owns presentation/action maps;
`js/finishes.js` owns signature finish profiles; `js/fire_perks.js` owns perks.

## Presentation

Indigo Arena, Sinnoh League and Unova's Pokemon World Tournament share court
geometry with distinct illustrated backdrops and animated scenery. Layered,
pixel-art-inspired arena presentation, real hoops, crowd/official motion,
animated portraits, typed READY auras and ultimate spotlight effects are enabled.
Action sheets provide directional running and reused attack/cast/celebration
poses. They are not newly drawn basketball animations. Neutral silhouettes
set consistent body scales; contact poses suppress imported root-motion jumps.
Darkrai uses upright Idle frames, not its prone Float pose.

Sound uses local synthesized effects and optional browser speech. Mobile
gameplay and a Render/AI announcer backend are removed from scope, not deferred.
No server-side service is required to play, compare profiles or select teams.

## Next Work

Tune the three arenas, animation transitions and CPU decisions through live
playtesting. Add original basketball-specific poses where reused art remains
ambiguous. Improve asset/dependency ownership and review sprite permissions
before wider distribution. Online multiplayer, accounts and persistent rankings
are not implemented and are not part of this polish pass.
