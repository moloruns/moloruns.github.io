# PokeJam Action Art Credits

This is a noncommercial fan-game prototype, not an official Pokemon product.

## Source Sheets

The directional/action sheets are downloaded from
[PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab).
Artwork is preserved unmodified; the game selects sheet frames and scales them
at runtime. The original `AnimData.xml` and per-species `credits.txt` accompany
each local sheet, and `manifest.json` records the source URL and frame timing.

| Pokemon | Source path | Supplied credit |
| --- | --- | --- |
| Pikachu | `sprite/0025` | CHUNSOFT |
| Charizard | `sprite/0006` | CHUNSOFT; contributor `<@!237286997645983744>` for actions listed in the supplied credit record |
| Lucario | `sprite/0448` | CHUNSOFT; contributor `<@!356635814668664832>` for actions listed in the supplied credit record |
| Snorlax | `sprite/0143` | CHUNSOFT |
| Wartortle | `sprite/0008` | CHUNSOFT |
| Venusaur | `sprite/0003` | CHUNSOFT |
| Gengar | `sprite/0094` | CHUNSOFT; contributor `<@!237286997645983744>` for Pose and other actions listed in the supplied record |
| Mewtwo | `sprite/0150` | CHUNSOFT; contributor `<@!702275233125630042>` for actions listed in the supplied record |
| Gardevoir | `sprite/0282` | CHUNSOFT |
| Weavile | `sprite/0461` | CHUNSOFT |
| Arcanine | `sprite/0059` | CHUNSOFT |
| Onix | `sprite/0095` | CHUNSOFT |
| Marowak | `sprite/0105` | CHUNSOFT |
| Infernape | `sprite/0392` | CHUNSOFT; contributor `<@!330751862590406656>` for DeepBreath and other actions in supplied record |
| Luxray | `sprite/0405` | CHUNSOFT |
| Croagunk | `sprite/0453` | CHUNSOFT; contributor `<@!330751862590406656>` for Pose and other actions in supplied record |
| Staraptor | `sprite/0398` | CHUNSOFT; contributor `<@!117780585635643396>` for Double in supplied record |
| Darkrai | `sprite/0491` | CHUNSOFT; contributor `<@!544245909639397378>` for Float/Pose and other actions in supplied record |
| Tangrowth | `sprite/0465` | CHUNSOFT |
| Garchomp | `sprite/0445` | CHUNSOFT |

The source repository publishes [CC BY-NC 4.0 terms](https://github.com/PMDCollab/SpriteCollab/blob/master/LICENSE.md)
for contributed work. Its credits explicitly identify official CHUNSOFT sheets
as `Unspecified`; do not interpret the repository license as clearing rights
to official game art or the Pokemon characters. Those rights remain with their
respective owners. Attribution is not a substitute for permission.

The original source license text is retained in `SOURCE-LICENSE.md`. Source
credit records preserve contributor IDs and action-level attribution rather
than inventing artist names. Before public distribution, especially a commercial
release, replace or clear assets with unresolved rights. No deployment or
permission claim is made by this prototype integration.

## Other Art and Audio

- HUD portraits/static fallback images: existing PokeAPI sprite assets; Pokemon
  rights remain with their respective owners.
- Indigo court, hoop layers, live crowd and sideline official: original
  project-local procedural game art in `js/arena.js`. The phase-2.1 stadium
  backdrop is an original generated asset; see [arena credits](../arenas/CREDITS.md).
- Ball seams, floor readiness markers and style popups: original game rendering.
- Arena sounds and crowd bed: original synthesized audio in `js/audio.js`.
- Optional spoken callouts: browser speech synthesis with original phrases;
  not prerecorded character voice acting and not NBA Jam audio.
- The initial phase-two illustration attempt did not produce a usable asset.
  A later phase-2.1 backdrop is used, with procedural art retained as fallback.

These twenty playable species have imported action sheets, checked for eight-way
movement, valid native event timing and nonempty alpha. Infernape's contributed
DeepBreath celebration has one authored direction; the renderer uses that row
instead of pretending the source contains eight views. Source copies/aliases resolve to
their original sheet without redrawing its pixels. This audit makes no
asset-rights approval claim.

The six newer species additionally import the native poses referenced by
`data/playable_roster.json`: Swing/Hop (Wartortle), Strike/Shake/Swing/Hop
(Venusaur), Float/Lick/Strike/Hop/Twirl (Gengar), Hover/Punch/Hop/SpAttack
(Mewtwo), SpAttack/Strike/Hop/Appeal (Gardevoir), and QuickStrike/Hop/SpAttack
(Weavile). Source aliases may reuse a sheet, not represent separately authored
art. Timing, lean, recoil and landing adjustments happen in the renderer; no
new custom basketball sprite frames or permission claims are implied.

The final ten additionally use native QuickStrike/Rumble (Arcanine), Slam/Twirl
(Onix), Swing/Strike (Marowak), MultiStrike/Rotate/DeepBreath (Infernape),
Strike/Shake (Luxray), Jab/Pose (Croagunk), Hover/QuickStrike (Staraptor),
Float/SpAttack/Pose (Darkrai), Emit/SpAttack (Tangrowth), and RearUp/Strike
(Garchomp). The shared roster is the authoritative complete pose mapping.
Stable size normalization measures alpha in neutral frames at runtime; it does
not modify source art. Animation frames are also reused in the canvas HUD.
