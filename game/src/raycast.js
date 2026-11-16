// NEON BREACH — the raycasting renderer. Hand-written DDA raycaster: textured
// walls with distance shading, gradient floor and ceiling, z-buffered billboard
// sprites (bots, spike, pickups), weapon viewmodel, tracers, impact particles,
// floating damage numbers, muzzle flash, screen shake and damage vignette.
import { MAP, MAP_W, MAP_H, SITE_A, SITE_B } from './config.js';

const FOV = (66 * Math.PI) / 180;

export class Renderer {
  constructor(canvas, textures, sprites) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.tex = textures;
    this.spr = sprites;
    this.zbuf = new Float32Array(this.W);
    this.columns = 480; // raycast columns (2 px each at 960 wide)
    this.colW = this.W / this.columns;
    this.tracers = [];
    this.particles = [];
    this.floaters = [];
    this.shake = 0;
    this.flash = 0; // muzzle flash 0..1
    this.vignette = 0; // damage vignette 0..1
    this.floorGrad = null;
    this.ceilGrad = null;
    this.buildGradients();
  }

  buildGradients() {
    const g = this.ctx.createLinearGradient(0, this.H / 2, 0, this.H);
    g.addColorStop(0, '#0a1420');
    g.addColorStop(0.5, '#070b12');
    g.addColorStop(1, '#030407');
    this.floorGrad = g;
    const c = this.ctx.createLinearGradient(0, 0, 0, this.H / 2);
    c.addColorStop(0, '#0b0616');
    c.addColorStop(1, '#120a24');
    this.ceilGrad = c;
  }

  wallTexture(cell) {
    switch (cell) {
      case 'H': return this.tex.hazard;
      case 'A': return this.tex.reactor;
      case 'B': return this.tex.vault;
      case 'C': return this.tex.crate;
      default: return this.tex.wall;
    }
  }

  // Cast one ray; returns {dist, side, cell, tx} where tx is the wall hit position 0..1.
  cast(px, py, angle) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let mapX = Math.floor(px), mapY = Math.floor(py);
    const deltaX = Math.abs(1 / (dx || 1e-9));
    const deltaY = Math.abs(1 / (dy || 1e-9));
    let stepX, stepY, sideX, sideY;
    if (dx < 0) { stepX = -1; sideX = (px - mapX) * deltaX; } else { stepX = 1; sideX = (mapX + 1 - px) * deltaX; }
    if (dy < 0) { stepY = -1; sideY = (py - mapY) * deltaY; } else { stepY = 1; sideY = (mapY + 1 - py) * deltaY; }
    let side = 0;
    let guard = 0;
    while (guard++ < 64) {
      if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
      else { sideY += deltaY; mapY += stepY; side = 1; }
      if (mapX < 0 || mapY < 0 || mapX >= MAP_W || mapY >= MAP_H) return { dist: 64, side, cell: '#', tx: 0 };
      const cell = MAP[mapY][mapX];
      if (cell !== '.') {
        const dist = side === 0 ? sideX - deltaX : sideY - deltaY;
        const wallX = side === 0 ? py + dist * dy : px + dist * dx;
        return { dist: Math.max(dist, 0.001), side, cell, tx: wallX - Math.floor(wallX) };
      }
    }
    return { dist: 64, side, cell: '#', tx: 0 };
  }

  // 2D line of sight on the grid (Bresenham sampling); true when nothing blocks.
  hasLOS(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const steps = Math.ceil(Math.hypot(dx, dy) * 8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.floor(ax + dx * t), y = Math.floor(ay + dy * t);
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
      if (MAP[y][x] !== '.') return false;
    }
    return true;
  }

  render(state) {
    const { ctx, W, H } = this;
    const p = state.player;
    const shakeX = (Math.random() - 0.5) * this.shake * 8;
    const shakeY = (Math.random() - 0.5) * this.shake * 8;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Ceiling and floor.
    ctx.fillStyle = this.ceilGrad;
    ctx.fillRect(-10, -10, W + 20, H / 2 + 10);
    ctx.fillStyle = this.floorGrad;
    ctx.fillRect(-10, H / 2, W + 20, H / 2 + 10);

    const horizon = H / 2 + Math.sin(state.time * 0.4) * 0; // keep horizon steady
    const planeX = Math.tan(FOV / 2);
    const dirX = Math.cos(p.angle), dirY = Math.sin(p.angle);
    const plane = { x: -dirY * planeX, y: dirX * planeX };
    const zoom = p.ads ? p.weapon.zoom : 1;
    const effFov = FOV / zoom;

    for (let col = 0; col < this.columns; col++) {
      const cameraX = (2 * col) / this.columns - 1;
      const rayAngle = p.angle + Math.atan(cameraX * Math.tan(effFov / 2));
      const hit = this.cast(p.x, p.y, rayAngle);
      const corr = Math.max(hit.dist * Math.cos(rayAngle - p.angle), 0.001);
      this.zbuf[Math.floor(col * this.colW)] = corr;
      const lineH = H / corr;
      const y0 = horizon - lineH / 2;
      const tex = this.wallTexture(hit.cell);
      const tx = Math.floor(hit.tx * 64);
      const shade = Math.max(0.25, 1 - corr / 26);
      const sideShade = hit.side === 1 ? 0.75 : 1;
      ctx.globalAlpha = 1;
      ctx.drawImage(tex, tx, 0, 1, 64, col * this.colW, y0, this.colW + 1, lineH);
      // distance + side shading
      ctx.fillStyle = `rgba(2,6,12,${(1 - shade * sideShade).toFixed(3)})`;
      ctx.fillRect(col * this.colW, y0, this.colW + 1, lineH);
    }

    this.renderSprites(state, horizon);
    this.renderTracers(state);
    this.renderParticles(state);
    this.renderWeapon(state);
    this.renderFloaters(state);
    this.renderCrosshair(state);

    ctx.restore();

    // Muzzle flash wash + damage vignette, drawn unshaken.
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,220,120,${(this.flash * 0.10).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.vignette > 0.01) {
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.75);
      v.addColorStop(0, 'rgba(255,0,40,0)');
      v.addColorStop(1, `rgba(255,0,40,${(this.vignette * 0.55).toFixed(3)})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
    this.flash = Math.max(0, this.flash - 0.22);
    this.shake = Math.max(0, this.shake - 0.06);
    this.vignette = Math.max(0, this.vignette - 0.012);
  }

  renderSprites(state, horizon) {
    const { ctx, W, H } = this;
    const p = state.player;
    const items = [];
    for (const b of state.bots) {
      if (!b.alive) continue;
      items.push({ x: b.x, y: b.y, img: b.team === 'VANGUARD' ? this.spr.botCyan : this.spr.botOrange, size: 0.95, kind: 'bot', ref: b });
    }
    if (state.spike.state === 'planted') items.push({ x: state.spike.x, y: state.spike.y, img: this.spr.spike, size: 0.5, kind: 'spike' });
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      items.push({ x: pk.x, y: pk.y, img: pk.kind === 'health' ? this.spr.health : this.spr.ammo, size: 0.42, kind: 'pickup', ref: pk });
    }
    // far to near
    items.sort((a, b) => {
      const da = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
      const db = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
      return db - da;
    });
    for (const it of items) {
      const dx = it.x - p.x, dy = it.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 30 || dist < 0.15) continue;
      const rel = Math.atan2(dy, dx) - p.angle;
      let a = rel;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > FOV * 0.75) continue;
      const screenX = W / 2 + Math.tan(a) * (W / 2) / Math.tan(FOV / 2) * (p.ads ? p.weapon.zoom : 1);
      const size = (H / dist) * it.size;
      const slices = 24;
      const sliceW = size / slices;
      for (let s = 0; s < slices; s++) {
        const sx = screenX - size / 2 + s * sliceW;
        const px = Math.floor(sx);
        if (px < 0 || px >= W) continue;
        if (dist >= this.zbuf[px]) continue;
        const srcX = Math.floor((s / slices) * it.img.width);
        ctx.drawImage(it.img, srcX, 0, 1, it.img.height, sx, horizon - size / 2 + size * 0.08, sliceW + 1, size);
      }
      if (it.kind === 'bot') {
        // health bar above the bot
        const bw = 34;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(screenX - bw / 2, horizon - size / 2 - 10, bw, 4);
        ctx.fillStyle = it.ref.team === 'VANGUARD' ? '#00e5ff' : '#ff8c1a';
        ctx.fillRect(screenX - bw / 2, horizon - size / 2 - 10, bw * Math.max(0, it.ref.hp / 100), 4);
        if (it.ref.team === state.player.team) {
          ctx.fillStyle = '#7df9ff';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(it.ref.name, screenX, horizon - size / 2 - 14);
        }
      }
    }
  }

  addTracer(x1, y1, x2, y2, color) {
    this.tracers.push({ x1, y1, x2, y2, color: color || '#ffe9a3', life: 1 });
  }

  renderTracers() {
    const { ctx } = this;
    for (const t of this.tracers) {
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
      ctx.globalAlpha = 1;
      t.life -= 0.25;
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);
  }

  addBurst(x, y, color, n) {
    for (let i = 0; i < (n || 10); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.5 + Math.random() * 0.3, color: color || '#ffd23f', size: 2 + Math.random() * 2 });
    }
  }

  renderParticles(state) {
    const { ctx } = this;
    const dt = state.dt;
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 260 * dt;
      pt.life -= dt;
      ctx.globalAlpha = Math.max(0, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter((pt) => pt.life > 0);
  }

  addFloater(x, y, text, color) {
    this.floaters.push({ x, y, text, color: color || '#ffd23f', life: 1 });
  }

  renderFloaters(state) {
    const { ctx } = this;
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y - (1 - f.life) * 34);
      f.life -= state.dt * 1.1;
    }
    ctx.globalAlpha = 1;
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  renderWeapon(state) {
    const { ctx, W, H } = this;
    const p = state.player;
    const w = p.weapon;
    const bob = Math.sin(state.time * 9) * (p.moving ? 3 : 0.6) * (p.ads ? 0.3 : 1);
    const recoil = p.recoil * 14;
    const cx = W / 2 + bob;
    const cy = H - 26 + recoil;
    const zoom = p.ads ? 1.25 : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    // gun body per weapon silhouette
    const palette = { pistol: '#2b3442', smg: '#1f2a38', rifle: '#232c3a', shotgun: '#3a2a20', sniper: '#1a2230' };
    ctx.fillStyle = palette[p.weaponId] || '#2b3442';
    const len = { pistol: 46, smg: 78, rifle: 96, shotgun: 88, sniper: 118 }[p.weaponId] || 60;
    ctx.fillRect(-9, -96 - len * 0.28, 18, len * 0.28 + 26);
    ctx.fillStyle = '#0c0f16';
    ctx.fillRect(-6, -96 - len * 0.28 + 4, 12, 8);
    // neon accent line
    ctx.fillStyle = p.team === 'VANGUARD' ? '#00e5ff' : '#ff8c1a';
    ctx.fillRect(-9, -96 - len * 0.28 + 14, 18, 2);
    // grip
    ctx.fillStyle = '#141821';
    ctx.fillRect(-7, -70, 14, 46);
    // muzzle flash
    if (this.flash > 0.25) {
      ctx.fillStyle = `rgba(255,220,120,${this.flash.toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(0, -96 - len * 0.28 - 26);
      ctx.lineTo(-10, -96 - len * 0.28 - 4);
      ctx.lineTo(10, -96 - len * 0.28 - 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // ADS scope ring for the sniper
    if (p.ads && p.weaponId === 'sniper') {
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, H * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,229,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W / 2 - 26, H / 2); ctx.lineTo(W / 2 + 26, H / 2); ctx.moveTo(W / 2, H / 2 - 26); ctx.lineTo(W / 2, H / 2 + 26); ctx.stroke();
    }
  }

  renderCrosshair(state) {
    const { ctx, W, H } = this;
    const p = state.player;
    if (state.phase !== 'live' && state.phase !== 'buy') return;
    const gap = 6 + p.spread * 320 + (p.moving ? 4 : 0);
    const len = 8;
    ctx.strokeStyle = p.ads ? '#7df9ff' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - gap - len, H / 2); ctx.lineTo(W / 2 - gap, H / 2);
    ctx.moveTo(W / 2 + gap, H / 2); ctx.lineTo(W / 2 + gap + len, H / 2);
    ctx.moveTo(W / 2, H / 2 - gap - len); ctx.lineTo(W / 2, H / 2 - gap);
    ctx.moveTo(W / 2, H / 2 + gap); ctx.lineTo(W / 2, H / 2 + gap + len);
    ctx.stroke();
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(W / 2 - 1, H / 2 - 1, 2, 2);
    if (state.hitmark > 0) {
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 2;
      const d = 9;
      ctx.beginPath();
      ctx.moveTo(W / 2 - d - 5, H / 2 - d - 5); ctx.lineTo(W / 2 - d, H / 2 - d);
      ctx.moveTo(W / 2 + d + 5, H / 2 - d - 5); ctx.lineTo(W / 2 + d, H / 2 - d);
      ctx.moveTo(W / 2 - d - 5, H / 2 + d + 5); ctx.lineTo(W / 2 - d, H / 2 + d);
      ctx.moveTo(W / 2 + d + 5, H / 2 + d + 5); ctx.lineTo(W / 2 + d, H / 2 + d);
      ctx.stroke();
    }
  }

  projectToScreen(state, wx, wy) {
    const { W, H } = this;
    const p = state.player;
    const dx = wx - p.x, dy = wy - p.y;
    const dist = Math.hypot(dx, dy);
    const rel = Math.atan2(dy, dx) - p.angle;
    let a = rel;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    const sx = W / 2 + Math.tan(a) * (W / 2) / Math.tan(FOV / 2) * (p.ads ? p.weapon.zoom : 1);
    const sy = H / 2 - (H / dist) * 0.12;
    return { x: sx, y: sy, dist, behind: Math.abs(a) > FOV / 2 };
  }
}
