// NEON BREACH — the player: movement, mouse look, input state and the
// player-facing combat actions (fire, reload, grenade, plant/defuse, buy).
import { MAP, MAP_W, MAP_H, PLAYER, WEAPONS } from './config.js';
import { makeWeaponState, fireHitscan, startReload, finishReload, applyDamage, clampSpread } from './weapons.js';

export class Player {
  constructor() {
    this.kind = 'player';
    this.name = 'YOU';
    this.team = 'VANGUARD';
    this.x = 11.5; this.y = 21.5;
    this.angle = -Math.PI / 2;
    this.hp = 100; this.armor = 0; this.alive = true;
    this.money = 800;
    this.weaponId = 'pistol';
    this.weapon = makeWeaponState('pistol');
    this.weaponsOwned = { pistol: true };
    this.grenades = 1;
    this.spread = 0.012;
    this.spreadKick = 0;
    this.recoil = 0;
    this.ads = false;
    this.moving = false;
    this.crouch = false;
    this.sprint = false;
    this.kills = 0;
    this.deaths = 0;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.isCarrier = true;
    this.stepAt = 0;
  }

  reset(team, x, y, angle, money) {
    this.team = team;
    this.x = x; this.y = y; this.angle = angle;
    this.hp = 100; this.armor = 0; this.alive = true;
    this.money = money;
    this.weaponId = 'pistol';
    this.weapon = makeWeaponState('pistol');
    this.weaponsOwned = { pistol: true };
    this.grenades = 1;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.isCarrier = team === 'VANGUARD' ? true : false;
    this.spreadKick = 0;
    this.recoil = 0;
    this.ads = false;
  }

  buy(weaponId) {
    const def = WEAPONS[weaponId];
    if (!def) return false;
    if (this.weaponsOwned[weaponId]) {
      this.weaponId = weaponId;
      this.weapon = makeWeaponState(weaponId);
      return true;
    }
    if (this.money < def.price) return false;
    this.money -= def.price;
    this.weaponsOwned[weaponId] = true;
    this.weaponId = weaponId;
    this.weapon = makeWeaponState(weaponId);
    return true;
  }

  cellBlocked(x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return true;
    return MAP[cy][cx] !== '.';
  }

  // Move with axis-separated collision so walls slide instead of sticking.
  tryMove(dx, dy) {
    const r = PLAYER.radius;
    if (!this.cellBlocked(this.x + dx + Math.sign(dx) * r, this.y) &&
        !this.cellBlocked(this.x + dx + Math.sign(dx) * r, this.y + r * 0.6) &&
        !this.cellBlocked(this.x + dx + Math.sign(dx) * r, this.y - r * 0.6)) {
      this.x += dx;
    }
    if (!this.cellBlocked(this.x, this.y + dy + Math.sign(dy) * r) &&
        !this.cellBlocked(this.x + r * 0.6, this.y + dy + Math.sign(dy) * r) &&
        !this.cellBlocked(this.x - r * 0.6, this.y + dy + Math.sign(dy) * r)) {
      this.y += dy;
    }
  }

  update(dt, input, game) {
    if (!this.alive) return;
    const now = game.now;
    // reload finishing
    if (this.weapon.reloading && now >= this.weapon.reloadEnd) {
      finishReload(this.weapon);
      game.audio.reload();
    }
    // look
    this.angle += input.lookDX * 0.0024 * (this.ads ? 0.55 : 1);
    input.lookDX = 0;
    // speed
    this.crouch = !!input.keys['KeyC'];
    this.sprint = !!input.keys['ShiftLeft'] || !!input.keys['ShiftRight'];
    let speed = this.crouch ? PLAYER.crouchSpeed : this.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    if (this.ads) speed *= 0.55;
    let mx = 0, my = 0;
    if (input.keys['KeyW'] || input.keys['ArrowUp']) my += 1;
    if (input.keys['KeyS'] || input.keys['ArrowDown']) my -= 1;
    if (input.keys['KeyA']) mx -= 1;
    if (input.keys['KeyD']) mx += 1;
    if (input.keys['ArrowLeft']) this.angle -= 2.4 * dt;
    if (input.keys['ArrowRight']) this.angle += 2.4 * dt;
    const len = Math.hypot(mx, my);
    this.moving = len > 0;
    if (len > 0) {
      mx /= len; my /= len;
      const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
      const wx = (ca * my - sa * mx) * speed * dt;
      const wy = (sa * my + ca * mx) * speed * dt;
      this.tryMove(wx, wy);
      // footsteps
      if (now > this.stepAt) {
        this.stepAt = now + (this.sprint ? 0.28 : 0.42);
        game.audio.step();
      }
    }
    // spread: grows while moving/firing, shrinks when still
    const target = this.weapon.def.spread * (this.moving ? 1.6 : 1) * (this.ads ? 0.45 : 1);
    this.spread = clampSpread(this.spread + (target - this.spread) * Math.min(1, dt * 8) + this.spreadKick);
    this.spreadKick = Math.max(0, this.spreadKick - dt * 0.09);
    this.recoil = Math.max(0, this.recoil - dt * 0.09);
    // ADS
    this.ads = !!input.mouseR;
    // firing
    if (input.firing) {
      this.fire(game);
      if (!this.weapon.def.auto) input.firing = false;
    }
  }

  fire(game) {
    const now = game.now;
    const ws = this.weapon;
    if (ws.reloading) return;
    if (ws.ammo <= 0) {
      game.audio.dryFire();
      if (startReload(ws, now)) game.audio.reload();
      return;
    }
    const res = fireHitscan(this, ws, now, game.allActors(), (a) => game.renderer.cast(this.x, this.y, a).dist, game.rng);
    if (!res) return;
    game.audio.shoot(ws.id);
    game.renderer.flash = 1;
    this.recoil = Math.min(1, this.recoil + 0.35);
    this.spreadKick = Math.min(0.05, this.spreadKick + 0.014);
    game.renderer.shake = Math.min(1, game.renderer.shake + 0.12);
    // tracer from the gun to the hit point
    const hitD = res.hit ? res.dist : res.dist;
    const ex = this.x + Math.cos(this.angle) * hitD;
    const ey = this.y + Math.sin(this.angle) * hitD;
    const s1 = { x: game.renderer.W / 2, y: game.renderer.H - 90 };
    const s2 = game.renderer.projectToScreen(game, ex, ey);
    if (!s2.behind) game.renderer.addTracer(s1.x, s1.y, s2.x, s2.y);
    // impact sparks at the hit point
    game.renderer.addBurst(s2.x, s2.y, res.hit ? '#ff5d73' : '#9fd8ff', res.hit ? 8 : 5);
    if (res.hit) {
      const killed = applyDamage(res.target, res.damage, game);
      game.onPlayerHit(res.target, res.damage, res.headshot, killed);
      const sp = game.renderer.projectToScreen(game, res.target.x, res.target.y);
      if (!sp.behind) game.renderer.addFloater(sp.x, sp.y - 30, Math.round(res.damage) + (res.headshot ? ' HEADSHOT' : ''), res.headshot ? '#ffd23f' : '#ffffff');
    }
    botHearShot(game, this.x, this.y, this.team);
  }
}

export function botHearShot(game, x, y, team) {
  // local alias so player.js does not need to import bots.js (avoids a cycle)
  if (game.botHearShot) game.botHearShot(x, y, team);
}
