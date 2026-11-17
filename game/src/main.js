// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, level-up, paused and game over.
//
// ?seed=N fixes the random pattern. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_LEVELUP, EVENT_OVER } from './world.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_MUTE,
  ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_LEVELUP, SCREEN_TITLE } from './render.js';
import { pickCardAt, buttonRect, rollChoices } from './ui.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  // Read-only handle for playtests: wave, score, hp and the screen the shot staged.
  window.__voidbloom = { get state() { return world.state; }, get screen() { return scene.screen; }, trace: scene.trace };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, {
      aimX: world.state.player.x + 120,
      aimY: world.state.player.y - 60,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let hoverCard = -1;
  // Read-only handle for playtests: the live state and the current screen.
  window.__voidbloom = { get state() { return world.state; }, get screen() { return screen; } };

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function playSounds() {
    for (const name of world.state.sounds) {
      if (typeof audio[name] === 'function') audio[name]();
    }
    world.state.sounds.length = 0;
  }

  function startGame() {
    world.reset();
    world.state.banner = 'WAVE 1';
    world.state.bannerTimer = 2.2;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Survive the waves.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function applyChoice(index) {
    const state = world.state;
    const choice = state.levelChoices && state.levelChoices[index];
    if (!choice) return;
    choice.apply(state.player);
    state.takenUpgrades[choice.id] = (state.takenUpgrades[choice.id] ?? 0) + 1;
    state.pendingLevels -= 1;
    audio.click();
    if (state.pendingLevels > 0) {
      // Roll the next offer at once so the card row never flashes empty.
      state.levelChoices = rollChoices(world.random, state.takenUpgrades);
    } else {
      state.levelChoices = null;
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_PICK_1 && screen === SCREEN_LEVELUP) applyChoice(0);
    else if (actions & ACTION_PICK_2 && screen === SCREEN_LEVELUP) applyChoice(1);
    else if (actions & ACTION_PICK_3 && screen === SCREEN_LEVELUP) applyChoice(2);
    else if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_OVER) startGame();
    else if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (input.clicked) {
      input.clearClick();
      audio.unlock();
      if (screen === SCREEN_TITLE) {
        const btn = buttonRect('start', 470);
        if (input.aimX >= btn.x && input.aimX <= btn.x + btn.w && input.aimY >= btn.y && input.aimY <= btn.y + btn.h) startGame();
        else startGame(); // Any click on the title blooms.
      } else if (screen === SCREEN_OVER) {
        startGame();
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_LEVELUP) {
        const picked = pickCardAt(input.aimX, input.aimY);
        if (picked >= 0) applyChoice(picked);
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { dx: 0, dy: 0, aimX: 0, aimY: 0, firing: false }, true);
      return;
    }
    const events = world.step(STEP, {
      dx: input.direction().x,
      dy: input.direction().y,
      aimX: input.aimX,
      aimY: input.aimY,
      firing: input.firing,
    }, false);
    playSounds();
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_LEVELUP) {
      screen = SCREEN_LEVELUP;
      announce('Level up. Choose a bloom.');
    } else if (events & EVENT_HIT) {
      announce(`Hit. ${Math.max(0, Math.ceil(world.state.player.hp))} HP left.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    hoverCard = screen === SCREEN_LEVELUP ? pickCardAt(input.aimX, input.aimY) : -1;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
        if (screen === SCREEN_LEVELUP) break;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, {
      aimX: input.aimX,
      aimY: input.aimY,
      hoverCard,
    });
  }

  // Leaving the tab pauses a running game rather than letting creatures close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  window.addEventListener('mousedown', () => audio.unlock(), { once: true });

  announce('Voidbloom. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
