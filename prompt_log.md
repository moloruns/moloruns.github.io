# AI-Assisted Development Prompt Log

This document contains verbatim prompts used during the AI-assisted development of the Crossy Road Clone game.

## Purpose

This log serves as a transparent record of how AI tools (specifically Kiro AI) were used throughout the development process, documenting the iterative conversation and instructions that shaped the final implementation.

## Development Workflow

The game was developed using Kiro AI's verify-first workflow:
1. **Requirements Phase** - Defining what the game should do
2. **Design Phase** - Specifying how the game should work
3. **Task Planning Phase** - Breaking down implementation into discrete tasks
4. **Implementation Phase** - Executing tasks with AI assistance
5. **Testing & Verification Phase** - Validating correctness

---

## Session Log

_[User to add verbatim prompts from development sessions]_

### Session 1: Initial Specification
_Example format - replace with actual prompts:_

**Prompt:**
```
Create a Crossy Road clone spec with requirements and design documents.
```

**Outcome:**
- Generated requirements.md
- Generated design.md
- Generated tasks.md

---

### Session 2: Project Setup
_[Add actual prompts used]_

---

### Session 3: Core Game Loop Implementation
_[Add actual prompts used]_

---

### Session 4: Rendering System
_[Add actual prompts used]_

---

### Session 5: Player Movement and Input
_[Add actual prompts used]_

---

### Session 6: Terrain Generation
_[Add actual prompts used]_

---

### Session 7: Collision Detection
_[Add actual prompts used]_

---

### Session 8: Score Tracking and Game Over
_[Add actual prompts used]_

---

### Session 9: Bug Fixes and Polish
_[Add actual prompts used]_

---

### Session 10: Documentation
_[Add actual prompts used]_

---

## Key Design Decisions Made Through AI Dialogue

_Document important design decisions that emerged from the AI conversation:_

1. **Isometric Rendering** - Chose Canvas 2D with isometric projection over 3D rendering for simplicity
2. **Grid-Based Movement** - Discrete grid positions with smooth animation interpolation
3. **Animation Timing** - 150ms movement animation duration for responsive feel
4. **Terrain Generation** - Weighted random selection with safety constraints (forced grass after 3 consecutive hazards)
5. **Platform Riding** - Player moves with logs/lily pads when stationary
6. _[Add other key decisions]_

## Testing Approach

_Document any prompts related to testing strategy:_

- Property-based testing approach for comprehensive input coverage
- Unit tests for specific examples and edge cases
- Integration testing for full gameplay flow

## Challenges and Solutions

_Document any problems encountered and how they were resolved through AI assistance:_

### Challenge 1: _[Description]_
**Prompt:** _[Prompt used to address it]_
**Solution:** _[How it was resolved]_

### Challenge 2: _[Description]_
**Prompt:** _[Prompt used to address it]_
**Solution:** _[How it was resolved]_

---

## Notes on AI Assistance

- **Code Generation:** AI generated initial implementations for all modules
- **Debugging:** AI assisted with identifying and fixing bugs
- **Architecture:** AI helped design modular structure with clear separation of concerns
- **Documentation:** AI generated this README and the prompt log template
- **Testing:** AI created test specifications and property definitions

## Transparency Statement

This game was developed with significant AI assistance. The AI helped with:
- Specification writing
- Code implementation
- Architecture decisions
- Testing strategy
- Documentation

Human oversight included:
- Requirements validation
- Design approval
- Code review
- Testing and gameplay verification
- Final integration decisions

---

## Template Instructions for User

**To complete this log:**

1. Review your conversation history with Kiro AI
2. Copy verbatim prompts you used for each major development phase
3. Include both the prompts and a brief description of the outcome
4. Document key design decisions that emerged from the dialogue
5. Add any challenges you encountered and how AI helped resolve them
6. Remove these template instructions when complete

**Tips for comprehensive logging:**
- Include prompts that led to dead ends or were revised
- Note prompts that generated incorrect code that needed fixing
- Document iterative refinement prompts
- Include prompts for bug fixes and debugging
- Add prompts related to testing and verification

This creates a transparent record of AI-assisted development for portfolio review and educational purposes.
