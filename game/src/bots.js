// NEON BREACH — bot AI. Nine bots (4 teammates + 5 enemies) play the same
// round as the player: they buy weapons, patrol lanes, chase on line of sight,
// strafe while firing, plant and defuse the spike, and rotate when it is planted.
import { MAP, MAP_W, MAP_H, SITE_A, SITE_B, WEAPONS, findPath, clamp, angleDiff, makeRng } from './config.js';
import { makeWeaponState, fireHitscan, applyDamage } from './weapons.js';

const BOT_NAMES = {
  VANGUARD: ['VOLT', 'PIXEL', 'NOVA', 'GHOST'],
  CINDER: ['EMBER', 'ASH', 'SMOKE', 'FLARE', 'CINDER-5'],
};

const LANES = [
  { x: 3, y: 12 }, { x: 11, y: 12 }, { x: 20, y: 12 },
  { x: 3, y: 17 }, { x: 11, y: 17 }, { x: 20, y: 17 },
  { x: 6, y: 5 }, { x: 17, y: 5 }, { x: 11, y: 5 },
];

export function makeBot(team, idx, rng) {
  const name = BOT_NAMES[team][idx] || (team + '-' + idx);
  return {
    kind: 'bot',
    name,
    team,
    x: 0, y: 0, angle: 0,
    hp: 100, armor: 0, alive: true,
    weapon: makeWeaponState('pistol'),
    money: 800,
    speed: 3.4 + rng() * 0.7,
    state: 'idle',
    path: [],
    pathIdx: 0,
    target: null,
    reactAt: 0,
    burstLeft: 0,
    nextShotAt: 0,
    strafeDir: 1,
    strafeAt: 0,
    plantProgress: 0,
    defuseProgress: 0,
    isCarrier: false,
    site: null,
    hold: null,
    hearAt: 0,
    investigate: null,
    kills: 0,
    deaths: 0,
    spreadKick: 0,
    ads: false,
    moving: false,
    stepAt: 0,
    skill: 0.55 + rng() * 0.3,
  };
}

export function spawnBots(game) {
  const rng = game.rng;
  const bots = [];
  const atkTeam = game.attackers;
  const defTeam = game.defenders;
  for (let i = 0; i < 4; i++) {
    const b = makeBot(atkTeam, i, rng);
    bots.push(b);
  }
  for (let i = 0; i < 5; i++) {
    const b = makeBot(defTeam, i, rng);
    bots.push(b);
  }
  return bots;
}

export function placeBots(game) {
  const atk = game.bots.filter((b) => b.team === game.attackers);
  const def = game.bots.filter((b) => b.team === game.defenders);
  const atkBase = { x: 11.5, y: 21.5 };
  const defBase = { x: 11.5, y: 2.5 };
  atk.forEach((b, i) => {
    b.x = atkBase.x + (i - 1.5) * 0.9;
    b.y = atkBase.y + (i % 2) * 0.8;
    b.angle = -Math.PI / 2;
    b.hp = 100; b.armor = 0; b.alive = true;
    b.state = 'idle'; b.path = []; b.pathIdx = 0;
    b.plantProgress = 0; b.defuseProgress = 0;
    b.isCarrier = i === 0;
    b.site = rngPick(game, [SITE_A, SITE_B]);
  });
  def.forEach((b, i) => {
    b.x = defBase.x + (i - 2) * 0.9;
    b.y = defBase.y + (i % 2) * 0.8;
    b.angle = Math.PI / 2;
    b.hp = 100; b.armor = 0; b.alive = true;
    b.state = 'idle'; b.path = []; b.pathIdx = 0;
    b.plantProgress = 0; b.defuseProgress = 0;
    b.isCarrier = false;
    b.site = i < 2 ? SITE_A : SITE_B;
    b.hold = pickHold(game, b.site, i);
  });
}

function rngPick(game, arr) {
  return arr[Math.floor(game.rng() * arr.length)];
}

function pickHold(game, site, i) {
  const cx = (site.x0 + site.x1) / 2;
  const cy = (site.y0 + site.y1) / 2;
  const spots = [
    { x: cx, y: cy + 2 },
    { x: site.x0 + 1, y: site.y1 - 1 },
    { x: site.x1 - 1, y: site.y1 - 1 },
    { x: 11.5, y: 10.5 },
    { x: 11.5, y: 15.5 },
  ];
  return spots[i % spots.length];
}

