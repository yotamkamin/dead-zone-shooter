// ============================================================
//  DEAD ZONE — top-down browser shooter
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = 800;
const H = 600;

// ── Input ────────────────────────────────────────────────────
const keys = {};
const mouse = { x: W / 2, y: H / 2, down: false, clicked: false };

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  const gameCodes = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space'];
  if (gameCodes.includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left) * (W / rect.width);
  mouse.y = (e.clientY - rect.top)  * (H / rect.height);
});
window.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left) * (W / rect.width);
  mouse.y = (e.clientY - rect.top)  * (H / rect.height);
  mouse.down = true;
  mouse.clicked = true;
});
window.addEventListener('mouseup', () => { mouse.down = false; });

// ── Constants ────────────────────────────────────────────────
const PLAYER_SPEED   = 130;
const BULLET_SPEED   = 450;
const SHOOT_COOLDOWN = 0.2;
const PLAYER_RADIUS  = 10;
const IFRAMES_DUR    = 1.2;
const MAX_AMMO       = 30;
const RELOAD_TIME    = 1.8;

// ── Enemy type definitions ───────────────────────────────────
const ENEMY_TYPES = {
  grunt: {
    color: '#c0392b', headColor: '#a93226', size: 12, speed: 65,
    hp: 2, damage: 12, scoreValue: 10,
  },
  tank: {
    color: '#7f8c8d', headColor: '#616a6b', size: 20, speed: 38,
    hp: 8, damage: 22, scoreValue: 30,
  },
  runner: {
    color: '#e67e22', headColor: '#ca6f1e', size: 9, speed: 115,
    hp: 1, damage: 16, scoreValue: 20,
  },
};

// ── Level configs ────────────────────────────────────────────
const LEVELS = [
  // Level 1 — intro
  { waves: [
    { delay: 0,  spawns: [{ type: 'grunt', count: 5, interval: 1.0 }] },
    { delay: 12, spawns: [{ type: 'grunt', count: 7, interval: 0.7 }] },
  ]},
  // Level 2 — add runners
  { waves: [
    { delay: 0,  spawns: [{ type: 'grunt',  count: 6, interval: 0.8 }, { type: 'runner', count: 3, interval: 1.5 }] },
    { delay: 14, spawns: [{ type: 'grunt',  count: 8, interval: 0.6 }, { type: 'runner', count: 4, interval: 1.2 }] },
  ]},
  // Level 3 — introduce tank
  { waves: [
    { delay: 0,  spawns: [{ type: 'grunt',  count: 6, interval: 0.7 }, { type: 'runner', count: 3, interval: 1.3 }] },
    { delay: 13, spawns: [{ type: 'tank',   count: 1, interval: 0   }, { type: 'grunt',  count: 8, interval: 0.5 }] },
    { delay: 26, spawns: [{ type: 'tank',   count: 2, interval: 3   }, { type: 'runner', count: 5, interval: 0.8 }] },
  ]},
];

function generateLevel(n) {
  const s = 1 + (n - 1) * 0.28;
  return { waves: [
    { delay: 0,  spawns: [
      { type: 'grunt',  count: Math.floor(7 * s),  interval: Math.max(0.25, 0.7 / s) },
      { type: 'runner', count: Math.floor(3 * s),  interval: Math.max(0.6, 1.2 / s) },
    ]},
    { delay: 14, spawns: [
      { type: 'grunt',  count: Math.floor(9 * s),  interval: Math.max(0.2, 0.55 / s) },
      { type: 'tank',   count: Math.floor(1 + n / 3), interval: Math.max(1.5, 3 / s) },
    ]},
    { delay: 30, spawns: [
      { type: 'runner', count: Math.floor(5 * s),  interval: Math.max(0.3, 0.7 / s) },
      { type: 'tank',   count: Math.floor(1 + n / 2), interval: Math.max(1.2, 2.5 / s) },
    ]},
  ]};
}

function getLevelConfig(level) {
  return level <= LEVELS.length ? LEVELS[level - 1] : generateLevel(level);
}

