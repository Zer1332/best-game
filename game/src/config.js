// VOIDBLOOM — tuning and content tables. One place for every number the game balances on,
// so a change here retunes the whole game without touching the rules in world.js.
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STEP = 1 / 60;
export const BEST_KEY = 'voidbloom-best-score';

export const PLAYER = {
  radius: 14,
  speed: 265,
  maxHp: 100,
  fireInterval: 0.3,
  bulletSpeed: 640,
  bulletDamage: 14,
  bulletRadius: 5,
  magnetRadius: 95,
  invulnSeconds: 0.6,
  regenPerSecond: 0,
};

export const COMBO_WINDOW = 3; // seconds without a kill before the combo resets
export const COMBO_STEP = 0.05; // +5% score per combo step, capped below

// xpNeed(level) = shards to go from `level` to `level + 1`.
export function xpNeedFor(level) {
  return 6 + level * 4;
}

// Enemy kinds. hp/speed/damage scale a little with the wave in world.js.
export const ENEMY_KINDS = {
  mote:   { radius: 12, hp: 18,  speed: 72,  damage: 8,  xp: 1, score: 10, color: '#b78cff', glow: '#7b3fe4', shoot: false },
  spore:  { radius: 10, hp: 11,  speed: 138, damage: 6,  xp: 1, score: 15, color: '#7ef0c1', glow: '#1fae7a', shoot: false },
  gloom:  { radius: 14, hp: 30,  speed: 96,  damage: 8,  xp: 2, score: 25, color: '#ff9d6b', glow: '#e05a1f', shoot: true },
  thorn:  { radius: 19, hp: 50,  speed: 46,  damage: 14, xp: 3, score: 30, color: '#ff6b8a', glow: '#c2183f', shoot: false },
  boss:   { radius: 48, hp: 950, speed: 42,  damage: 20, xp: 20, score: 500, color: '#ffd166', glow: '#b8860b', shoot: true },
};

export const ELITE_HP_MULT = 2.3;
export const ELITE_RADIUS_MULT = 1.35;
export const ELITE_XP = 5;

// Which kinds may appear from which wave on. Boss waves are every 5th wave.
export function kindsForWave(wave) {
  const kinds = ['mote'];
  if (wave >= 2) kinds.push('spore');
  if (wave >= 3) kinds.push('gloom');
  if (wave >= 4) kinds.push('thorn');
  return kinds;
}

export function killsToClearWave(wave) {
  return 8 + wave * 4;
}

export function spawnIntervalFor(wave) {
  return Math.max(0.35, 1.0 - wave * 0.06);
}

// How many creatures may be alive at once; the director waits while the field is full, so
// the swarm never grows past what the screen (and the player) can read.
export function maxAliveFor(wave) {
  return 6 + wave;
}

// Enemy toughness grows with the wave: tougher, a little faster, and hitting a little harder.
export function hpScaleFor(wave) {
  return 1 + (wave - 1) * 0.15;
}

export function speedScaleFor(wave) {
  return 1 + (wave - 1) * 0.035;
}

export function damageScaleFor(wave) {
  return 1 + (wave - 1) * 0.06;
}

// Level-up choices. Each entry: id, name, short description, max stacks, and the stat it changes.
export const UPGRADES = [
  { id: 'damage',   name: 'Petal Edge',   desc: '+25% bullet damage',        max: 6, apply: (s) => { s.bulletDamage *= 1.25; } },
  { id: 'firerate', name: 'Rapid Bloom',  desc: '+20% fire rate',            max: 6, apply: (s) => { s.fireInterval *= 0.83; } },
  { id: 'speed',    name: 'Swift Spore',  desc: '+12% move speed',           max: 5, apply: (s) => { s.speed *= 1.12; } },
  { id: 'vitality', name: 'Deep Root',    desc: '+25 max HP and heal 25',    max: 6, apply: (s) => { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); } },
  { id: 'magnet',   name: 'Lure Petals',  desc: '+45% pickup radius',        max: 4, apply: (s) => { s.magnetRadius *= 1.45; } },
  { id: 'multishot', name: 'Twin Bloom',  desc: '+1 bullet per shot',        max: 3, apply: (s) => { s.shots += 1; } },
  { id: 'pierce',   name: 'Thorn Pierce', desc: 'Bullets pierce +1 enemy',   max: 3, apply: (s) => { s.pierce += 1; } },
  { id: 'regen',    name: 'Slow Mend',    desc: 'Regenerate +0.8 HP / sec',  max: 3, apply: (s) => { s.regenPerSecond += 0.8; } },
  { id: 'crit',     name: 'Bright Core',  desc: '+8% crit chance (x2 dmg)', max: 5, apply: (s) => { s.critChance += 0.08; } },
  { id: 'bulletsize', name: 'Heavy Pollen', desc: '+20% bullet size & damage', max: 4, apply: (s) => { s.bulletRadius *= 1.2; s.bulletDamage *= 1.2; } },
];
