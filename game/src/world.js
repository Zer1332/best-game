// The rules of VOIDBLOOM: one fixed-step advance of the whole world. The loop in main.js calls
// step() 60 times a second with the player's input; this file owns waves, spawning, movement,
// collisions, XP and levels, score and combo — everything that decides what happens next.
import {
  VIEW_W, VIEW_H, COMBO_WINDOW, COMBO_STEP, PLAYER,
  kindsForWave, killsToClearWave, spawnIntervalFor, xpNeedFor, maxAliveFor,
} from './config.js';
import {
  createPlayer, spawnEnemy, spawnBoss, createBullet, createEnemyOrb, createShard,
  createParticle, createFloatText, moveEnemy, separateEnemies, moveShard, moveParticle,
} from './entities.js';
import { rollChoices } from './ui.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_LEVELUP = 4;
export const EVENT_WAVECLEAR = 8;
export const EVENT_BOSS = 16;

export function createWorld(random) {
  const state = {
    player: createPlayer(),
    enemies: [],
    bullets: [],
    enemyOrbs: [],
    shards: [],
    particles: [],
    floats: [],
    wave: 1,
    waveKills: 0,
    waveQuota: killsToClearWave(1),
    spawnedThisWave: 0,
    spawnTimer: 1,
    intermission: 0,
    bossSpawned: false,
    bossDead: false,
    score: 0,
    combo: 0,
    comboTimer: 0,
    kills: 0,
    time: 0,
    shake: 0,
    flash: 0,
    pendingLevels: 0,
    levelChoices: null,
    takenUpgrades: {},
    gameOver: false,
    banner: '',
    bannerTimer: 0,
    sounds: [],
  };
  return {
    state,
    random,
    reset() {
      const fresh = createWorld(random).state;
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, fresh);
    },
    step,
  };

  function step(dt, input, attract) {
    const s = state;
    const p = s.player;
    s.sounds.length = 0;
    s.time += dt;
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 30);
    if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 2.2);
    if (s.bannerTimer > 0) s.bannerTimer -= dt;
    updateParticlesAndFloats(dt);

    if (attract) {
      // Title-screen backdrop: stray motes drift across the field, nothing fights.
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0 && s.enemies.length < 9) {
        s.spawnTimer = 1.4;
        const mote = spawnEnemy(random, 'mote', 1, false);
        mote.x = random.range(0, VIEW_W);
        mote.y = -30;
        mote.speed = 40;
        s.enemies.push(mote);
      }
      for (let i = s.enemies.length - 1; i >= 0; i -= 1) {
        const e = s.enemies[i];
        e.y += e.speed * dt;
        e.x += Math.sin(s.time + e.wobble) * 20 * dt;
        if (e.y > VIEW_H + 40) s.enemies.splice(i, 1);
      }
      return 0;
    }

    if (s.gameOver) return 0;
    let events = 0;

    // --- Player -------------------------------------------------------------
    if (p.invuln > 0) p.invuln -= dt;
    if (p.regenPerSecond > 0) p.hp = Math.min(p.maxHp, p.hp + p.regenPerSecond * dt);
    p.x = Math.max(p.radius, Math.min(VIEW_W - p.radius, p.x + input.dx * p.speed * dt));
    p.y = Math.max(p.radius, Math.min(VIEW_H - p.radius, p.y + input.dy * p.speed * dt));
    p.trail.push({ x: p.x, y: p.y, life: 0.35 });
    if (p.trail.length > 14) p.trail.shift();
    for (const t of p.trail) t.life -= dt;

    // --- Firing -------------------------------------------------------------
    p.fireTimer -= dt;
    if (input.firing && p.fireTimer <= 0) {
      p.fireTimer = p.fireInterval;
      const base = Math.atan2(input.aimY - p.y, input.aimX - p.x);
      for (let i = 0; i < p.shots; i += 1) {
        const angle = base + (i - (p.shots - 1) / 2) * 0.13;
        s.bullets.push(createBullet(
          p.x + Math.cos(angle) * (p.radius + 6),
          p.y + Math.sin(angle) * (p.radius + 6),
          Math.cos(angle) * p.bulletSpeed,
          Math.sin(angle) * p.bulletSpeed,
          p.bulletDamage, p.bulletRadius, p.pierce,
        ));
      }
      s.particles.push(...createParticle(p.x + Math.cos(base) * 22, p.y + Math.sin(base) * 22, '#ffe9a8', 3, 120, 0.18));
      s.sounds.push('shoot');
    }

    // --- Waves ---------------------------------------------------------------
    if (s.intermission > 0) {
      s.intermission -= dt;
      if (s.intermission <= 0) startWave(s.wave);
    } else if (s.spawnedThisWave < s.waveQuota || (isBossWave() && !s.bossSpawned)) {
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0 && s.enemies.length < maxAliveFor(s.wave)) {
        s.spawnTimer = spawnIntervalFor(s.wave);
        spawnOne();
      } else if (s.spawnTimer <= 0) {
        s.spawnTimer = 0.25; // Field is full: check again shortly instead of bursting later.
      }
    }

    // --- Enemies -------------------------------------------------------------
    for (let i = s.enemies.length - 1; i >= 0; i -= 1) {
      const e = s.enemies[i];
      moveEnemy(e, p, dt, s.time);
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.shoot) {
        e.shootTimer -= dt;
        const dist = Math.hypot(p.x - e.x, p.y - e.y);
        if (e.shootTimer <= 0 && dist < 480) {
          e.shootTimer = e.kind === 'boss' ? 2.6 : 2.4;
          if (e.kind === 'boss') {
            for (let k = 0; k < 8; k += 1) {
              const a = (k / 8) * Math.PI * 2 + s.time;
              s.enemyOrbs.push(createEnemyOrb(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150, e.damage));
            }
            s.sounds.push('boss');
          } else {
            const a = Math.atan2(p.y - e.y, p.x - e.x);
            s.enemyOrbs.push(createEnemyOrb(e.x, e.y, Math.cos(a) * 165, Math.sin(a) * 165, e.damage));
          }
        }
      }
      // Touch damage.
      const dist = Math.hypot(p.x - e.x, p.y - e.y);
      if (dist < p.radius + e.radius && p.invuln <= 0) {
        hurtPlayer(e.damage);
        events |= EVENT_HIT;
        // Shove the player away from the hit so hits do not chain instantly.
        const nx = (p.x - e.x) / (dist || 1);
        const ny = (p.y - e.y) / (dist || 1);
        p.x = Math.max(p.radius, Math.min(VIEW_W - p.radius, p.x + nx * 26));
        p.y = Math.max(p.radius, Math.min(VIEW_H - p.radius, p.y + ny * 26));
        if (p.hp <= 0) {
          s.gameOver = true;
          s.sounds.push('gameOver');
          return events | EVENT_OVER;
        }
      }
    }
    separateEnemies(s.enemies);

    // --- Bullets -------------------------------------------------------------
    for (let i = s.bullets.length - 1; i >= 0; i -= 1) {
      const b = s.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > VIEW_W + 20 || b.y < -20 || b.y > VIEW_H + 20) {
        s.bullets.splice(i, 1);
        continue;
      }
      for (let j = s.enemies.length - 1; j >= 0; j -= 1) {
        const e = s.enemies[j];
        if (b.hitIds.has(e)) continue;
        const dist = Math.hypot(e.x - b.x, e.y - b.y);
        if (dist < e.radius + b.radius) {
          b.hitIds.add(e);
          const crit = random.next() < p.critChance;
          const dmg = b.damage * (crit ? 2 : 1);
          e.hp -= dmg;
          e.hitFlash = 0.09;
          s.particles.push(...createParticle(b.x, b.y, e.color, 4, 160, 0.25));
          if (crit) s.floats.push(createFloatText(e.x, e.y - e.radius, `CRIT ${Math.round(dmg)}`, '#ffd166'));
          s.sounds.push('hit');
          if (e.hp <= 0) killEnemy(j);
          if (b.pierce <= 0) {
            s.bullets.splice(i, 1);
            break;
          }
          b.pierce -= 1;
        }
      }
    }

    // --- Enemy orbs ------------------------------------------------------------
    for (let i = s.enemyOrbs.length - 1; i >= 0; i -= 1) {
      const o = s.enemyOrbs[i];
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt;
      const dist = Math.hypot(p.x - o.x, p.y - o.y);
      if (o.life <= 0 || o.x < -20 || o.x > VIEW_W + 20 || o.y < -20 || o.y > VIEW_H + 20) {
        s.enemyOrbs.splice(i, 1);
        continue;
      }
      if (dist < p.radius + o.radius && p.invuln <= 0) {
        hurtPlayer(o.damage);
        events |= EVENT_HIT;
        s.enemyOrbs.splice(i, 1);
        if (p.hp <= 0) {
          s.gameOver = true;
          s.sounds.push('gameOver');
          return events | EVENT_OVER;
        }
      }
    }

    // --- Shards ------------------------------------------------------------------
    for (let i = s.shards.length - 1; i >= 0; i -= 1) {
      const shard = s.shards[i];
      moveShard(shard, p, dt);
      const dist = Math.hypot(p.x - shard.x, p.y - shard.y);
      if (dist < p.radius + shard.radius + 8) {
        s.shards.splice(i, 1);
        p.xp += shard.value;
        s.sounds.push('pickup');
        s.particles.push(...createParticle(shard.x, shard.y, '#7ef0c1', 3, 90, 0.25));
        while (p.xp >= xpNeedFor(p.level)) {
          p.xp -= xpNeedFor(p.level);
          p.level += 1;
          s.pendingLevels += 1;
          s.floats.push(createFloatText(p.x, p.y - 30, 'LEVEL UP!', '#7ef0c1'));
          s.sounds.push('levelup');
        }
      }
    }

    // --- Combo decay --------------------------------------------------------------
    if (s.comboTimer > 0) {
      s.comboTimer -= dt;
      if (s.comboTimer <= 0) s.combo = 0;
    }

    // --- Level-up offer ---------------------------------------------------------------
    if (s.pendingLevels > 0 && !s.levelChoices) {
      s.levelChoices = rollChoices(random, s.takenUpgrades);
      events |= EVENT_LEVELUP;
    }

    // --- Wave clear ---------------------------------------------------------------------
    // Guarded by intermission: without it the clear would fire every step until startWave
    // resets the counters, and waves would skip ahead several at a time.
    if (s.intermission <= 0 && !isBossWave() && s.waveKills >= s.waveQuota && s.enemies.length === 0) {
      const bonus = 50 * s.wave;
      s.score += bonus;
      p.hp = Math.min(p.maxHp, p.hp + 15);
      s.floats.push(createFloatText(p.x, p.y - 30, '+15 HP', '#ff8fa3'));
      s.banner = `WAVE ${s.wave} CLEAR  +${bonus}`;
      s.bannerTimer = 2.2;
      s.sounds.push('waveClear');
      events |= EVENT_WAVECLEAR;
      s.wave += 1;
      s.waveKills = 0;
      s.waveQuota = killsToClearWave(s.wave);
      s.spawnedThisWave = 0;
      s.bossSpawned = false;
      s.bossDead = false;
      s.intermission = 2.5;
    } else if (s.intermission <= 0 && isBossWave() && s.bossDead) {
      const bonus = 100 * s.wave;
      s.score += bonus;
      p.hp = Math.min(p.maxHp, p.hp + 25);
      s.floats.push(createFloatText(p.x, p.y - 30, '+25 HP', '#ff8fa3'));
      s.banner = `VOIDMOTHER DOWN  +${bonus}`;
      s.bannerTimer = 2.2;
      s.sounds.push('waveClear');
      events |= EVENT_WAVECLEAR;
      s.wave += 1;
      s.waveKills = 0;
      s.waveQuota = killsToClearWave(s.wave);
      s.spawnedThisWave = 0;
      s.bossSpawned = false;
      s.bossDead = false;
      s.intermission = 2.5;
      for (const e of s.enemies) s.particles.push(...createParticle(e.x, e.y, e.color, 10, 220, 0.5));
      s.enemies.length = 0;
      s.enemyOrbs.length = 0;
    }
    return events;

    // --- Local helpers ------------------------------------------------------------
    function isBossWave() {
      return s.wave % 5 === 0;
    }

    function startWave(wave) {
      s.waveKills = 0;
      s.waveQuota = killsToClearWave(wave);
      s.spawnedThisWave = 0;
      s.spawnTimer = 0.8;
      s.bossSpawned = false;
      s.bossDead = false;
      s.banner = isBossWave() ? `WAVE ${wave} — THE VOIDMOTHER WAKES` : `WAVE ${wave}`;
      s.bannerTimer = 2.2;
      if (isBossWave()) s.sounds.push('boss');
    }

    function spawnOne() {
      if (isBossWave() && !s.bossSpawned) {
        s.bossSpawned = true;
        s.enemies.push(spawnBoss(random, s.wave));
        return;
      }
      // Boss waves keep their escort trickle small: the boss is the fight, not the swarm.
      if (isBossWave() && s.spawnedThisWave >= 12) return;
      const kinds = kindsForWave(s.wave);
      const kind = random.pick(kinds);
      const elite = random.chance(0.06 + s.wave * 0.004);
      s.enemies.push(spawnEnemy(random, kind, s.wave, elite));
      s.spawnedThisWave += 1;
    }

    function killEnemy(index) {
      const e = s.enemies[index];
      s.enemies.splice(index, 1);
      s.kills += 1;
      s.waveKills += 1;
      s.combo += 1;
      s.comboTimer = COMBO_WINDOW;
      const mult = 1 + Math.min(s.combo, 20) * COMBO_STEP;
      s.score += Math.round(e.score * mult);
      s.particles.push(...createParticle(e.x, e.y, e.color, e.kind === 'boss' ? 40 : 12, 260, 0.5));
      const shards = Math.min(3, e.xp);
      for (let k = 0; k < shards; k += 1) {
        s.shards.push(createShard(
          e.x + random.range(-14, 14), e.y + random.range(-14, 14),
          Math.ceil(e.xp / shards),
        ));
      }
      if (e.kind === 'boss') {
        s.bossDead = true;
        s.shake = 14;
        s.floats.push(createFloatText(e.x, e.y, 'VOIDMOTHER DOWN!', '#ffd166'));
      } else if (e.elite) {
        s.floats.push(createFloatText(e.x, e.y - 10, `ELITE +${e.score}`, '#ffd166'));
      }
      s.sounds.push('enemyDie');
    }

    function hurtPlayer(damage) {
      p.hp -= damage;
      p.invuln = PLAYER.invulnSeconds;
      s.shake = 9;
      s.flash = 0.55;
      s.combo = 0;
      s.sounds.push('hurt');
    }

    function updateParticlesAndFloats(dt) {
      for (let i = s.particles.length - 1; i >= 0; i -= 1) {
        moveParticle(s.particles[i], dt);
        if (s.particles[i].life <= 0) s.particles.splice(i, 1);
      }
      for (let i = s.floats.length - 1; i >= 0; i -= 1) {
        const f = s.floats[i];
        f.y -= 34 * dt;
        f.life -= dt;
        if (f.life <= 0) s.floats.splice(i, 1);
      }
    }
  }
}