// ── State factory ────────────────────────────────────────────
function makePlayer() {
  return {
    x: W / 2, y: H / 2,
    facing: 0,
    animState: 'idle', animFrame: 0, animTimer: 0, animFrameDuration: 0.11,
    shootCooldown: 0, shootFlash: 0,
    hp: 100, maxHp: 100,
    ammo: MAX_AMMO, maxAmmo: MAX_AMMO,
    reloading: false, reloadTimer: 0,
    invincible: 0,
    velX: 0, velY: 0,
  };
}

function makeState() {
  return {
    phase: 'MENU',
    level: 1, score: 0,
    hiScore: parseInt(localStorage.getItem('hiScore') || '0'),
    player: makePlayer(),
    bullets: [], enemies: [], particles: [], pickups: [],
    wave: { index: 0, timers: [], activeSpawns: [] },
    levelTimer: 0,
    shake: 0,
    menuTimer: 0,
    flashAlpha: 0,
    damageFlash: 0,
  };
}

let state = makeState();

// ── Spawn helpers ────────────────────────────────────────────
function randomEdgePos(margin) {
  margin = margin || 30;
  const edge = Math.floor(Math.random() * 4);
  switch (edge) {
    case 0: return { x: Math.random() * W,  y: -margin };
    case 1: return { x: W + margin,          y: Math.random() * H };
    case 2: return { x: Math.random() * W,  y: H + margin };
    default: return { x: -margin,            y: Math.random() * H };
  }
}

function spawnEnemy(type) {
  const pos = randomEdgePos();
  const t = ENEMY_TYPES[type];
  return {
    type, x: pos.x, y: pos.y, facing: 0,
    animFrame: 0, animTimer: 0,
    hp: t.hp, maxHp: t.hp,
    speed: t.speed,
    hitFlash: 0,
  };
}

function spawnPickup(x, y, kind) {
  return { x, y, kind, life: 12, pulse: 0 };
}

// ── Particle helpers ─────────────────────────────────────────
function burst(x, y, color, count, speed, spread, size) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.25 + Math.random() * 0.3,
      maxLife: 0.55,
      color,
      size: size * (0.6 + Math.random() * 0.8),
    });
  }
}

function muzzleFlash(x, y, angle) {
  for (let i = 0; i < 5; i++) {
    const a = angle + (Math.random() - 0.5) * 0.6;
    const s = 120 + Math.random() * 160;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.08 + Math.random() * 0.07,
      maxLife: 0.15,
      color: Math.random() < 0.5 ? '#ffe066' : '#ff9900',
      size: 2 + Math.random() * 2,
    });
  }
}

// ── Shooting ─────────────────────────────────────────────────
function playerShoot() {
  const p = state.player;
  if (p.shootCooldown > 0 || p.reloading) return;
  if (p.ammo <= 0) {
    startReload();
    return;
  }
  const angle = p.facing;
  const mx = p.x + Math.cos(angle) * 18;
  const my = p.y + Math.sin(angle) * 18;
  state.bullets.push({
    x: mx, y: my,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    life: 1.4, damage: 25, radius: 3,
  });
  p.ammo--;
  p.shootCooldown = SHOOT_COOLDOWN;
  p.shootFlash = 0.1;
  muzzleFlash(mx, my, angle);
  if (p.ammo === 0) startReload();
}

function startReload() {
  const p = state.player;
  if (p.reloading) return;
  p.reloading = true;
  p.reloadTimer = RELOAD_TIME;
}

// ── Update helpers ───────────────────────────────────────────
function circleOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy < (ar + br) * (ar + br);
}

function updatePlayerAnimation(p, moving, dt) {
  const next = moving ? 'walk' : (p.shootCooldown > SHOOT_COOLDOWN * 0.5 ? 'shoot' : 'idle');
  if (next !== p.animState) {
    p.animState = next;
    p.animFrame = 0;
    p.animTimer = 0;
  }
  if (p.animState === 'walk') {
    p.animTimer += dt;
    if (p.animTimer >= p.animFrameDuration) {
      p.animTimer = 0;
      p.animFrame = (p.animFrame + 1) % 4;
    }
  }
}