export function botBuy(game, bot) {
  // Spend the round's money on the best affordable weapon.
  const order = ['sniper', 'rifle', 'shotgun', 'smg'];
  for (const id of order) {
    if (bot.money >= WEAPONS[id].price) {
      bot.money -= WEAPONS[id].price;
      bot.weapon = makeWeaponState(id);
      return;
    }
  }
  bot.weapon = makeWeaponState('pistol');
}

export function botHearShot(game, x, y, team) {
  for (const b of game.bots) {
    if (!b.alive || b.team === team) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < 12) {
      b.investigate = { x, y };
      b.hearAt = game.now;
    }
  }
}

function cellBlocked(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return true;
  return MAP[cy][cx] !== '.';
}

function moveAlongPath(bot, dt, game) {
  if (bot.pathIdx >= bot.path.length) return true;
  const node = bot.path[bot.pathIdx];
  const dx = node.x - bot.x, dy = node.y - bot.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.15) { bot.pathIdx++; return bot.pathIdx >= bot.path.length; }
  const sp = bot.speed * dt;
  const nx = bot.x + (dx / d) * sp;
  const ny = bot.y + (dy / d) * sp;
  // slide on the axes separately so corners do not stick
  if (!cellBlocked(nx, bot.y)) bot.x = nx;
  if (!cellBlocked(bot.x, ny)) bot.y = ny;
  bot.moving = true;
  bot.angle = Math.atan2(dy, dx);
  return false;
}

