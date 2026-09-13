# Crossy Road Clone

A browser-based infinite runner game featuring grid-based movement, isometric 2.5D rendering, and procedurally generated terrain.

## What This Game Is

_[Section reserved for user to describe what the game is and how it differs from stock Crossy Road]_

## How to Play

### Running the Game

1. Open `index.html` in a modern web browser (Chrome, Firefox, Safari, or Edge)
2. No build step or installation required - it's a static page that runs directly

### Game Controls

The game supports two control schemes:

**Arrow Keys:**
- ↑ Up Arrow - Move forward
- ↓ Down Arrow - Move backward
- ← Left Arrow - Move left
- → Right Arrow - Move right

**WASD Keys:**
- W - Move forward
- S - Move backward
- A - Move left
- D - Move right

**Restart:**
- R - Restart the game after game over

### Objective

Navigate your character across procedurally generated terrain to achieve the highest score possible. Move forward to increase your score - each grid cell forward increases your score by 1 point.

### Terrain Types

- **Grass** (Green) - Safe areas where you can rest without hazards
- **Roads** (Gray) - Watch out for moving cars! They travel at varying speeds
- **Rivers** (Blue) - Jump onto logs and lily pads to cross. Falling in the water ends the game
- **Train Tracks** (Brown) - Occasionally trains speed through. Time your crossing carefully!

### Gameplay Tips

- Moving forward increases your score, but moving backward or sideways doesn't
- Stand still on logs or lily pads to ride them across rivers
- Cars and trains can move left or right at different speeds
- Input is blocked during movement animations - wait for your character to finish moving before your next move
- The terrain generates infinitely as you progress forward

**Terrain distribution:**
- Base selection weights: grass 34%, road 40%, river 16%, train track 10%
- After a river row, the next row has a 60% river continuation chance, producing common 2-3 row streams
- Rivers and mixed hazard streaks are capped at three consecutive rows; grass is forced after the cap
- Rows through Y=2 remain grass so every game starts in a safe area

## Scoring System

**Score Calculation:**
- Score increases by 1 for each grid cell of forward progress
- Only moving to new maximum vertical positions increases your score
- Moving backward, sideways, or to previously visited positions does not change your score
- Your highest score for the session is displayed at game over

## Technical Details

**Architecture:**
- Pure vanilla JavaScript with no frameworks or dependencies
- HTML5 Canvas 2D rendering with a high-angle isometric projection
- Reusable palette-shaded voxel cuboids and continuous extruded terrain slabs
- Procedural multi-cuboid chicken with direction-aware 150ms visual hops
- Player-follow camera anchored below center to show more terrain ahead
- Modular code organization across multiple files
- Grid-based coordinate system with smooth animations
- Procedural terrain generation with weighted randomization

**Browser Compatibility:**
- Modern browsers with HTML5 Canvas support
- Tested on Chrome, Firefox, Safari, and Edge
- No mobile touch controls (keyboard only)

## Known Issues and Limitations

- **No mobile support** - The game requires keyboard input and is not playable on mobile devices
- **No touch controls** - Touchscreen navigation is not implemented
- **No sound effects or music** - The game is currently silent
- **Stage 2 visual work remains** - Cars, trains, logs, lily pads, and warning signals intentionally retain their simple colored geometry while terrain and the chicken use the new voxel treatment
- **No difficulty progression** - Speed and density remain constant throughout gameplay
- **No persistent high scores** - Scores are not saved between sessions
- **No pause functionality** - The game cannot be paused during gameplay

## AI Tools Used in Development

This game was developed with assistance from AI tools:

- **Kiro AI** - AI-powered development environment used for:
  - Spec creation (requirements, design, and task breakdown)
  - Code implementation across all game modules
  - Testing and debugging
  - Documentation generation

The AI assisted with architecture design, code generation, and iterative refinement while following the verify-first workflow with formal requirements and design specifications.

## File Structure

```
/
├── index.html          # Entry point with canvas element
├── style.css           # Minimal styling for canvas centering
├── game.js             # Main game loop and orchestration
├── player.js           # Player entity and movement animation
├── world.js            # World state and terrain storage
├── generator.js        # Procedural terrain generation
├── collision.js        # Collision detection system
├── renderer.js         # Isometric rendering with Canvas 2D
├── input.js            # Keyboard input handling
├── README.md           # This file
└── prompt_log.md       # Development prompts log
```

## Future Enhancements

Potential improvements for future versions:

- Sprite graphics and visual polish
- Sound effects and background music
- Mobile touch controls
- Difficulty progression (increasing speed as score increases)
- Additional terrain types
- Power-ups and collectibles
- Persistent high score tracking via LocalStorage
- Pause functionality
- Replay system

## License

_[License information to be added by user]_

## Credits

Developed by: _[To be added by user]_

Game concept inspired by the original Crossy Road by Hipster Whale.