function killEnemy(i) {
  const e = state.enemies[i];
  const t = ENEMY_TYPES[e.type];
  state.score += t.scoreValue;
  burst(e.x, e.y, t.color, 10, 80, Math.PI * 2, 3);
  burst(e.x, e.y, '#ff6666', 5, 50, Math.PI * 2, 2);
  state.shake = Math.max(state.shake, e.type === 'tank' ? 6 : 3);

  // Chance to drop pickup
  const roll = Math.random();
  if (roll < 0.12) state.pickups.push(spawnPickup(e.x, e.y, 'health'));
  else if (roll < 0.28) state.pickups.push(spawnPickup(e.x, e.y, 'ammo'));

  state.enemies.splice(i, 1);
}

// ── Wave system ──────────────────────────────────────────────
function startLevel() {
  const cfg = getLevelConfig(state.level);
  state.enemies = [];
  state.bullets = [];
  state.pickups = [];
  state.wave = {
    index: 0,
    timers: cfg.waves.map(w => w.delay),
    activeSpawns: [], // { type, remaining, interval, timer }
  };
  state.levelTimer = 0;
  state.phase = 'PLAYING';
  // Refill some ammo
  state.player.ammo = Math.min(state.player.ammo + 15, state.player.maxAmmo);
  state.player.reloading = false;
  state.player.reloadTimer = 0;
}

function updateWaves(dt) {
  const cfg = getLevelConfig(state.level);
  state.levelTimer += dt;

  // Activate new waves
  for (let i = state.wave.index; i < cfg.waves.length; i++) {
    if (state.levelTimer >= cfg.waves[i].delay) {
      cfg.waves[i].spawns.forEach(s => {
        state.wave.activeSpawns.push({
          type: s.type,
          remaining: s.count,
          interval: s.interval,
          timer: 0,
        });
      });
      state.wave.index = i + 1;
    } else {
      break;
    }
  }

  // Tick active spawns
  for (let i = state.wave.activeSpawns.length - 1; i >= 0; i--) {
    const sp = state.wave.activeSpawns[i];
    sp.timer -= dt;
    if (sp.timer <= 0) {
      state.enemies.push(spawnEnemy(sp.type));
      sp.remaining--;
      if (sp.remaining <= 0) {
        state.wave.activeSpawns.splice(i, 1);
      } else {
        sp.timer = sp.interval;
      }
    }
  }

  // Check level complete
  const allWavesDispatched = state.wave.index >= cfg.waves.length;
  const noActive = state.wave.activeSpawns.length === 0;
  const noEnemies = state.enemies.length === 0;
  if (allWavesDispatched && noActive && noEnemies) {
    state.hiScore = Math.max(state.score, state.hiScore);
    localStorage.setItem('hiScore', state.hiScore);
    state.levelTimer = 0;
    state.phase = 'LEVEL_COMPLETE';
  }
}

// ── Main update functions ────────────────────────────────────
function updateMenu(dt) {
  state.menuTimer += dt;
  if (mouse.clicked) {
    state = makeState();
    state.phase = 'PLAYING';
    state.hiScore = parseInt(localStorage.getItem('hiScore') || '0');
    startLevel();
  }
}

function updateLevelComplete(dt) {
  state.levelTimer += dt;
  if (state.levelTimer > 3.0 || mouse.clicked) {
    state.level++;
    state.player = makePlayer();
    state.player.hp = Math.min(state.player.maxHp, 60); // carry over partial health
    startLevel();
  }
}

function updateGameOver(dt) {
  state.menuTimer += dt;
  if (mouse.clicked && state.menuTimer > 1.5) {
    const hi = state.hiScore;
    state = makeState();
    state.hiScore = hi;
  }
}