function nearestEnemy(game, bot) {
  const foes = [];
  if (game.player.alive && game.player.team !== bot.team) foes.push(game.player);
  for (const b of game.bots) if (b.alive && b.team !== bot.team) foes.push(b);
  let best = null, bestD = Infinity;
  for (const f of foes) {
    const d = Math.hypot(f.x - bot.x, f.y - bot.y);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best ? { foe: best, dist: bestD } : null;
}

export function updateBot(game, bot, dt) {
  if (!bot.alive) return;
  const now = game.now;
  bot.moving = false;

  // --- combat scan: nearest visible enemy ---
  const scan = nearestEnemy(game, bot);
  let visible = null;
  if (scan && scan.dist < 26) {
    if (game.renderer.hasLOS(bot.x, bot.y, scan.foe.x, scan.foe.y)) visible = scan;
  }

  // --- planting / defusing takes priority ---
  if (bot.state === 'planting') {
    bot.plantProgress += dt;
    if (bot.plantProgress >= 3) {
      game.plantSpike(bot);
      bot.state = 'idle';
      bot.plantProgress = 0;
    }
    return;
  }
  if (bot.state === 'defusing') {
    bot.defuseProgress += dt;
    if (bot.defuseProgress >= 4) {
      game.defuseSpike(bot);
      bot.state = 'idle';
      bot.defuseProgress = 0;
    }
    return;
  }

  // --- if the spike is planted, defenders rush it, attackers guard it ---
  if (game.spike.state === 'planted' && bot.team === game.defenders && bot.state !== 'defusing') {
    const d = Math.hypot(game.spike.x - bot.x, game.spike.y - bot.y);
    if (d < 1.4) {
      bot.state = 'defusing';
      bot.defuseProgress = 0;
      game.audio.defuseBeep();
      return;
    }
    if (!bot.path.length || bot.pathIdx >= bot.path.length) {
      bot.path = findPath(Math.floor(bot.x), Math.floor(bot.y), Math.floor(game.spike.x), Math.floor(game.spike.y));
      bot.pathIdx = 0;
    }
    moveAlongPath(bot, dt, game);
  }

  // --- visible enemy: fight ---
  if (visible) {
    const foe = visible.foe;
    const dist = visible.dist;
    // face the enemy
    const want = Math.atan2(foe.y - bot.y, foe.x - bot.x);
    bot.angle += clamp(angleDiff(bot.angle, want), -6 * dt, 6 * dt);
    // strafe while fighting
    if (now > bot.strafeAt) { bot.strafeDir *= -1; bot.strafeAt = now + 0.5 + game.rng() * 0.7; }
    const strafe = bot.strafeDir * bot.speed * 0.45 * dt;
    const sx = Math.cos(bot.angle + Math.PI / 2) * strafe;
    const sy = Math.sin(bot.angle + Math.PI / 2) * strafe;
    if (!cellBlocked(bot.x + sx, bot.y)) bot.x += sx;
    if (!cellBlocked(bot.x, bot.y + sy)) bot.y += sy;
    bot.moving = true;
    // reaction time, then burst fire
    if (bot.reactAt === 0) bot.reactAt = now + (0.45 - bot.skill * 0.25) + game.rng() * 0.2;
    if (now >= bot.reactAt && now >= bot.nextShotAt) {
      if (bot.burstLeft <= 0) bot.burstLeft = 2 + Math.floor(game.rng() * 3);
      const ws = bot.weapon;
      if (ws.ammo <= 0) {
        if (!ws.reloading) { ws.reloading = true; ws.reloadEnd = now + ws.def.reload / 1000; }
        if (now >= ws.reloadEnd) {
          ws.reloading = false;
          ws.ammo = ws.def.mag;
          if (ws.reserve !== Infinity) ws.reserve = Math.max(0, ws.reserve - ws.def.mag);
        }
      } else {
        const res = fireHitscan(bot, ws, now, game.allActors(), (a) => game.renderer.cast(bot.x, bot.y, a).dist, game.rng);
        if (res && res.hit) {
          const killed = applyDamage(res.target, res.damage, game);
          game.onBotHit(bot, res.target, res.damage, res.headshot, killed);
        } else if (res) {
          // tracer into the wall
          const d = res.dist;
          const ex = bot.x + Math.cos(bot.angle) * d;
          const ey = bot.y + Math.sin(bot.angle) * d;
          const s1 = game.renderer.projectToScreen(game, bot.x, bot.y);
          const s2 = game.renderer.projectToScreen(game, ex, ey);
          if (!s1.behind && !s2.behind) game.renderer.addTracer(s1.x, s1.y, s2.x, s2.y, '#ffb37d');
        }
        game.audio.shoot(ws.id);
        bot.burstLeft--;
        bot.nextShotAt = now + ws.def.rate / 1000 + (bot.burstLeft <= 0 ? 0.35 + game.rng() * 0.4 : 0);
        bot.spreadKick = Math.min(0.05, bot.spreadKick + 0.012);
      }
    }
    bot.spreadKick = Math.max(0, bot.spreadKick - dt * 0.05);
    return;
  }
  bot.reactAt = 0;

  // --- no enemy: move toward the objective ---
  if (bot.team === game.attackers) {
    if (bot.isCarrier && game.spike.state === 'carried') {
      const site = bot.site;
      const inSite = bot.x >= site.x0 && bot.x <= site.x1 && bot.y >= site.y0 && bot.y <= site.y1;
      if (inSite) {
        bot.state = 'planting';
        bot.plantProgress = 0;
        game.audio.plantBeep();
        return;
      }
      if (!bot.path.length || bot.pathIdx >= bot.path.length) {
        const tx = Math.floor((site.x0 + site.x1) / 2);
        const ty = Math.floor((site.y0 + site.y1) / 2);
        bot.path = findPath(Math.floor(bot.x), Math.floor(bot.y), tx, ty);
        bot.pathIdx = 0;
      }
      moveAlongPath(bot, dt, game);
    } else {
      // escort: head to a lane waypoint near the carrier's site
      if (!bot.path.length || bot.pathIdx >= bot.path.length) {
        const lane = LANES[Math.floor(game.rng() * LANES.length)];
        bot.path = findPath(Math.floor(bot.x), Math.floor(bot.y), Math.floor(lane.x), Math.floor(lane.y));
        bot.pathIdx = 0;
      }
      moveAlongPath(bot, dt, game);
    }
  } else {
    // defenders: hold near their site, or investigate a heard shot
    if (bot.investigate && now - bot.hearAt < 6) {
      if (!bot.path.length || bot.pathIdx >= bot.path.length) {
        bot.path = findPath(Math.floor(bot.x), Math.floor(bot.y), Math.floor(bot.investigate.x), Math.floor(bot.investigate.y));
        bot.pathIdx = 0;
      }
      if (moveAlongPath(bot, dt, game)) bot.investigate = null;
    } else if (bot.hold) {
      const d = Math.hypot(bot.hold.x - bot.x, bot.hold.y - bot.y);
      if (d > 0.6) {
        if (!bot.path.length || bot.pathIdx >= bot.path.length) {
          bot.path = findPath(Math.floor(bot.x), Math.floor(bot.y), Math.floor(bot.hold.x), Math.floor(bot.hold.y));
          bot.pathIdx = 0;
        }
        moveAlongPath(bot, dt, game);
      } else {
        // idle look around the site
        bot.angle += Math.sin(now * 0.5 + bot.name.length) * dt * 0.6;
      }
    }
  }
}
