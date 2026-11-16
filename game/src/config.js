// NEON BREACH — config: arena map, weapons, teams, economy.
// Everything here was typed by hand for this entry. The map is a 24x24 grid:
// '#' neon wall, 'H' hazard wall, 'A' reactor wall (site A), 'B' vault wall (site B),
// 'C' cover crate, '.' open floor. y=0 is the defender (top) side, y=23 the attacker spawn.

export const MAP_W = 24;
export const MAP_H = 24;
export const TILE = 1; // world units per cell

export const MAP = [
  '########################',
  '#AA....#......#......BB#',
  '#......#.C....#...C....#',
  '#.C....#......#.......C#',
  '#......#.C....#....C...#',
  '#...C..#......#..C.....#',
  '#......#......#........#',
  '#.C....#.C....#........#',
  '##..######..######.#####',
  '#......#......#........#',
  '#..C.........C.........#',
  '#......#......#........#',
  '#..C...#.C....#..C.....#',
  '#......#......#........#',
  '#..C.........C.........#',
  '#......#.C....#........#',
  '#..C...#......#..C.....#',
  '#......#.C....#........#',
  '#..C...#......#..C.....#',
  '#......#.C....#........#',
  '#..C...#......#..C.....#',
  '#......................#',
  '#......................#',
  '########################',
];

export const SITE_A = { name: 'REACTOR', short: 'A', x0: 1, y0: 1, x1: 6, y1: 7, color: '#7dff9e' };
export const SITE_B = { name: 'VAULT', short: 'B', x0: 17, y0: 1, x1: 22, y1: 7, color: '#ffd23f' };

export const ATTACKER_SPAWN = { x: 11.5, y: 21.5 };
export const DEFENDER_SPAWN = { x: 11.5, y: 2.5 };

export const TEAMS = {
  VANGUARD: { name: 'VANGUARD', color: '#00e5ff', dark: '#0a4a5a', label: 'VAN' },
  CINDER: { name: 'CINDER', color: '#ff8c1a', dark: '#5a2a0a', label: 'CIN' },
};

// Weapons: damage per hit, headshot multiplier, fire interval (ms), magazine,
// spread (radians, base), reload time (ms), price, automatic fire, zoom factor on ADS.
export const WEAPONS = {
  pistol:  { name: 'P9 SIDEARM',    dmg: 34, hs: 2.0, rate: 320,  mag: 12, reserve: Infinity, spread: 0.012, reload: 1100, price: 0,    auto: false, zoom: 1.15, range: 34 },
  smg:     { name: 'KX-9 RIPPER',   dmg: 26, hs: 2.0, rate: 95,   mag: 30, reserve: 90,  spread: 0.030, reload: 1500, price: 1200, auto: true,  zoom: 1.2,  range: 30 },
  rifle:   { name: 'AR-77 DUSKFIRE',dmg: 40, hs: 2.0, rate: 130,  mag: 25, reserve: 75,  spread: 0.016, reload: 1700, price: 2700, auto: true,  zoom: 1.35, range: 40 },
  shotgun: { name: 'M590 BREAKWATER', dmg: 13, hs: 1.6, rate: 820, mag: 6,  reserve: 18,  spread: 0.085, reload: 2100, price: 1800, auto: false, zoom: 1.1,  range: 16, pellets: 8 },
  sniper:  { name: 'LR-80 LONGSHADOW', dmg: 112, hs: 2.0, rate: 1250, mag: 5, reserve: 15, spread: 0.002, reload: 2400, price: 4200, auto: false, zoom: 2.4, range: 60 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'];
export const WEAPON_BLURB = {
  pistol: 'Reliable sidearm. Free, infinite reserve.',
  smg: 'Bullet hose. Fast, wild, close range.',
  rifle: 'The workhorse. Accurate, hard hitting.',
  shotgun: '8 pellets. Deletes anything up close.',
  sniper: 'One shot, one down. Scope zooms hard.',
};

export const ECONOMY = {
  start: 800,
  kill: 300,
  win: 325,
  loss: 200,
  plant: 300,
};

export const ROUND = {
  buySeconds: 12,
  roundSeconds: 100,
  fuseSeconds: 30,
  plantSeconds: 3,
  defuseSeconds: 4,
  winRounds: 7,
  halfRound: 6,
  maxRounds: 13,
};

export const PLAYER = {
  hp: 100,
  armor: 50,
  walkSpeed: 4.6,
  sprintSpeed: 6.6,
  crouchSpeed: 2.6,
  radius: 0.28,
  eyeHeight: 0.5,
};

// A deterministic LCG so screenshot runs are reproducible from a seed.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Shortest-path BFS on the grid; returns a list of {x,y} cell centres to walk through.
export function findPath(sx, sy, tx, ty) {
  const key = (x, y) => y * MAP_W + x;
  const prev = new Map();
  const seen = new Set([key(sx, sy)]);
  const queue = [[sx, sy]];
  const isFloor = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && MAP[y][x] === '.';
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === tx && y === ty) {
      const cells = [];
      let cx = x, cy = y;
      while (!(cx === sx && cy === sy)) {
        cells.unshift({ x: cx + 0.5, y: cy + 0.5 });
        const p = prev.get(key(cx, cy));
        cx = p[0]; cy = p[1];
      }
      return cells;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (isFloor(nx, ny) && !seen.has(key(nx, ny))) {
        seen.add(key(nx, ny));
        prev.set(key(nx, ny), [x, y]);
        queue.push([nx, ny]);
      }
    }
  }
  return [];
}