function updateGame(dt) {
  const p = state.player;

  // Player facing
  p.facing = Math.atan2(mouse.y - p.y, mouse.x - p.x);

  // Movement
  let dx = 0, dy = 0;
  if (keys['ArrowLeft']  || keys['KeyA']) dx -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
  if (keys['ArrowUp']    || keys['KeyW']) dy -= 1;
  if (keys['ArrowDown']  || keys['KeyS']) dy += 1;
  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
  p.x = Math.max(PLAYER_RADIUS, Math.min(W - PLAYER_RADIUS, p.x + dx * PLAYER_SPEED * dt));
  p.y = Math.max(PLAYER_RADIUS, Math.min(H - PLAYER_RADIUS, p.y + dy * PLAYER_SPEED * dt));

  // Animation
  updatePlayerAnimation(p, dx !== 0 || dy !== 0, dt);

  // Shoot
  if (mouse.down || mouse.clicked) playerShoot();

  // Timers
  if (p.shootCooldown > 0) p.shootCooldown -= dt;
  if (p.shootFlash > 0)    p.shootFlash -= dt;
  if (p.invincible > 0)    p.invincible -= dt;
  if (p.reloading) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.ammo = p.maxAmmo;
      p.reloading = false;
    }
  }

  // Bullets
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) {
      state.bullets.splice(i, 1);
      continue;
    }
    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j--) {
      const e = state.enemies[j];
      const t = ENEMY_TYPES[e.type];
      if (circleOverlap(b.x, b.y, b.radius, e.x, e.y, t.size)) {
        e.hp -= b.damage;
        e.hitFlash = 0.12;
        state.bullets.splice(i, 1);
        if (e.hp <= 0) killEnemy(j);
        hit = true;
        break;
      }
    }
    if (hit) continue;
  }

  // Enemies update
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    const t = ENEMY_TYPES[e.type];
    const edx = p.x - e.x, edy = p.y - e.y;
    const dist = Math.sqrt(edx * edx + edy * edy);
    e.facing = Math.atan2(edy, edx);

    if (dist > t.size + PLAYER_RADIUS) {
      e.x += (edx / dist) * e.speed * dt;
      e.y += (edy / dist) * e.speed * dt;
    }

    // Separation between enemies
    for (let j = 0; j < state.enemies.length; j++) {
      if (i === j) continue;
      const b = state.enemies[j];
      const sdx = e.x - b.x, sdy = e.y - b.y;
      const sd = Math.sqrt(sdx * sdx + sdy * sdy);
      const minDist = ENEMY_TYPES[e.type].size + ENEMY_TYPES[b.type].size + 2;
      if (sd < minDist && sd > 0) {
        const push = ((minDist - sd) / minDist) * 25 * dt;
        e.x += (sdx / sd) * push;
        e.y += (sdy / sd) * push;
      }
    }

    // Animation
    e.animTimer += dt;
    if (e.animTimer >= 0.13) { e.animTimer = 0; e.animFrame = (e.animFrame + 1) % 4; }
    if (e.hitFlash > 0) e.hitFlash -= dt;

    // Damage player
    if (p.invincible <= 0 && circleOverlap(e.x, e.y, t.size, p.x, p.y, PLAYER_RADIUS)) {
      p.hp -= t.damage;
      p.invincible = IFRAMES_DUR;
      state.damageFlash = 0.25;
      state.shake = Math.max(state.shake, 5);
      if (p.hp <= 0) {
        p.hp = 0;
        state.hiScore = Math.max(state.score, state.hiScore);
        localStorage.setItem('hiScore', state.hiScore);
        state.menuTimer = 0;
        state.phase = 'GAME_OVER';
        burst(p.x, p.y, '#ff4444', 20, 100, Math.PI * 2, 4);
        return;
      }
    }
  }

  // Pickups
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    pk.life -= dt;
    pk.pulse += dt * 4;
    if (pk.life <= 0) { state.pickups.splice(i, 1); continue; }
    if (circleOverlap(pk.x, pk.y, 10, p.x, p.y, PLAYER_RADIUS)) {
      if (pk.kind === 'health') p.hp = Math.min(p.maxHp, p.hp + 30);
      if (pk.kind === 'ammo')   { p.ammo = p.maxAmmo; p.reloading = false; }
      burst(pk.x, pk.y, pk.kind === 'health' ? '#2ecc71' : '#f39c12', 8, 60, Math.PI * 2, 3);
      state.pickups.splice(i, 1);
    }
  }

  // Particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.88; pt.vy *= 0.88;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }

  // Screenshake decay
  if (state.shake > 0) state.shake = Math.max(0, state.shake - 15 * dt);
  if (state.damageFlash > 0) state.damageFlash -= dt;

  // Waves
  updateWaves(dt);
}

