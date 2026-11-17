// Factories and motion for everything that moves: the wisp (player), the void creatures,
// bullets, XP shards, enemy orbs, particles and floating score text. Entities are plain objects;
// world.js decides when they spawn, collide and die.
import { ENEMY_KINDS, ELITE_HP_MULT, ELITE_RADIUS_MULT, ELITE_XP, PLAYER, VIEW_W, VIEW_H, hpScaleFor, speedScaleFor, damageScaleFor } from './config.js';

export function createPlayer() {
  return {
    x: VIEW_W / 2,
    y: VIEW_H / 2,
    radius: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    speed: PLAYER.speed,
    fireInterval: PLAYER.fireInterval,
    bulletSpeed: PLAYER.bulletSpeed,
    bulletDamage: PLAYER.bulletDamage,
    bulletRadius: PLAYER.bulletRadius,
    magnetRadius: PLAYER.magnetRadius,
    regenPerSecond: PLAYER.regenPerSecond,
    shots: 1,
    pierce: 0,
    critChance: 0,
    fireTimer: 0,
    invuln: 0,
    level: 1,
    xp: 0,
    trail: [],
  };
}

export function spawnEnemy(random, kind, wave, elite) {
  const def = ENEMY_KINDS[kind];
  const hpScale = hpScaleFor(wave);
  const margin = 40;
  const side = random.int(0, 3);
  let x;
  let y;
  if (side === 0) { x = random.range(0, VIEW_W); y = -margin; }
  else if (side === 1) { x = VIEW_W + margin; y = random.range(0, VIEW_H); }
  else if (side === 2) { x = random.range(0, VIEW_W); y = VIEW_H + margin; }
  else { x = -margin; y = random.range(0, VIEW_H); }
  return {
    kind,
    elite: Boolean(elite),
    x,
    y,
    radius: def.radius * (elite ? ELITE_RADIUS_MULT : 1),
    hp: def.hp * hpScale * (elite ? ELITE_HP_MULT : 1),
    maxHp: def.hp * hpScale * (elite ? ELITE_HP_MULT : 1),
    speed: def.speed * speedScaleFor(wave) * random.range(0.9, 1.1),
    damage: def.damage * damageScaleFor(wave),
    xp: elite ? ELITE_XP : def.xp,
    score: def.score * (elite ? 5 : 1),
    color: elite ? '#ffd166' : def.color,
    glow: elite ? '#b8860b' : def.glow,
    shoot: def.shoot,
    shootTimer: random.range(1, 2.4),
    wobble: random.range(0, Math.PI * 2),
    hitFlash: 0,
  };
}

export function spawnBoss(random, wave) {
  const boss = spawnEnemy(random, 'boss', wave, false);
  boss.hp = 800 * (1 + (wave / 5 - 1) * 0.6);
  boss.maxHp = boss.hp;
  boss.x = VIEW_W / 2;
  boss.y = -70;
  return boss;
}

export function createBullet(x, y, vx, vy, damage, radius, pierce) {
  return { x, y, vx, vy, damage, radius, pierce, life: 0.9, hitIds: new Set() };
}

export function createEnemyOrb(x, y, vx, vy, damage) {
  return { x, y, vx, vy, damage, radius: 7, life: 4 };
}

export function createShard(x, y, value) {
  return { x, y, value, vx: 0, vy: 0, radius: 7, bob: Math.random() * Math.PI * 2 };
}

export function createParticle(x, y, color, count, speed, life) {
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    parts.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      radius: 1.5 + Math.random() * 3,
      color,
      life: life * (0.5 + Math.random() * 0.5),
      maxLife: life,
    });
  }
  return parts;
}

export function createFloatText(x, y, text, color) {
  return { x, y, text, color, life: 0.9, maxLife: 0.9 };
}

// --- Motion helpers ---------------------------------------------------------

// Steer an enemy toward the player, with a per-enemy wobble so the swarm does not move as one.
export function moveEnemy(enemy, player, dt, time) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const wobble = Math.sin(time * 2 + enemy.wobble) * 0.35;
  const nx = dx / dist;
  const ny = dy / dist;
  const px = -ny * wobble;
  const py = nx * wobble;
  enemy.x += (nx + px) * enemy.speed * dt;
  enemy.y += (ny + py) * enemy.speed * dt;
}

// Push overlapping enemies apart so they do not stack on one point.
export function separateEnemies(enemies) {
  for (let i = 0; i < enemies.length; i += 1) {
    for (let j = i + 1; j < enemies.length; j += 1) {
      const a = enemies[i];
      const b = enemies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const min = a.radius + b.radius;
      if (dist > 0.01 && dist < min) {
        const push = (min - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

// Shards drift toward the player once inside the magnet radius, faster the closer they get.
export function moveShard(shard, player, dt) {
  const dx = player.x - shard.x;
  const dy = player.y - shard.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist < player.magnetRadius) {
    const pull = 900 * (1 - dist / (player.magnetRadius + 60));
    shard.vx += (dx / dist) * pull * dt;
    shard.vy += (dy / dist) * pull * dt;
  }
  shard.vx *= 0.92;
  shard.vy *= 0.92;
  shard.x += shard.vx * dt;
  shard.y += shard.vy * dt;
  shard.bob += dt * 4;
}

export function moveParticle(p, dt) {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= 0.96;
  p.vy *= 0.96;
  p.life -= dt;
}
