// Everything the player sees: the dark garden backdrop, the wisp, the void creatures, the HUD
// and the title / pause / level-up / game-over screens. All art is drawn with canvas paths and
// pre-rendered glow sprites — no image files.
import { VIEW_W, VIEW_H, xpNeedFor } from './config.js';
import { cardRects, buttonRect } from './ui.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_OVER = 'over';

// A soft radial glow, rendered once per colour and stamped with drawImage (far cheaper than
// shadowBlur on dozens of moving sprites).
function makeGlowSprite(color) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color + 'cc');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function hexWithAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const glowCache = new Map();
  function glow(color) {
    if (!glowCache.has(color)) glowCache.set(color, makeGlowSprite(color));
    return glowCache.get(color);
  }

  // Fixed starfield and nebula blobs for the backdrop.
  const stars = [];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 110; i += 1) {
    stars.push({ x: rand() * VIEW_W, y: rand() * VIEW_H, r: 0.6 + rand() * 1.6, tw: rand() * Math.PI * 2 });
  }
  const nebulae = [
    { x: 220, y: 140, r: 260, color: '#3b1d6e' },
    { x: 1050, y: 560, r: 300, color: '#0d3b4d' },
    { x: 900, y: 120, r: 200, color: '#4d1d3b' },
    { x: 300, y: 620, r: 220, color: '#1d2b4d' },
  ];

  let lastW = 0;
  let lastH = 0;
  function fitCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (w !== lastW || h !== lastH) {
      lastW = w;
      lastH = h;
      canvas.width = w;
      canvas.height = h;
    }
  }

  function drawBackground(time) {
    const bg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    bg.addColorStop(0, '#0b0618');
    bg.addColorStop(0.55, '#120a2a');
    bg.addColorStop(1, '#070312');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (const n of nebulae) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(glow(n.color), n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    ctx.globalAlpha = 1;
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 1.5 + s.tw);
      ctx.fillStyle = '#cfe8ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Faint garden grid, so motion reads at a glance.
    ctx.strokeStyle = 'rgba(140,110,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= VIEW_W; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, VIEW_H); }
    for (let y = 0; y <= VIEW_H; y += 80) { ctx.moveTo(0, y); ctx.lineTo(VIEW_W, y); }
    ctx.stroke();
  }

  function drawGlow(x, y, radius, color, alpha = 0.8) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(glow(color), x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  function drawShard(s) {
    const bob = Math.sin(s.bob) * 2;
    drawGlow(s.x, s.y + bob, 16, '#2ee6a8', 0.7);
    ctx.fillStyle = '#7ef0c1';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 7 + bob);
    ctx.lineTo(s.x + 5, s.y + bob);
    ctx.lineTo(s.x, s.y + 7 + bob);
    ctx.lineTo(s.x - 5, s.y + bob);
    ctx.closePath();
    ctx.fill();
  }

  function drawEnemy(e, time) {
    drawGlow(e.x, e.y, e.radius * 2.6, e.glow, e.elite ? 0.95 : 0.6);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
    ctx.strokeStyle = hexWithAlpha(e.color, 0.9);
    ctx.lineWidth = 2;
    if (e.kind === 'mote') {
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#1a0b2e';
      ctx.fill();
    } else if (e.kind === 'spore') {
      ctx.rotate(Math.atan2(Math.sin(time * 3 + e.wobble), Math.cos(time * 3 + e.wobble)));
      ctx.beginPath();
      ctx.moveTo(e.radius + 4, 0);
      ctx.lineTo(-e.radius, e.radius * 0.8);
      ctx.lineTo(-e.radius * 0.5, 0);
      ctx.lineTo(-e.radius, -e.radius * 0.8);
      ctx.closePath();
      ctx.fill();
    } else if (e.kind === 'gloom') {
      ctx.rotate(Math.PI / 4 + Math.sin(time * 2 + e.wobble) * 0.2);
      ctx.fillRect(-e.radius * 0.75, -e.radius * 0.75, e.radius * 1.5, e.radius * 1.5);
      ctx.fillStyle = '#1a0b2e';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'thorn') {
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + time * 0.6;
        const px = Math.cos(a) * e.radius;
        const py = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#1a0b2e';
      ctx.fill();
    } else if (e.kind === 'boss') {
      // Rotating thorn crown around a heavy core.
      ctx.rotate(time * 0.5);
      ctx.beginPath();
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const r = i % 2 === 0 ? e.radius + 14 : e.radius - 6;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.rotate(-time * 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = '#3a2405';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff3c4';
      ctx.fill();
    }
    ctx.restore();
    if (e.elite && e.kind !== 'boss') {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Health bar for hurt or big enemies.
    if (e.hp < e.maxHp && (e.maxHp > 60 || e.kind === 'boss')) {
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w, 5);
      ctx.fillStyle = e.kind === 'boss' ? '#ffd166' : '#ff6b8a';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w * Math.max(0, e.hp / e.maxHp), 5);
    }
  }

  function drawPlayer(p, time) {
    for (const t of p.trail) {
      if (t.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, t.life) * 0.9;
      ctx.drawImage(glow('#b78cff'), t.x - 16, t.y - 16, 32, 32);
    }
    ctx.globalAlpha = 1;
    const pulse = 1 + Math.sin(time * 5) * 0.08;
    drawGlow(p.x, p.y, 62 * pulse, '#8b5cf6', 0.95);
    // Blink while invulnerable after a hit.
    if (p.invuln > 0 && Math.floor(time * 16) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#efe6ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b78cff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Aim tick toward the mouse.
    ctx.strokeStyle = 'rgba(239,230,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius + 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawHud(state, screen) {
    const p = state.player;
    // XP bar across the top.
    const need = xpNeedFor(p.level);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, VIEW_W, 10);
    ctx.fillStyle = '#2ee6a8';
    ctx.fillRect(0, 0, VIEW_W * Math.min(1, p.xp / need), 10);
    // HP bar, top left.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(20, 24, 240, 22, 6);
    ctx.fill();
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = hpFrac > 0.35 ? '#ff5d73' : '#ff2e4d';
    if (hpFrac > 0) {
      roundRect(20, 24, 240 * hpFrac, 22, 6);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`HP ${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`, 28, 35);
    ctx.fillText(`LV ${p.level}`, 272, 35);
    // Wave, top centre.
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`WAVE ${state.wave}`, VIEW_W / 2, 36);
    // Score and timer, top right.
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE ${state.score.toLocaleString('en-US')}`, VIEW_W - 20, 30);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#cfe8ff';
    const mins = Math.floor(state.time / 60);
    const secs = Math.floor(state.time % 60);
    ctx.fillText(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, VIEW_W - 20, 54);
    // Combo under the wave label.
    if (state.combo > 1) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`COMBO x${state.combo}  (+${Math.round(Math.min(state.combo, 20) * 5)}%)`, VIEW_W / 2, 62);
    }
    // Boss health bar.
    const boss = state.enemies.find((e) => e.kind === 'boss');
    if (boss) {
      const w = 460;
      const x = (VIEW_W - w) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(x, 78, w, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      roundRect(x, 78, w * Math.max(0, boss.hp / boss.maxHp), 14, 7);
      ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('THE VOIDMOTHER', VIEW_W / 2, 102);
    }
    // Wave banner.
    if (state.bannerTimer > 0 && screen === SCREEN_PLAY) {
      ctx.globalAlpha = Math.min(1, state.bannerTimer);
      ctx.fillStyle = '#efe6ff';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.banner, VIEW_W / 2, 170);
      ctx.globalAlpha = 1;
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function centreText(text, y, font, color) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, VIEW_W / 2, y);
  }

  function drawTitle(state, best) {
    drawGlow(VIEW_W / 2, 250, 260, '#5b21b6', 0.55);
    centreText('VOIDBLOOM', 218, 'bold 92px system-ui, sans-serif', '#efe6ff');
    centreText('a wisp\u2019s last stand in the dark garden', 278, 'italic 22px system-ui, sans-serif', '#b7a6e0');
    centreText('WASD / arrows to drift  ·  mouse to aim  ·  hold click or SPACE to fire', 350, '18px system-ui, sans-serif', '#d8ccf5');
    centreText('Gather bloom-shards, level up, pick a bloom. Survive the waves.', 380, '18px system-ui, sans-serif', '#d8ccf5');
    centreText('P pause  ·  M mute  ·  every 5th wave wakes the Voidmother', 410, '18px system-ui, sans-serif', '#d8ccf5');
    const btn = buttonRect('start', 470);
    ctx.fillStyle = '#7c3aed';
    roundRect(btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fill();
    ctx.strokeStyle = '#c4b5fd';
    ctx.lineWidth = 2;
    roundRect(btn.x, btn.y, btn.w, btn.h, 12);
    ctx.stroke();
    centreText('▶  BLOOM', 502, 'bold 26px system-ui, sans-serif', '#ffffff');
    if (best > 0) centreText(`Best score: ${best.toLocaleString('en-US')}`, 570, '18px system-ui, sans-serif', '#ffd166');
  }

  function drawLevelUp(state, hoverCard) {
    ctx.fillStyle = 'rgba(5,2,16,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    centreText('LEVEL UP — CHOOSE A BLOOM', 190, 'bold 40px system-ui, sans-serif', '#7ef0c1');
    centreText('Click a card, or press 1 / 2 / 3', 232, '17px system-ui, sans-serif', '#cfe8ff');
    const rects = cardRects();
    state.levelChoices.forEach((choice, i) => {
      const r = rects[i];
      const hovered = hoverCard === i;
      ctx.fillStyle = hovered ? '#2a1a52' : '#1a1032';
      roundRect(r.x, r.y, r.w, r.h, 14);
      ctx.fill();
      ctx.strokeStyle = hovered ? '#7ef0c1' : '#5b4a8a';
      ctx.lineWidth = hovered ? 3 : 2;
      roundRect(r.x, r.y, r.w, r.h, 14);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(`[ ${i + 1} ]`, r.x + r.w / 2, r.y + 30);
      ctx.fillStyle = '#efe6ff';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(choice.name, r.x + r.w / 2, r.y + 66);
      ctx.fillStyle = '#cfe8ff';
      ctx.font = '17px system-ui, sans-serif';
      ctx.fillText(choice.desc, r.x + r.w / 2, r.y + 100);
      const taken = state.takenUpgrades[choice.id] ?? 0;
      ctx.fillStyle = '#8b7fb8';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(taken > 0 ? `Owned x${taken}  ·  max ${choice.max}` : `max ${choice.max}`, r.x + r.w / 2, r.y + 132);
    });
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(5,2,16,0.66)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    centreText('PAUSED', 330, 'bold 64px system-ui, sans-serif', '#efe6ff');
    centreText('Press P or click to keep blooming', 400, '19px system-ui, sans-serif', '#cfe8ff');
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(5,2,16,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    centreText('THE GARDEN FADES', 220, 'bold 64px system-ui, sans-serif', '#ff8fa3');
    centreText(`Score  ${state.score.toLocaleString('en-US')}    ·    Best  ${best.toLocaleString('en-US')}`, 300, '26px system-ui, sans-serif', '#efe6ff');
    centreText(`Reached wave ${state.wave}  ·  ${state.kills} creatures dissolved  ·  ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`, 344, '19px system-ui, sans-serif', '#cfe8ff');
    const btn = buttonRect('again', 420);
    ctx.fillStyle = '#7c3aed';
    roundRect(btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fill();
    ctx.strokeStyle = '#c4b5fd';
    ctx.lineWidth = 2;
    roundRect(btn.x, btn.y, btn.w, btn.h, 12);
    ctx.stroke();
    centreText('↻  BLOOM AGAIN', 452, 'bold 24px system-ui, sans-serif', '#ffffff');
    centreText('Press R or click the button', 512, '17px system-ui, sans-serif', '#cfe8ff');
  }

  return {
    fitCanvas,
    draw(state, screen, best, extra = {}) {
      fitCanvas();
      const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
      ctx.setTransform(scale, 0, 0, scale, (canvas.width - VIEW_W * scale) / 2, (canvas.height - VIEW_H * scale) / 2);
      const time = state.time;
      ctx.save();
      if (state.shake > 0.5) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
      }
      drawBackground(time);
      for (const s of state.shards) drawShard(s);
      for (const e of state.enemies) drawEnemy(e, time);
      for (const o of state.enemyOrbs) {
        drawGlow(o.x, o.y, 22, '#ff5d73', 0.8);
        ctx.fillStyle = '#ff8fa3';
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const b of state.bullets) {
        drawGlow(b.x, b.y, 14, '#ffe9a8', 0.85);
        ctx.fillStyle = '#fff3c4';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const pt of state.particles) {
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (screen !== SCREEN_TITLE) drawPlayer(state.player, time);
      for (const f of state.floats) {
        ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
        ctx.fillStyle = f.color;
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      if (screen !== SCREEN_TITLE) drawHud(state, screen);
      // Aim reticle while playing.
      if (screen === SCREEN_PLAY && extra.aimX !== undefined) {
        ctx.strokeStyle = 'rgba(239,230,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(extra.aimX, extra.aimY, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(extra.aimX - 16, extra.aimY);
        ctx.lineTo(extra.aimX - 6, extra.aimY);
        ctx.moveTo(extra.aimX + 6, extra.aimY);
        ctx.lineTo(extra.aimX + 16, extra.aimY);
        ctx.moveTo(extra.aimX, extra.aimY - 16);
        ctx.lineTo(extra.aimX, extra.aimY - 6);
        ctx.moveTo(extra.aimX, extra.aimY + 6);
        ctx.lineTo(extra.aimX, extra.aimY + 16);
        ctx.stroke();
      }
      // Damage flash.
      if (state.flash > 0) {
        ctx.fillStyle = `rgba(255,45,77,${state.flash * 0.28})`;
        ctx.fillRect(-20, -20, VIEW_W + 40, VIEW_H + 40);
      }
      ctx.restore();
      if (screen === SCREEN_TITLE) drawTitle(state, best);
      else if (screen === SCREEN_LEVELUP) drawLevelUp(state, extra.hoverCard ?? -1);
      else if (screen === SCREEN_PAUSED) drawPaused();
      else if (screen === SCREEN_OVER) drawOver(state, best);
    },
  };
}
