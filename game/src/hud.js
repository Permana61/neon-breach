// NEON BREACH — the HUD: DOM readouts (health, ammo, money, timer, score,
// killfeed, messages, plant progress) and the top-down minimap canvas.
import { MAP, MAP_W, MAP_H, SITE_A, SITE_B, WEAPONS, WEAPON_ORDER, WEAPON_BLURB } from './config.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['roundLabel', 'timer', 'score', 'hpFill', 'hpText', 'armorText', 'weaponName', 'ammo', 'money', 'msg', 'submsg', 'plantBar', 'plantFill', 'plantLbl', 'killfeed', 'minimap', 'buyMoney', 'buyGrid']) {
      this.el[id] = document.getElementById(id);
    }
    this.mm = this.el.minimap.getContext('2d');
    this.lastKillfeedAt = 0;
  }

  fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  update(game) {
    const p = game.player;
    this.el.roundLabel.textContent = 'ROUND ' + game.round + (game.phase === 'buy' ? ' — BUY ' + Math.ceil(game.buyTimer) + 's' : '');
    const t = game.spike.state === 'planted' ? game.spike.fuse : game.roundTimer;
    this.el.timer.textContent = this.fmtTime(t);
    this.el.timer.style.color = game.spike.state === 'planted' ? '#ff4d6d' : '#fff';
    this.el.score.innerHTML = `<span class="cy">VANGUARD ${game.score.VANGUARD}</span> &nbsp;—&nbsp; <span class="or">${game.score.CINDER} CINDER</span>`;
    this.el.hpFill.style.width = Math.max(0, p.hp) + '%';
    this.el.hpFill.style.background = p.hp > 50 ? 'linear-gradient(90deg,#00e5ff,#7df9ff)' : p.hp > 25 ? 'linear-gradient(90deg,#ffd23f,#ffe9a3)' : 'linear-gradient(90deg,#ff4d6d,#ff8c8c)';
    this.el.hpText.textContent = Math.max(0, Math.ceil(p.hp));
    this.el.armorText.textContent = 'ARMOR ' + Math.ceil(p.armor) + (p.grenades > 0 ? '   •   GRENADE ×' + p.grenades : '   •   NO GRENADE');
    this.el.weaponName.textContent = p.weapon.def.name + (p.weapon.reloading ? ' — RELOADING…' : '');
    this.el.ammo.innerHTML = p.weapon.ammo + ' <span class="res">/ ' + (p.weapon.reserve === Infinity ? '∞' : p.weapon.reserve) + '</span>';
    this.el.money.textContent = '$' + p.money;
    this.el.msg.textContent = game.message;
    this.el.submsg.textContent = game.submessage;
    // plant / defuse progress bar
    const prog = p.plantProgress > 0 ? { v: p.plantProgress / 3, label: 'PLANTING SPIKE…' } :
      p.defuseProgress > 0 ? { v: p.defuseProgress / 4, label: 'DEFUSING SPIKE…' } : null;
    if (prog) {
      this.el.plantBar.style.display = 'block';
      this.el.plantLbl.textContent = prog.label;
      this.el.plantFill.style.width = Math.min(100, prog.v * 100) + '%';
    } else {
      this.el.plantBar.style.display = 'none';
    }
    this.renderKillfeed(game);
    this.renderMinimap(game);
  }

  renderKillfeed(game) {
    const kf = game.killfeed;
    if (!kf.length) { this.el.killfeed.innerHTML = ''; return; }
    this.el.killfeed.innerHTML = kf.map((e) => {
      if (e.text) return `<div class="kf" style="color:#ffd23f">${e.text}</div>`;
      const kc = e.killerTeam === 'VANGUARD' ? 'cy' : 'or';
      const vc = e.victimTeam === 'VANGUARD' ? 'cy' : 'or';
      return `<div class="kf"><span class="${kc}">${e.killer}</span> ${e.headshot ? '<span class="hs">⌖ HEADSHOT</span> ' : '➤'} <span class="${vc}">${e.victim}</span></div>`;
    }).join('');
  }

  renderMinimap(game) {
    const ctx = this.mm;
    const W = 168, H = 168;
    const s = W / MAP_W;
    ctx.clearRect(0, 0, W, H);
    // floor + walls
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const c = MAP[y][x];
        if (c === '.') continue;
        ctx.fillStyle = c === 'A' ? '#1d5a2e' : c === 'B' ? '#5a4a1d' : c === 'C' ? '#3a2a4a' : '#2a4a5a';
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
    // site zones
    ctx.strokeStyle = SITE_A.color; ctx.lineWidth = 1.5;
    ctx.strokeRect(SITE_A.x0 * s, SITE_A.y0 * s, (SITE_A.x1 - SITE_A.x0) * s, (SITE_A.y1 - SITE_A.y0) * s);
    ctx.strokeStyle = SITE_B.color;
    ctx.strokeRect(SITE_B.x0 * s, SITE_B.y0 * s, (SITE_B.x1 - SITE_B.x0) * s, (SITE_B.y1 - SITE_B.y0) * s);
    ctx.fillStyle = SITE_A.color; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('A', (SITE_A.x0 + SITE_A.x1) / 2 * s, (SITE_A.y0 + SITE_A.y1) / 2 * s + 4);
    ctx.fillStyle = SITE_B.color;
    ctx.fillText('B', (SITE_B.x0 + SITE_B.x1) / 2 * s, (SITE_B.y0 + SITE_B.y1) / 2 * s + 4);
    // spike
    if (game.spike.state === 'planted' || game.spike.state === 'dropped') {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(game.spike.x * s, game.spike.y * s, 4, 0, Math.PI * 2); ctx.fill();
    }
    // bots
    for (const b of game.bots) {
      if (!b.alive) continue;
      ctx.fillStyle = b.team === 'VANGUARD' ? '#00e5ff' : '#ff8c1a';
      ctx.beginPath(); ctx.arc(b.x * s, b.y * s, 3, 0, Math.PI * 2); ctx.fill();
    }
    // player: white dot + view cone
    const p = game.player;
    if (p.alive) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(p.x * s, p.y * s);
      ctx.arc(p.x * s, p.y * s, 22, p.angle - 0.35, p.angle + 0.35);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x * s, p.y * s, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  buildBuyMenu(game) {
    const p = game.player;
    this.el.buyMoney.textContent = '$' + p.money;
    this.el.buyGrid.innerHTML = '';
    for (const id of WEAPON_ORDER) {
      const def = WEAPONS[id];
      const owned = !!p.weaponsOwned[id];
      const afford = p.money >= def.price;
      const card = document.createElement('div');
      card.className = 'buyCard' + (owned ? ' owned' : '');
      card.innerHTML = `<h3>${def.name}</h3><div class="price">${owned ? 'OWNED — click to equip' : '$' + def.price}</div><div class="st">DMG ${def.dmg}${def.pellets ? ' ×' + def.pellets : ''} • MAG ${def.mag}<br>${WEAPON_BLURB[id]}</div>`;
      card.style.opacity = !owned && !afford ? '0.45' : '1';
      card.addEventListener('click', () => {
        if (game.player.buy(id)) {
          game.audio.buy();
          this.buildBuyMenu(game);
          this.update(game);
        } else {
          game.audio.denied();
        }
      });
      this.el.buyGrid.appendChild(card);
    }
  }
}
