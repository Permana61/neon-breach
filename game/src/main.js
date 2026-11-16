// NEON BREACH — bootstrap, input, the main loop, menu overlays and the
// deterministic screenshot driver (?shot=start|buy|play|end&seed=N).
import { Game } from './game.js';
import { HUD } from './hud.js';
import { makeRng } from './config.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
const hud = new HUD();
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = parseInt(params.get('seed') || '1', 10);

const input = {
  keys: {},
  lookDX: 0,
  firing: false,
  mouseR: false,
};

const overlays = {
  start: document.getElementById('startMenu'),
  buy: document.getElementById('buyMenu'),
  pause: document.getElementById('pauseMenu'),
  end: document.getElementById('endMenu'),
};

function showOnly(name) {
  for (const [k, el] of Object.entries(overlays)) {
    el.style.display = k === name ? 'flex' : 'none';
  }
}

let paused = false;
let started = false;

function startGame() {
  game.audio.init();
  game.audio.resume();
  started = true;
  game.startMatch();
  showOnly(null);
  hud.buildBuyMenu(game);
  lockPointer();
}

function lockPointer() {
  try {
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  } catch (e) { /* headless or denied: arrow keys still turn */ }
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('buyCloseBtn').addEventListener('click', () => {
  if (game.phase === 'buy') game.startLive();
  showOnly(null);
});
document.getElementById('resumeBtn').addEventListener('click', () => {
  paused = false;
  showOnly(null);
  lockPointer();
});
document.getElementById('restartBtn').addEventListener('click', () => {
  game.startMatch();
  showOnly(null);
  hud.buildBuyMenu(game);
  lockPointer();
});

document.addEventListener('keydown', (e) => {
  input.keys[e.code] = true;
  if (e.code === 'KeyB' && started && !paused) {
    if (game.phase === 'buy') {
      const buy = overlays.buy;
      const open = buy.style.display === 'flex';
      buy.style.display = open ? 'none' : 'flex';
      if (!open) hud.buildBuyMenu(game);
    }
  }
  if (e.code === 'KeyR' && started) {
    const ws = game.player.weapon;
    if (!ws.reloading && ws.ammo < ws.def.mag && ws.reserve > 0) {
      ws.reloading = true;
      ws.reloadEnd = game.now + ws.def.reload / 1000;
      game.audio.reload();
    }
  }
  if (e.code === 'KeyG' && started && game.phase === 'live') game.throwGrenade();
  if (e.code === 'KeyP' && started) {
    paused = !paused;
    showOnly(paused ? 'pause' : null);
  }
  if (e.code === 'Digit1') game.player.buy('pistol');
  if (e.code === 'Digit2') game.player.buy('smg');
  if (e.code === 'Digit3') game.player.buy('rifle');
  if (e.code === 'Digit4') game.player.buy('shotgun');
  if (e.code === 'Digit5') game.player.buy('sniper');
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', (e) => { input.keys[e.code] = false; });

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) input.lookDX += e.movementX || 0;
});

canvas.addEventListener('mousedown', (e) => {
  game.audio.init();
  game.audio.resume();
  if (!started) return;
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  if (e.button === 0) input.firing = true;
  if (e.button === 2) input.mouseR = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.firing = false;
  if (e.button === 2) input.mouseR = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && started && game.phase === 'live' && !shot) {
    paused = true;
    showOnly('pause');
  }
});

game.onPhaseChange = (phase) => {
  if (phase === 'buy') {
    hud.buildBuyMenu(game);
    if (!shot) showOnly('buy');
  } else if (phase === 'gameOver') {
    const w = game.score.VANGUARD > game.score.CINDER ? 'VANGUARD' : 'CINDER';
    const winner = game.score[w];
    const loser = game.score[w === 'VANGUARD' ? 'CINDER' : 'VANGUARD'];
    document.getElementById('endTitle').textContent = w === game.player.team ? 'SECTOR SECURED' : 'SECTOR LOST';
    document.getElementById('endSub').textContent = `${w} WINS ${winner} — ${loser}`;
    const p = game.player;
    let topBot = null;
    for (const b of game.bots) if (!topBot || b.kills > topBot.kills) topBot = b;
    const mvp = p.kills >= (topBot ? topBot.kills : 0) ? p : topBot;
    document.getElementById('endStats').innerHTML =
      `Your kills: <b>${p.kills}</b> &nbsp;•&nbsp; Deaths: <b>${p.deaths}</b> &nbsp;•&nbsp; Money banked: <b>$${p.money}</b><br>` +
      `MVP: <b>${mvp.name}</b> with <b>${mvp.kills}</b> kills &nbsp;•&nbsp; Final score <b>${game.score.VANGUARD} — ${game.score.CINDER}</b>`;
    showOnly('end');
  }
};

