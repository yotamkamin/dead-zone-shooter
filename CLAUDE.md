# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

Open `index.html` directly in a browser — no build step, no server required. All game logic is in a single `game.js` file loaded via a plain `<script>` tag.

## Repository workflow

After every meaningful change: commit with a descriptive message and push to `origin/main`.

```bash
git add <files>
git commit -m "short imperative summary"
git push
```

GitHub repo: https://github.com/yotamkamin/dead-zone-shooter

## Architecture

The entire game lives in `game.js` (~1100 lines). There are no modules, no bundler, and no external dependencies — everything is plain globals on the `window`.

### State machine

One top-level `state` object drives everything. `state.phase` is the primary switch:

```
MENU → PLAYING → LEVEL_COMPLETE → PLAYING (next level)
               → GAME_OVER      → MENU
```

The game loop calls `update*(dt)` + `render*()` pairs based on the current phase.

### Key data structures

- **`state.player`** — position, facing angle (radians toward mouse), animation state/frame, HP, ammo, cooldowns, invincibility timer
- **`state.enemies[]`** — each has `type` (key into `ENEMY_TYPES`), position, HP, `hitFlash` timer, `animFrame`
- **`state.bullets[]`** — velocity components, lifetime, damage, radius
- **`state.particles[]`** — short-lived visual effects (muzzle flash, death bursts)
- **`state.pickups[]`** — health/ammo drops from killed enemies
- **`state.wave`** — tracks which wave index is active and a list of `activeSpawns` that tick down spawn intervals

### Sprites

All sprites are drawn with Canvas 2D primitives (no image files). Each enemy type has a dedicated `drawGrunt / drawTank / drawRunner` function; the player has `drawPlayer`. All draw functions receive the entity object and draw centered on `(entity.x, entity.y)` after the caller does `ctx.translate + ctx.rotate` for directional orientation.

`DRAW_FNS` maps type string → draw function for the enemy render loop.

### Level system

`LEVELS[]` contains hand-authored configs for levels 1–3. `generateLevel(n)` produces procedurally scaled configs for level 4+, increasing enemy count and speed by ~28% per level. `getLevelConfig(level)` selects between the two.

Wave spawning: each wave has a `delay` (seconds from level start). `updateWaves(dt)` checks `state.levelTimer` and pushes new `activeSpawns` entries when their delay is reached. Active spawns tick their own interval timers and push enemies one at a time.

### Mouse aiming

Mouse coordinates are corrected on every event to account for CSS vs canvas pixel dimensions:
```js
mouse.x = (e.clientX - rect.left) * (W / rect.width);
```
`state.player.facing` is set each frame via `Math.atan2(mouse.y - p.y, mouse.x - p.x)` and used directly with `ctx.rotate()`.

### Render order

Background tiles → pickups → enemy shadows → enemies → player → bullets → particles → HUD → damage flash → state overlays (menu/game-over/level-complete panels).

The static floor tile pattern is pre-rendered once into an offscreen canvas (`floorCanvas`) and blitted each frame.

### Constants to tune

All balance values are at the top of `game.js`: `PLAYER_SPEED`, `BULLET_SPEED`, `SHOOT_COOLDOWN`, `PLAYER_RADIUS`, `IFRAMES_DUR`, `MAX_AMMO`, `RELOAD_TIME`. Enemy stats (speed, HP, damage, score value, collision radius) live in `ENEMY_TYPES`.