// ── Draw functions ───────────────────────────────────────────

// Floor tile grid (drawn once to offscreen canvas)
const floorCanvas = document.createElement('canvas');
floorCanvas.width = W; floorCanvas.height = H;
(function buildFloor() {
  const fc = floorCanvas.getContext('2d');
  fc.fillStyle = '#1a1a2e';
  fc.fillRect(0, 0, W, H);
  const tileSize = 40;
  for (let tx = 0; tx < W; tx += tileSize) {
    for (let ty = 0; ty < H; ty += tileSize) {
      const shade = (tx / tileSize + ty / tileSize) % 2 === 0 ? '#1c1c30' : '#18182a';
      fc.fillStyle = shade;
      fc.fillRect(tx, ty, tileSize, tileSize);
      fc.strokeStyle = '#22223a';
      fc.lineWidth = 0.5;
      fc.strokeRect(tx, ty, tileSize, tileSize);
    }
  }
  // Corner/center decorations
  for (let i = 0; i < 20; i++) {
    const rx = Math.floor(Math.random() * (W / tileSize)) * tileSize + tileSize / 2;
    const ry = Math.floor(Math.random() * (H / tileSize)) * tileSize + tileSize / 2;
    fc.fillStyle = 'rgba(255,255,255,0.03)';
    fc.fillRect(rx - 2, ry - 2, 4, 4);
  }
})();

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(1, 5, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs — animated walk cycle
  const legFrames = [[0,0,0,0],[3,-3,-3,3],[0,0,0,0],[-3,3,3,-3]];
  const lf = p.animState === 'walk' ? legFrames[p.animFrame] : legFrames[0];
  ctx.fillStyle = '#2c3e50';
  // Left leg
  ctx.fillRect(-6 + lf[0], 4 + lf[1], 5, 8);
  // Right leg
  ctx.fillRect(1 + lf[2],  4 + lf[3], 5, 8);

  // Body
  ctx.fillStyle = '#2d6a2d';
  ctx.fillRect(-7, -6, 14, 13);
  // Jacket highlight
  ctx.fillStyle = '#3a8a3a';
  ctx.fillRect(-6, -5, 5, 5);
  // Belt
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(-7, 4, 14, 3);

  // Head
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(0, -11, 6, 0, Math.PI * 2);
  ctx.fill();
  // Hair
  ctx.fillStyle = '#4a3728';
  ctx.fillRect(-5, -17, 10, 6);

  // Eyes (facing direction — blink occasionally)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-3, -13, 2, 2);
  ctx.fillRect(1, -13, 2, 2);

  // Gun (rotates to face mouse)
  ctx.rotate(p.facing);
  // Gun body
  ctx.fillStyle = '#555';
  ctx.fillRect(5, -3, 14, 5);
  // Gun barrel
  ctx.fillStyle = '#333';
  ctx.fillRect(14, -2, 7, 3);
  // Gun grip
  ctx.fillStyle = '#444';
  ctx.fillRect(6, 2, 5, 5);
  // Muzzle flash
  if (p.shootFlash > 0) {
    const fa = Math.min(1, p.shootFlash / 0.1);
    ctx.fillStyle = `rgba(255,220,50,${fa * 0.9})`;
    ctx.beginPath();
    ctx.arc(22, 0, 5 * fa, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,150,0,${fa * 0.7})`;
    ctx.beginPath();
    ctx.arc(22, 0, 3 * fa, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Invincibility shimmer
  if (p.invincible > 0 && Math.floor(p.invincible * 10) % 2 === 0) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawGrunt(e) {
  ctx.save();
  ctx.translate(e.x, e.y);

  const flash = e.hitFlash > 0;
  const baseColor = flash ? '#ffffff' : '#c0392b';
  const darkColor = flash ? '#ffcccc' : '#922b21';

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 8, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Leg walk
  const lf2 = [0,3,-3,0][e.animFrame];
  ctx.fillStyle = '#1a252f';
  ctx.fillRect(-5, 4 + lf2, 4, 6);
  ctx.fillRect(1,  4 - lf2, 4, 6);

  // Body
  ctx.fillStyle = baseColor;
  ctx.fillRect(-8, -6, 16, 13);
  ctx.fillStyle = darkColor;
  ctx.fillRect(-8, -6, 7, 6);

  // Head
  ctx.fillStyle = darkColor;
  ctx.fillRect(-5, -14, 10, 9);
  // Eyes
  ctx.fillStyle = '#ffff00';
  ctx.fillRect(-3, -12, 3, 3);
  ctx.fillRect(1,  -12, 3, 3);

  ctx.restore();
}

function drawTank(e) {
  ctx.save();
  ctx.translate(e.x, e.y);

  const flash = e.hitFlash > 0;
  const baseColor = flash ? '#ffffff' : '#7f8c8d';
  const darkColor = flash ? '#dddddd' : '#566573';
  const accentColor = flash ? '#aaaaaa' : '#4a555e';

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(1, 12, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs — slow stomp
  const stomp = e.animFrame < 2 ? 2 : -2;
  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(-10, 8 + stomp, 8, 10);
  ctx.fillRect(2,   8 - stomp, 8, 10);

  // Main body — chunky armored block
  ctx.fillStyle = baseColor;
  ctx.fillRect(-13, -10, 26, 19);
  // Armor plates
  ctx.fillStyle = darkColor;
  ctx.fillRect(-13, -10, 13, 9);
  ctx.fillRect(0,   1,   13, 8);
  ctx.fillStyle = accentColor;
  ctx.fillRect(-11, -8, 6, 5);
  ctx.fillRect(5,   3,  6, 4);

  // Head
  ctx.fillStyle = darkColor;
  ctx.fillRect(-7, -20, 14, 11);
  // Helmet visor
  ctx.fillStyle = '#1abc9c';
  ctx.fillRect(-5, -18, 10, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(-4, -17, 8, 3);

  ctx.restore();
}

function drawRunner(e) {
  ctx.save();
  ctx.translate(e.x, e.y);

  const flash = e.hitFlash > 0;
  const baseColor = flash ? '#ffffff' : '#e67e22';
  const darkColor = flash ? '#ffddaa' : '#ca6f1e';

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 7, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs — fast scurry
  const scurry = [4,-4,-4,4][e.animFrame];
  ctx.fillStyle = '#1a252f';
  ctx.fillRect(-4, 3 + scurry, 3, 6);
  ctx.fillRect(1,  3 - scurry, 3, 6);

  // Body — lean diamond shape
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(7, -3);
  ctx.lineTo(0, 5);
  ctx.lineTo(-7, -3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = darkColor;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(-7, -3);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();

  // Eyes — menacing
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(-3, -8, 2, 2);
  ctx.fillRect(1,  -8, 2, 2);

  ctx.restore();
}

const DRAW_FNS = { grunt: drawGrunt, tank: drawTank, runner: drawRunner };

function drawHPBar(e) {
  const t = ENEMY_TYPES[e.type];
  if (e.hp >= t.hp) return;
  const bw = t.size * 2 + 4;
  const bh = 3;
  const bx = e.x - bw / 2;
  const by = e.y - t.size - 8;
  ctx.fillStyle = '#333';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(bx, by, bw * (e.hp / t.hp), bh);
}

function renderBackground() {
  ctx.drawImage(floorCanvas, 0, 0);
}

function renderPickups() {
  for (const pk of state.pickups) {
    const pulse = Math.sin(pk.pulse) * 2;
    const r = 8 + pulse;
    ctx.save();
    ctx.globalAlpha = Math.min(1, pk.life * 0.5);
    if (pk.kind === 'health') {
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(pk.x - 5, pk.y - r, 10, r * 2);
      ctx.fillRect(pk.x - r, pk.y - 5, r * 2, 10);
      ctx.strokeStyle = '#27ae60';
      ctx.lineWidth = 1;
      ctx.strokeRect(pk.x - 5, pk.y - r, 10, r * 2);
      ctx.strokeRect(pk.x - r, pk.y - 5, r * 2, 10);
    } else {
      ctx.fillStyle = '#f39c12';
      ctx.fillRect(pk.x - r, pk.y - 4, r * 2, 8);
      ctx.fillStyle = '#e67e22';
      ctx.fillRect(pk.x - r + 2, pk.y - 2, (r - 2) * 2, 4);
    }
    ctx.restore();
  }
}

function renderGame() {
  ctx.save();
  if (state.shake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * state.shake * 2,
      (Math.random() - 0.5) * state.shake * 2,
    );
  }

  renderBackground();
  renderPickups();

  // Enemy shadows
  for (const e of state.enemies) {
    const t = ENEMY_TYPES[e.type];
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(e.x + 2, e.y + t.size * 0.6, t.size, t.size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw enemies (oriented toward player, so rotate to facing)
  for (const e of state.enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing - Math.PI / 2); // enemies face their movement direction
    ctx.translate(-e.x, -e.y);
    DRAW_FNS[e.type](e);
    ctx.restore();
    drawHPBar(e);
  }

  // Player
  drawPlayer(state.player);

  // Bullets
  for (const b of state.bullets) {
    ctx.save();
    ctx.fillStyle = '#ffe066';
    ctx.shadowColor = '#ff9900';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Particles
  for (const pt of state.particles) {
    const alpha = Math.max(0, pt.life / pt.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // end shake transform

  // Damage flash overlay
  if (state.damageFlash > 0) {
    ctx.fillStyle = `rgba(220,0,0,${Math.min(0.35, state.damageFlash * 1.4)})`;
    ctx.fillRect(0, 0, W, H);
  }

  renderHUD();
}

function renderHUD() {
  const p = state.player;

  // Health bar background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(8, 8, 156, 20);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(10, 10, 150, 16);
  const hpRatio = p.hp / p.maxHp;
  ctx.fillStyle = hpRatio > 0.5 ? '#27ae60' : hpRatio > 0.25 ? '#f39c12' : '#e74c3c';
  ctx.fillRect(10, 10, 150 * hpRatio, 16);
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, 150, 16);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`HP ${p.hp}/${p.maxHp}`, 14, 22);

  // Ammo
  const dotW = 6, dotH = 10, dotGap = 2;
  const totalW = p.maxAmmo * (dotW + dotGap) - dotGap;
  const ammoX = 10;
  const ammoY = 32;
  for (let i = 0; i < p.maxAmmo; i++) {
    ctx.fillStyle = i < p.ammo ? '#f39c12' : '#333';
    ctx.fillRect(ammoX + i * (dotW + dotGap), ammoY, dotW, dotH);
  }

  // Reload indicator
  if (p.reloading) {
    const prog = 1 - (p.reloadTimer / RELOAD_TIME);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(ammoX, ammoY + 12, totalW, 4);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(ammoX, ammoY + 12, totalW * prog, 4);
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.fillText('RELOADING', ammoX, ammoY + 24);
  }

  // Score
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`SCORE  ${state.score}`, W / 2, 22);
  ctx.textAlign = 'left';

  // Level
  ctx.fillStyle = '#f39c12';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`LVL ${state.level}`, W - 10, 22);
  ctx.textAlign = 'left';

  // Enemies remaining
  ctx.fillStyle = '#e74c3c';
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`ENEMIES: ${state.enemies.length}`, W - 10, 38);
  ctx.textAlign = 'left';

  // Shoot cooldown arc near player
  if (p.shootCooldown > 0 && !p.reloading) {
    ctx.save();
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 22, 7, -Math.PI / 2,
      -Math.PI / 2 + (1 - p.shootCooldown / SHOOT_COOLDOWN) * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function renderMenu() {
  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);

  // Grid lines for atmosphere
  ctx.strokeStyle = 'rgba(40,40,80,0.5)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);

  // Title glow
  ctx.save();
  ctx.shadowColor = '#e74c3c';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 72px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('DEAD ZONE', W / 2, H / 2 - 70);
  ctx.restore();

  // Subtitle
  ctx.fillStyle = '#888';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TOP-DOWN SURVIVAL SHOOTER', W / 2, H / 2 - 30);

  // Blinking prompt
  if (Math.floor(state.menuTimer * 2) % 2 === 0) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('CLICK TO START', W / 2, H / 2 + 20);
  }

  // Controls
  ctx.fillStyle = '#555';
  ctx.font = '13px monospace';
  ctx.fillText('WASD / ARROWS: MOVE    MOUSE: AIM    CLICK: SHOOT', W / 2, H / 2 + 65);
  ctx.fillText('ELIMINATE ALL ENEMIES TO ADVANCE LEVELS', W / 2, H / 2 + 85);

  // Hi-score
  ctx.fillStyle = '#f39c12';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`HI-SCORE: ${state.hiScore}`, W / 2, H / 2 + 120);

  ctx.textAlign = 'left';

  // Draw some silhouette enemies for decoration
  drawMenuEnemies();
}

function drawMenuEnemies() {
  const t = state.menuTimer;
  // Drifting enemy silhouettes
  const deco = [
    { type: 'grunt',  x: 80  + Math.sin(t * 0.7) * 30, y: 80  + Math.cos(t * 0.5) * 20 },
    { type: 'runner', x: 720 + Math.sin(t * 0.6) * 25, y: 100 + Math.cos(t * 0.8) * 30 },
    { type: 'tank',   x: 100 + Math.sin(t * 0.4) * 20, y: 500 + Math.cos(t * 0.6) * 15 },
    { type: 'grunt',  x: 700 + Math.sin(t * 0.9) * 35, y: 480 + Math.cos(t * 0.4) * 25 },
  ];
  ctx.save();
  ctx.globalAlpha = 0.3;
  for (const d of deco) {
    const e = { ...d, facing: Math.atan2(H / 2 - d.y, W / 2 - d.x), animFrame: 0, animTimer: 0, hitFlash: 0, hp: 99, maxHp: 99 };
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing - Math.PI / 2);
    ctx.translate(-e.x, -e.y);
    DRAW_FNS[d.type](e);
    ctx.restore();
  }
  ctx.restore();
}

function renderLevelComplete() {
  renderGame();

  // Overlay
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = '#f39c12';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#f39c12';
  ctx.font = 'bold 52px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LEVEL CLEAR!', W / 2, H / 2 - 40);
  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.font = '22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`SCORE: ${state.score}`, W / 2, H / 2 + 10);
  ctx.fillStyle = '#aaa';
  ctx.font = '16px monospace';
  ctx.fillText(`LEVEL ${state.level + 1} INCOMING...`, W / 2, H / 2 + 45);

  const prog = Math.min(1, state.levelTimer / 3.0);
  ctx.fillStyle = '#333';
  ctx.fillRect(W / 2 - 100, H / 2 + 65, 200, 8);
  ctx.fillStyle = '#f39c12';
  ctx.fillRect(W / 2 - 100, H / 2 + 65, 200 * prog, 8);

  ctx.textAlign = 'left';
}

function renderGameOver() {
  // Fade in dark overlay
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = '#e74c3c';
  ctx.shadowBlur = 25;
  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', W / 2, H / 2 - 60);
  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.font = '24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`SCORE: ${state.score}`, W / 2, H / 2);

  ctx.fillStyle = '#f39c12';
  ctx.font = '18px monospace';
  ctx.fillText(`HI-SCORE: ${state.hiScore}`, W / 2, H / 2 + 35);

  if (state.menuTimer > 1.5 && Math.floor(state.menuTimer * 2) % 2 === 0) {
    ctx.fillStyle = '#aaa';
    ctx.font = '16px monospace';
    ctx.fillText('CLICK TO RETURN TO MENU', W / 2, H / 2 + 80);
  }

  ctx.textAlign = 'left';
}

// ── Game loop ─────────────────────────────────────────────────
let lastTime = performance.now();

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  ctx.clearRect(0, 0, W, H);

  switch (state.phase) {
    case 'MENU':           updateMenu(dt);           renderMenu();           break;
    case 'PLAYING':        updateGame(dt);           renderGame();           break;
    case 'LEVEL_COMPLETE': updateLevelComplete(dt);  renderLevelComplete();  break;
    case 'GAME_OVER':      updateGameOver(dt);       renderGameOver();       break;
  }

  mouse.clicked = false; // consume one-shot flag
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
