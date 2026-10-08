# On-Fire Perks And Status Effects

Implemented arcade rules, replacing the earlier planning proposals. Ten mons
are now selectable; see the package table below. All 18 type fallbacks are
implemented and tested through fixtures, including types not yet selectable.
Balance numbers are PokeJam adaptations, not canonical Pokemon move mechanics.

## Shared Rules

- Three consecutive individual makes activate 15 seconds of fire. Once active,
  each make by its owner adds five seconds to the remaining time (no refill cap).
  Timer expiry, an opposing basket or a successful direct steal from the owner
  ends it. A miss still resets the activation streak, but cannot end active fire.
  Blocks, shoves, intercepted passes and travel also leave the active timer intact.
  Activation restores stamina; turbo has no drain while fire lasts; ordinary shot
  chance gains 0.12, capped at 0.98. Timer expiry requires a fresh three-make streak.
- Attacks, statuses, knockback and counters affect opponents only. Positive
  perks affect their owner, never a teammate. Tailwind is a self speed bonus.
- One spot is 32 simulation court units. Five spots = 160; four = 128.
  Knockback stops at the playable boundary, rather than creating an out-of-bounds
  turnover. Camera projection does not change these distances.
- Active perks cast automatically after their cooldown while fire is active.
  The first cast waits one full interval. Only automatic scoring finishers need
  possession; all non-scoring attack perks work off ball, including defensive
  Flamethrower. Take Down uses the normal
  shove command instead. No new F/P binding is used.
- Casts require a live, unpaused period and a grounded, controllable mon.
  Shots/dunks and locked actions cannot overlap them. Ordinary casts anticipate
  for 0.18 seconds, recover by 0.65 seconds, reduce movement to 30% during the
  cast, and temporarily prevent shooting/passing. Each target is hit once.
- There is no HP. Burn's weaker defensive "damage" means lower success odds
  for steals/blocks/shoves and weaker shove displacement/stagger.
- Successful shoves have a 10-35% stun chance based on the power difference
  (18% when equal); burn scales that chance by 65%. Stun lasts three seconds,
  has the same opponent-only/immunity rules, and never follows a missed shove.
- Fire and ultimate charge remain separate. Poison blocks new charge; burn
  reduces it. Neither deletes stored charge nor invalidates READY. Ghost/Dragon's
  free finishers explicitly override this separation as requested: no E-meter
  cost, guaranteed scoring and block immunity, but pre-release shot-clock
  violations still win. They do not earn bonus ultimate style.
  Dunk points are captured at takeoff: outside the painted arc is three, inside
  or on it is two. Shadow Ball uses the same boundary at its shot origin.
- Status time and cooldowns use simulation time, frozen by pause. Fire duration
  counts down only during live play, freezing during dead inbounds and period
  transitions; it survives a quarter change. Portrait names and the broadcast
  readout show remaining seconds. Fire ending
  cancels unfinished casts; emitted projectiles and statuses may finish.
  Inbounds/quarter changes clear statuses, casts, projectiles and flame patches.
  Rematch, lineup changes and results also clear fire sessions. Comparison
  attributes, NBA matching data and rating model values are not modified.
- HUD portraits show status seconds or perk cooldown; small world labels and
  effects identify affected mons. Reduced effects retains essential feedback.
  Active charged ultimate sequences resist perk status/knockback.

## Statuses

| Status | Duration | Implemented Effect |
| --- | --- | --- |
| Paralysis | 4 s | Movement at 30%; every 0.8 s, 30% chance of a 0.5 s movement/action lock |
| Burn | 3 s | Movement at 85%, new charge at 75%, defensive strength at 65% |
| Freeze | Up to 7 s | Immobilized in translucent animated ice; 10-14 alternating taps escape |
| Sleep | Up to 6 s | Immobilized with rising Z effects; 18 alternating taps escape |
| Confusion | 5 s | Both movement axes inverted, for humans and CPU |
| Poison | 15 s | Movement at 85%; no new ultimate charge |
| Stun | 3 s | Cannot move or perform basketball actions |
| Chill | 2 s | Powder Snow's non-freeze slow: movement at 70% |

