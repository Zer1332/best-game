// Keyboard + mouse input, translated into the game's own terms: a move vector, an aim point,
// a firing flag, and one-shot actions (confirm / pause / restart / mute) that the loop consumes.
import { VIEW_W, VIEW_H } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;
export const ACTION_PICK_1 = 16;
export const ACTION_PICK_2 = 32;
export const ACTION_PICK_3 = 64;

const KEY_ACTIONS = {
  Space: ACTION_CONFIRM,
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyR: ACTION_RESTART,
  KeyM: ACTION_MUTE,
  Digit1: ACTION_PICK_1,
  Digit2: ACTION_PICK_2,
  Digit3: ACTION_PICK_3,
  Numpad1: ACTION_PICK_1,
  Numpad2: ACTION_PICK_2,
  Numpad3: ACTION_PICK_3,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = VIEW_W / 2;
  let mouseY = VIEW_H / 2 - 120;
  let mouseDown = false;
  let mouseClicked = false;

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
    const ox = (rect.width - VIEW_W * scale) / 2;
    const oy = (rect.height - VIEW_H * scale) / 2;
    mouseX = (event.clientX - rect.left - ox) / scale;
    mouseY = (event.clientY - rect.top - oy) / scale;
  }

  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (!event.repeat) {
      const action = KEY_ACTIONS[event.code];
      if (action) actions |= action;
    }
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', toLogical);
  canvas.addEventListener('mousedown', (event) => {
    toLogical(event);
    mouseDown = true;
    mouseClicked = true;
  });
  window.addEventListener('mouseup', () => { mouseDown = false; });

  return {
    // Normalized WASD / arrow movement vector.
    direction() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.hypot(x, y);
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    get aimX() { return mouseX; },
    get aimY() { return mouseY; },
    get firing() { return mouseDown || keys.has('Space'); },
    get clicked() { return mouseClicked; },
    clearClick() { mouseClicked = false; },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
