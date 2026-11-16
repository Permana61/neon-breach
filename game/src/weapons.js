// NEON BREACH — weapons and combat. Hitscan shooting with spread, recoil,
// headshots, reload, and a thrown frag grenade. The same module serves the
// player and the bots: shoot() takes a shooter object with pos/angle/weapon.
import { WEAPONS, clamp } from './config.js';

// Ray vs circle test in 2D: returns the distance along the ray to the bot, or -1.
export function rayHitBot(ox, oy, angle, bot) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const cx = bot.x - ox, cy = bot.y - oy;
  const t = cx * dx + cy * dy;
  if (t < 0) return -1;
  const px = ox + dx * t, py = oy + dy * t;
  const d2 = (bot.x - px) ** 2 + (bot.y - py) ** 2;
  const r = 0.34;
  if (d2 > r * r) return -1;
  return t - Math.sqrt(Math.max(0, r * r - d2));
}

export function makeWeaponState(weaponId) {
  const def = WEAPONS[weaponId];
  return {
    id: weaponId,
    def,
    ammo: def.mag,
    reserve: def.reserve,
    lastShot: 0,
    reloading: false,
    reloadEnd: 0,
  };
}

export function canShoot(ws, now) {
  if (ws.reloading) return false;
  // weapon rates are in ms; game time is in seconds
  return now - ws.lastShot >= ws.def.rate / 1000;
}

export function startReload(ws, now) {
  if (ws.reloading) return false;
  if (ws.ammo >= ws.def.mag) return false;
  if (ws.reserve <= 0) return false;
  ws.reloading = true;
  ws.reloadEnd = now + ws.def.reload / 1000;
  return true;
}

export function finishReload(ws) {
  if (!ws.reloading) return;
  ws.reloading = false;
  const need = ws.def.mag - ws.ammo;
  const take = Math.min(need, ws.reserve);
  ws.ammo += take;
  if (ws.reserve !== Infinity) ws.reserve -= take;
}

// Fire one hitscan volley. targets: array of {x,y,hp,alive,team,headR}.
// wallDist: distance to the first wall along the ray (from the renderer).
// Returns {hit, target, headshot, damage, wallDist} or null when out of ammo.
export function fireHitscan(shooter, ws, now, targets, wallDistFn, rng) {
  if (ws.ammo <= 0) return null;
  if (!canShoot(ws, now)) return null;
  ws.ammo -= 1;
  ws.lastShot = now;
  const def = ws.def;
  const pellets = def.pellets || 1;
  let best = null;
  for (let i = 0; i < pellets; i++) {
    const spread = (rng() - 0.5) * 2 * def.spread * (shooter.ads ? 0.45 : 1) + (rng() - 0.5) * def.spread * 0.4;
    const angle = shooter.angle + spread + (shooter.spreadKick || 0) * (rng() - 0.5);
    const wallD = wallDistFn(angle);
    for (const t of targets) {
      if (!t.alive || t === shooter) continue;
      const d = rayHitBot(shooter.x, shooter.y, angle, t);
      if (d < 0 || d > wallD || d > def.range) continue;
      // headshot: the ray passes above the torso line — approximate with a
      // vertical band: a hit counts as a headshot when the shooter aims slightly
      // high. We model it as a flat chance per hit, weighted by distance.
      const headChance = 0.14;
      const head = rng() < headChance;
      const falloff = Math.max(0.55, 1 - (d / def.range) * 0.35);
      const dmg = def.dmg * falloff * (head ? def.hs : 1);
      if (!best || d < best.dist) best = { hit: true, target: t, headshot: head, damage: dmg, dist: d, angle };
    }
  }
  if (best) return best;
  return { hit: false, dist: wallDistFn(shooter.angle) };
}

// A frag grenade: simple ballistic arc on the map plane with a height value.
export class Grenade {
  constructor(x, y, angle, team) {
    this.x = x; this.y = y;
    this.z = 0.5;
    this.vx = Math.cos(angle) * 9;
    this.vy = Math.sin(angle) * 9;
    this.vz = 3.2;
    this.team = team;
    this.fuse = 1.1;
    this.dead = false;
  }

  update(dt, isBlocked) {
    this.fuse -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.vz -= 9.8 * dt;
    if (this.z < 0) { this.z = 0; this.vz *= -0.45; this.vx *= 0.7; this.vy *= 0.7; }
    if (isBlocked(Math.floor(this.x), Math.floor(this.y))) {
      this.x -= this.vx * dt; this.y -= this.vy * dt;
      this.vx *= -0.4; this.vy *= -0.4;
    }
    if (this.fuse <= 0) this.dead = true;
    return this.dead;
  }
}

export function grenadeDamage(gx, gy, targets, hasLOS) {
  const hits = [];
  for (const t of targets) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - gx, t.y - gy);
    if (d > 4.2) continue;
    if (!hasLOS(gx, gy, t.x, t.y)) continue;
    const dmg = Math.max(18, 95 * (1 - d / 4.2));
    hits.push({ target: t, damage: dmg });
  }
  return hits;
}

export function applyDamage(target, raw, game) {
  // Armor absorbs half the damage until it is gone.
  let remaining = raw;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, raw * 0.5);
    target.armor -= absorbed;
    remaining = raw - absorbed;
  }
  target.hp -= remaining;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    return true;
  }
  return false;
}

export function clampSpread(v) { return clamp(v, 0, 0.09); }
