// NEON BREACH — procedural textures. Every texture is painted in code at load time
// on offscreen canvases: neon wall panels, hazard stripes, reactor/vault walls,
// crates, the floor pattern and the sprite art for bots, the spike and pickups.

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function neonPanel(ctx, w, h, base, glow, lines) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // panel seams
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
  ctx.stroke();
  // glowing neon strips
  ctx.shadowColor = glow;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2;
  for (const y of lines) {
    ctx.beginPath();
    ctx.moveTo(4, y); ctx.lineTo(w - 4, y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // rivets
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (const [x, y] of [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]]) {
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  // grime speckles
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 26; i++) {
    ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 2, 1);
  }
}

function hazardStripes(ctx, w, h) {
  ctx.fillStyle = '#141210';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.fillStyle = '#ffb300';
  for (let x = -h; x < w + h; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, h); ctx.lineTo(x + 8, 0); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 8, h);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, w, 5);
  ctx.fillRect(0, h - 5, w, 5);
}

function textTexture(ctx, w, h, text, fg, bg, sub) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.shadowColor = fg;
  ctx.shadowBlur = 8;
  ctx.fillStyle = fg;
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 - 6);
  ctx.shadowBlur = 0;
  if (sub) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '8px monospace';
    ctx.fillText(sub, w / 2, h / 2 + 12);
  }
}

export function buildTextures() {
  const T = {};
  const mk = (fn) => { const c = makeCanvas(64, 64); fn(c.getContext('2d'), 64, 64); return c; };

  T.wall = mk((x, w, h) => neonPanel(x, w, h, '#0d1620', '#00e5ff', [12, 52]));
  T.hazard = mk((x, w, h) => { neonPanel(x, w, h, '#151310', '#ff8c1a', [52]); hazardStripes(x, w, 14); });
  T.reactor = mk((x, w, h) => textTexture(x, w, h, 'REACTOR', '#7dff9e', '#07130c', 'SITE A'));
  T.vault = mk((x, w, h) => textTexture(x, w, h, 'VAULT', '#ffd23f', '#130f05', 'SITE B'));
  T.crate = mk((x, w, h) => {
    x.fillStyle = '#1a1d24'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#ff2bd6'; x.lineWidth = 2; x.shadowColor = '#ff2bd6'; x.shadowBlur = 5;
    x.strokeRect(4, 4, w - 8, h - 8);
    x.beginPath(); x.moveTo(4, 4); x.lineTo(w - 4, h - 4); x.moveTo(w - 4, 4); x.lineTo(4, h - 4); x.stroke();
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,0.2)';
    x.font = 'bold 9px monospace'; x.textAlign = 'center';
    x.fillText('OX90', w / 2, h / 2 - 4);
    x.fillText('666', w / 2, h / 2 + 8);
  });
  T.brand = mk((x, w, h) => textTexture(x, w, h, 'ox90_666', '#00e5ff', '#05060a', 'NEON BREACH'));
  T.floor = mk((x, w, h) => {
    x.fillStyle = '#0a0d14'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(0,229,255,0.16)'; x.lineWidth = 1;
    x.strokeRect(0.5, 0.5, w - 1, h - 1);
    x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
    x.fillStyle = 'rgba(0,229,255,0.10)';
    x.fillRect(4, 4, 6, 6);
  });
  return T;
}

// Sprite art: drawn once, then stamped into the raycaster as textured billboards.
export function buildSprites() {
  const S = {};
  const mk = (w, h, fn) => { const c = makeCanvas(w, h); fn(c.getContext('2d'), w, h); return c; };

  const botFigure = (color, dark) => (x, w, h) => {
    // shadow base
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.beginPath(); x.ellipse(w / 2, h - 4, 16, 4, 0, 0, Math.PI * 2); x.fill();
    // legs
    x.fillStyle = dark;
    x.fillRect(w / 2 - 9, h - 26, 7, 22);
    x.fillRect(w / 2 + 2, h - 26, 7, 22);
    // torso armour
    x.fillStyle = color;
    x.fillRect(w / 2 - 11, h - 48, 22, 24);
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(w / 2 - 11, h - 48, 22, 4);
    // chest light
    x.shadowColor = color; x.shadowBlur = 8;
    x.fillStyle = '#ffffff';
    x.fillRect(w / 2 - 2, h - 42, 4, 4);
    x.shadowBlur = 0;
    // arms + rifle
    x.fillStyle = dark;
    x.fillRect(w / 2 - 16, h - 44, 6, 18);
    x.fillRect(w / 2 + 10, h - 44, 6, 18);
    x.fillStyle = '#111318';
    x.fillRect(w / 2 - 4, h - 40, 26, 4);
    // visor head
    x.fillStyle = '#0b0e14';
    x.fillRect(w / 2 - 8, h - 62, 16, 14);
    x.fillStyle = color;
    x.shadowColor = color; x.shadowBlur = 10;
    x.fillRect(w / 2 - 6, h - 58, 12, 3);
    x.shadowBlur = 0;
  };
  S.botCyan = mk(64, 64, botFigure('#00e5ff', '#0a3a48'));
  S.botOrange = mk(64, 64, botFigure('#ff8c1a', '#48260a'));

  S.spike = mk(48, 48, (x, w, h) => {
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.beginPath(); x.ellipse(w / 2, h - 4, 14, 4, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1c1f26';
    x.fillRect(w / 2 - 10, h - 24, 20, 20);
    x.shadowColor = '#ffd23f'; x.shadowBlur = 10;
    x.fillStyle = '#ffd23f';
    x.beginPath(); x.arc(w / 2, h - 26, 5, 0, Math.PI * 2); x.fill();
    x.shadowBlur = 0;
    x.strokeStyle = '#ffd23f'; x.lineWidth = 2;
    x.strokeRect(w / 2 - 10, h - 24, 20, 20);
  });
  S.health = mk(48, 48, (x, w, h) => {
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.beginPath(); x.ellipse(w / 2, h - 4, 13, 4, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#10240f';
    x.fillRect(w / 2 - 11, h - 26, 22, 22);
    x.strokeStyle = '#7dff9e'; x.lineWidth = 2;
    x.strokeRect(w / 2 - 11, h - 26, 22, 22);
    x.fillStyle = '#7dff9e';
    x.fillRect(w / 2 - 2, h - 23, 4, 16);
    x.fillRect(w / 2 - 8, h - 17, 16, 4);
  });
  S.ammo = mk(48, 48, (x, w, h) => {
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.beginPath(); x.ellipse(w / 2, h - 4, 13, 4, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#241f10';
    x.fillRect(w / 2 - 11, h - 26, 22, 22);
    x.strokeStyle = '#ffd23f'; x.lineWidth = 2;
    x.strokeRect(w / 2 - 11, h - 26, 22, 22);
    x.fillStyle = '#ffd23f';
    x.font = 'bold 11px monospace'; x.textAlign = 'center';
    x.fillText('AMMO', w / 2, h - 11);
  });
  return S;
}
