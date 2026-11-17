// Level-up choices and the rectangles the mouse can click: which three upgrades are offered
// and where their cards sit on the screen. Rendering lives in render.js; this file only decides
// the content and the geometry.
import { UPGRADES, VIEW_W, VIEW_H } from './config.js';

export const CARD_W = 300;
export const CARD_H = 170;
export const CARD_GAP = 28;

// Pick three distinct upgrades the player has not maxed out yet. When almost everything is
// maxed, the same upgrade may appear twice rather than offering nothing.
export function rollChoices(random, taken) {
  const available = UPGRADES.filter((u) => (taken[u.id] ?? 0) < u.max);
  const pool = available.length > 0 ? available : UPGRADES;
  const choices = [];
  const used = new Set();
  while (choices.length < 3) {
    const pick = pool[Math.floor(random.next() * pool.length)];
    if (used.has(pick.id) && pool.length > choices.length) continue;
    used.add(pick.id);
    choices.push(pick);
  }
  return choices;
}

// The three card rectangles, centred as a row.
export function cardRects() {
  const total = CARD_W * 3 + CARD_GAP * 2;
  const x0 = (VIEW_W - total) / 2;
  const y = VIEW_H / 2 - 40;
  return [0, 1, 2].map((i) => ({
    x: x0 + i * (CARD_W + CARD_GAP),
    y,
    w: CARD_W,
    h: CARD_H,
  }));
}

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// Which card (0-2) the point is over, or -1.
export function pickCardAt(x, y) {
  const rects = cardRects();
  for (let i = 0; i < rects.length; i += 1) {
    if (pointInRect(x, y, rects[i])) return i;
  }
  return -1;
}

// The centred button under the title / game-over text.
export function buttonRect(label, y) {
  const w = 340;
  return { x: (VIEW_W - w) / 2, y, w, h: 64 };
}