Freeze/sleep prompts bob above the mon: **MASH J + I**, or **K + L** for P2.
Use alternating fresh presses, not holding keys or repeating one key. At five
accepted taps per second, ice breaks in roughly 2-2.8 seconds; sleep takes about
3.6 seconds. The final escape tap is consumed, not turned into an accidental
shot/pass. CPU players use the same five-taps-per-second cadence. Unanswered
freeze melts at seven seconds and sleep expires at six.

Hard disables interrupt actions but leave a held ball attached and stealable.
They cannot refresh while active; expiration/escape grants one second of
protection against reapplying that same hard status. Soft statuses refresh their
normal bounded duration. Different statuses can coexist; the strongest slow wins
rather than multiplying slows. Poison overrides all charge bonuses. Different
hard statuses can still chain: playtest that risk with the long disables requested.

## General Type Perks

Fallback active moves come from the first listed type with an active move; if
neither has an active, the first type's passive remains the package. Passive perks
from either type apply while fire lasts. A named assignment replaces its active fallback and
may add passives. Dual-type mons do not get two automatic attack streams.

| Type | Perk | Behavior / Cooldown |
| --- | --- | --- |
| Water | Hydro Pump | Projectile every 6 s, reach 330 units; pushes 160 units |
| Electric | Discharge | Every 6 s; paralysis within 100 units (steal-range scale) |
| Normal | Take Down | On-fire shove pushes 128 units; existing shove input/cooldown/stamina cost |
| Fire | Flame Burst | Every 7 s; projectile reaches 300 units, 85% burn chance; four flame patches last 3 s |
| Grass | Razor Blade | Three-projectile volley every 4 s, reach 290; pushes 128 units once per target |
| Ice | Powder Snow | Cone every 6 s, reach 145; chill and 40% freeze chance |
| Fighting | Mach Punch | Close cone every 5 s, reach 80; stun |
| Poison | Toxic | Every 7 s; poison within one spot (32 units) |
| Ground | Bulldoze | Every 6 s, radius 145; stuns grounded opponents only |
| Flying | Tailwind | 25% self speed boost while fire lasts |
| Psychic | Hypnosis | Every 7 s, reach 300; widening projectile causes sleep |
| Bug | Bug Buzz | Every 6 s, radius 130; stun |
| Rock | Rock Polish | Cannot be directly stolen from; 25% self speed boost |
| Ghost | Shadow Ball | With ball every 8 s: automatic guaranteed jumpshot from anywhere |
| Dragon | Dragon Rush | With ball every 8 s: automatic guaranteed dunk from anywhere |
| Dark | Sucker Punch | 90% chance to reject an in-range steal and stun its attacker |
| Steel | Iron Defense | On-fire dunks cannot be blocked |
| Fairy | Unlimited Passing | Passes/alley-oops cannot be intercepted; protected lob cannot be blocked |

Radial/cone tests include an 18-unit target body allowance. Projectiles travel at
480 units per second. Attacks other than Bulldoze reach opponents up to 45 units
off the floor; Bulldoze requires ground contact. Flame patches burn only grounded
opponents and hit each once per patch. Ordinary passes can now be intercepted by
nearby, actionable opponents; Fairy's protection is captured at pass release.

Intervals not specified in the request (Electric/Ice/Fighting), paralysis duration,
probabilities and most reaches are provisional tuning values. Poison/stun/sleep
and automatic scoring are strong in 2v2: evaluate comeback potential before
adding further perks or shortening cooldowns.

## Named Assignments For Review

These are implemented provisional assignments for your approval/editing.