// ---- main loop ----
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused && started) {
    game.update(dt, input);
    hud.update(game);
  }
  if (started) game.render();
  requestAnimationFrame(frame);
}

// ---- deterministic screenshot driver ----
async function driveShot() {
  game.rng = makeRng(seed * 7919 + 13);
  game.audio.enabled = false;
  started = true;
  if (shot === 'start') {
    // title screen over a slow view of the arena: place the player mid-map
    game.player.x = 11.5; game.player.y = 18.5; game.player.angle = -Math.PI / 2;
    game.phase = 'menu';
    hud.update(game);
    game.render();
    showOnly('start');
    window.__shotReady = true;
    return;
  }
  game.startMatch();
  if (shot === 'buy') {
    game.player.money = 4200;
    hud.buildBuyMenu(game);
    hud.update(game);
    showOnly('buy');
    game.render();
    window.__shotReady = true;
    return;
  }
  // play / end: run live gameplay with a fixed seed for a few seconds
  game.player.money = 4200;
  game.player.buy('rifle');
  game.player.armor = 100; // survive the staged firefight so the shot shows live combat
  game.startLive();
  const fakeInput = { keys: {}, lookDX: 0, firing: true, mouseR: false };
  const steps = shot === 'end' ? 60 : 100;
  for (let i = 0; i < steps; i++) {
    // walk forward and sweep the view so bots come into frame
    fakeInput.keys['KeyW'] = i < 40;
    fakeInput.lookDX = 0;
    game.player.angle = -Math.PI / 2 + Math.sin(i * 0.05) * 0.5;
    game.update(1 / 30, fakeInput);
    game.render();
    await new Promise((r) => setTimeout(r, 0));
  }
  if (shot === 'end') {
    // force a decisive round end: detonate the spike for the attacker win
    game.spike = { state: 'planted', x: 4, y: 4, fuse: 0.01, carrier: null };
    game.update(0.05, { keys: {}, lookDX: 0, firing: false, mouseR: false });
    game.render();
    // show the game-over screen with stats
    game.score = { VANGUARD: 7, CINDER: 4 };
    game.player.kills = 9;
    game.player.deaths = 3;
    game.phase = 'gameOver';
    game.onPhaseChange('gameOver');
    hud.update(game);
    game.render();
  } else {
    // aim at the nearest living enemy so the shot shows a bot in frame
    let best = null, bestD = Infinity;
    for (const b of game.bots) {
      if (!b.alive || b.team === game.player.team) continue;
      const d = (b.x - game.player.x) ** 2 + (b.y - game.player.y) ** 2;
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) game.player.angle = Math.atan2(best.y - game.player.y, best.x - game.player.x);
    hud.update(game);
    game.render();
  }
  window.__shotReady = true;
}

// Debug / test handle: the harness plays the game through this.
window.__nb = {
  game, hud, input,
  start: startGame,
  state: () => ({
    phase: game.phase,
    round: game.round,
    score: game.score,
    player: { x: game.player.x, y: game.player.y, hp: game.player.hp, alive: game.player.alive, ammo: game.player.weapon.ammo, money: game.player.money },
    botsAlive: game.bots.filter((b) => b.alive).length,
    spike: game.spike.state,
    timer: game.roundTimer,
  }),
};

if (shot) {
  showOnly(null);
  driveShot();
} else {
  showOnly('start');
  requestAnimationFrame(frame);
}
