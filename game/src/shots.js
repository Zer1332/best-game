// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by a simple autopilot, so the frame is
// what a short game really looks like and the same seed always gives the same frame.
import { STEP, VIEW_W, VIEW_H } from './config.js';
import { EVENT_OVER } from './world.js';
import { rollChoices } from './ui.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 40;
const PLAY_LIMIT_SECONDS = 90;
const END_LIMIT_SECONDS = 600;
// A tuning override for playtests only: ?shot=play&seconds=120 simulates two minutes.
const secondsOverride = Number.parseInt(new URLSearchParams(window.location.search).get('seconds') ?? '', 10);

/** The play autopilot: kite away from the nearest creature, drift toward the nearest shard when
 *  it is safe, and always fire at the nearest creature — the boss first when one is awake. Good
 *  enough to survive the first waves. */
function playPilot(state) {
  const p = state.player;
  const boss = state.enemies.find((e) => e.kind === 'boss');
  let nearestEnemy = boss ?? null;
  let nearestDist = boss ? Math.hypot(boss.x - p.x, boss.y - p.y) : Infinity;
  if (!boss) {
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = e;
      }
    }
  }
  let dx = 0;
  let dy = 0;
  if (nearestEnemy && nearestDist < 190) {
    dx = (p.x - nearestEnemy.x) / (nearestDist || 1);
    dy = (p.y - nearestEnemy.y) / (nearestDist || 1);
  } else {
    let nearestShard = null;
    let shardDist = Infinity;
    for (const s of state.shards) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < shardDist) {
        shardDist = d;
        nearestShard = s;
      }
    }
    if (nearestShard && shardDist > 12) {
      dx = (nearestShard.x - p.x) / shardDist;
      dy = (nearestShard.y - p.y) / shardDist;
    } else {
      // No threat, no shard: drift toward the centre.
      const cx = VIEW_W / 2 - p.x;
      const cy = VIEW_H / 2 - p.y;
      const cd = Math.hypot(cx, cy);
      if (cd > 40) {
        dx = cx / cd;
        dy = cy / cd;
      }
    }
  }
  // Keep inside the field with a margin.
  if (p.x < 70) dx = Math.abs(dx) || 1;
  if (p.x > VIEW_W - 70) dx = -Math.abs(dx) || -1;
  if (p.y < 70) dy = Math.abs(dy) || 1;
  if (p.y > VIEW_H - 70) dy = -Math.abs(dy) || -1;
  return {
    dx, dy,
    aimX: nearestEnemy ? nearestEnemy.x : p.x + 100,
    aimY: nearestEnemy ? nearestEnemy.y : p.y,
    firing: nearestEnemy !== null,
  };
}

/** The end-scene pilot fires at the nearest creature but never moves: it scores a few kills,
 *  then the swarm catches it, as it catches any wisp that stops blooming. */
function doomedPilot(state) {
  const p = state.player;
  let nearestEnemy = null;
  let nearestDist = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearestEnemy = e;
    }
  }
  return {
    dx: 0, dy: 0,
    aimX: nearestEnemy ? nearestEnemy.x : p.x + 100,
    aimY: nearestEnemy ? nearestEnemy.y : p.y,
    firing: nearestEnemy !== null,
  };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { dx: 0, dy: 0, aimX: 0, aimY: 0, firing: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const pilot = name === 'end' ? doomedPilot : playPilot;
  const limit = name === 'end'
    ? END_LIMIT_SECONDS
    : (Number.isInteger(secondsOverride) && secondsOverride > 0 ? secondsOverride : PLAY_LIMIT_SECONDS);
  // Snapshots every 5 simulated seconds, for balance playtests (read via window.__voidbloom).
  const trace = [];
  let nextTraceAt = 5;
  // Level-ups pause the real game; the pilot takes the first card so the simulation continues.
  for (let index = 0; index < limit / STEP; index += 1) {
    const state = world.state;
    // The play scene wants a busy frame: at least 40 s in and 10 creatures on screen, so the
    // shot shows the fight, not the quiet seconds after a wave clears. A plain `seconds`
    // override runs the full length instead (that is what balance probes use).
    if (name === 'play' && !secondsOverride && state.time >= PLAY_SECONDS && state.enemies.length >= 10) break;
    if (state.time >= nextTraceAt) {
      const boss = state.enemies.find((e) => e.kind === 'boss');
      trace.push({
        t: Math.round(state.time),
        wave: state.wave,
        hp: Math.ceil(state.player.hp),
        level: state.player.level,
        score: state.score,
        foes: state.enemies.length,
        bossHp: boss ? Math.ceil(boss.hp) : null,
      });
      nextTraceAt += 5;
    }
    if (state.levelChoices) {
      const choice = state.levelChoices[0];
      choice.apply(state.player);
      state.takenUpgrades[choice.id] = (state.takenUpgrades[choice.id] ?? 0) + 1;
      state.pendingLevels -= 1;
      state.levelChoices = state.pendingLevels > 0
        ? rollChoices(world.random, state.takenUpgrades)
        : null;
      continue;
    }
    if (world.step(STEP, pilot(state), false) & EVENT_OVER) break;
  }
  const over = world.state.gameOver;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, trace };
}