| Mon | Named Package | Details |
| --- | --- | --- |
| Charizard | Flamethrower + Wing Lift | On offense or defense, forward 110-degree cone every 4 s, reach 145, guaranteed burn on hit. Dunk range +20%, capped at +40 units, with wing flare. Inherits Flying's Tailwind. |
| Pikachu | Discharge + Quick Attack | General Discharge; 15% self speed boost. |
| Lucario | Force Palm + Focus Energy | Close stun every 5 s; 15% earned-charge bonus. Inherits Steel's unblockable dunks. |
| Snorlax | Body Slam + Thick Fat | Named Take Down shove; burn duration halved to 1.5 s. |
| Mewtwo | Psybeam | Projectile every 5 s, reach 290; confusion. Charged signature is Psystrike. |
| Wartortle | Hydro Pump | Water fallback: blast every 6 s, reach 330; pushes opponents 160 units. Generic Water ultimate. |
| Venusaur | Razor Blade | Grass fallback: volley every 4 s, reach 290; pushes opponents 128 units once. Poison does not add a second attack stream. Generic Grass ultimate. |
| Gengar | Shadow Ball | Ghost fallback: automatic guaranteed jumper every 8 s with possession. Separate charged Shadow Ball signature earns ultimate style; the free perk does not. |
| Gardevoir | Hypnosis + Unlimited Passing | Psychic widening sleep projectile every 7 s; Fairy protects passes/lobs. Charged signature is Moonblast. |
| Weavile | Powder Snow + Sucker Punch | Ice cone every 6 s, chill plus 40% freeze; Dark counters in-range steals at 90%. Generic Dark ultimate. |
| Arcanine | Flame Burst | Fire fallback, projectile and three-second court flames; generic Fire ultimate. |
| Onix | Bulldoze + Rock Polish | Ground floor stun every 6 s; Rock speed/steal protection. Generic Rock ultimate. |
| Marowak | Bulldoze | Ground floor stun every 6 s; generic Ground ultimate, with bone-swing poses. |
| Infernape | Flame Burst | Fire fallback; charged Flame Wheel is the separate spinning dunk signature. |
| Luxray | Discharge | Electric close-range paralysis; generic Electric ultimate. |
| Croagunk | Toxic | Poison radius attack every 7 s; Fighting does not add a second attack stream. Generic Poison ultimate. |
| Staraptor | Take Down + Tailwind | Normal enhanced shove with Flying speed boost; generic Normal ultimate. |
| Darkrai | Sucker Punch | Dark counter protection; charged Dark Void is the separate scoring signature, not a new automatic sleep attack. |
| Tangrowth | Razor Blade | Grass volley every 4 s; generic Grass ultimate. |
| Garchomp | Dragon Rush | Automatic guaranteed dunk every 8 s with possession; its separate charged Earthquake earns ultimate style. Ground does not add a second attack stream. |

Charizard's cone locks to its facing at cast start, never rotates toward a target
or hits behind it. Wing Lift remains blockable, unlike Steel's explicit perk.
Existing charged ultimate finish profiles remain separate.

## Files And Verification

- `js/fire_perks.js`: manifests, statuses, casts, pass protections, knockback and
  animated graphics. Inspect `window.PokeJamPerkManifest` in a developer console.
- `js/play.js`: basketball/input/CPU integration and charge/defense modifiers.
- `js/animator.js`: immobilized pose handling.
- `js/phase21.js`: compact canvas HUD effect readouts.
- `tests/browser_fire_perks.py`: all 18 fallbacks, seven requested statuses,
  actual escape inputs, CPU recovery, opponent isolation, hazards, passive
  defenses, guaranteed finishers and lifecycle cleanup.
- `tests/browser_roster.py`: six added playable species, real move packages on
  both teams, opponent isolation, lineups, resets, signatures and art assets.
- `tests/browser_full_roster.py`: twenty court/HUD animation checks and the final
  ten perk packages, signatures, CPU finishes, Flame Wheel and free Dragon Rush.
- `tests/browser_match_setup.py`: random teams/stages, lifecycle, venue art and
  visible-body size safeguards.

Run README's browser suites sequentially with the preview server running. These
checks cover behavior and rendered status assets, not final art approval or
competitive balance. Future work: authored move-specific effects, additional
selectable species, resistance tuning and a full comeback playtest.
