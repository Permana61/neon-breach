// NEON BREACH — the match: round flow, economy, spike plant/defuse, scoring,
// halftime swap and overtime. One match is first to 7 rounds, max 13 rounds;
// at 6-6 the next round wins.
import { ECONOMY, ROUND, SITE_A, SITE_B, ATTACKER_SPAWN, DEFENDER_SPAWN, WEAPONS, MAP, makeRng } from './config.js';
import { spawnBots, placeBots, botBuy, updateBot } from './bots.js';
import { Grenade, grenadeDamage, applyDamage } from './weapons.js';
import { Player } from './player.js';
import { Renderer } from './raycast.js';
import { buildTextures, buildSprites } from './textures.js';
import { AudioEngine } from './audio.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas, buildTextures(), buildSprites());
    this.audio = new AudioEngine();
    this.player = new Player();
    this.rng = makeRng((Date.now() % 2147483647) || 1);
    this.now = 0;
    this.time = 0;
    this.dt = 0.016;
    this.phase = 'menu'; // menu | buy | live | roundEnd | gameOver
    this.round = 1;
    this.score = { VANGUARD: 0, CINDER: 0 };
    this.attackers = 'VANGUARD';
    this.defenders = 'CINDER';
    this.bots = spawnBots(this);
    this.spike = { state: 'carried', x: 0, y: 0, fuse: 0, carrier: null };
    this.roundTimer = ROUND.roundSeconds;
    this.buyTimer = ROUND.buySeconds;
    this.phaseTimer = 0;
    this.grenades = [];
    this.pickups = [];
    this.killfeed = [];
    this.hitmark = 0;
    this.message = '';
    this.submessage = '';
    this.mvp = null;
    this.slowmo = 1;
    this.onPhaseChange = null;
    this.onKillfeed = null;
    this.onHud = null;
    this.matchKills = { player: 0 };
    this.plantSite = null;
    this.demo = false;
  }

  allActors() {
    const list = [];
    if (this.player.alive) list.push(this.player);
    for (const b of this.bots) if (b.alive) list.push(b);
    return list;
  }

  botHearShot(x, y, team) {
    for (const b of this.bots) {
      if (!b.alive || b.team === team) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < 12) { b.investigate = { x, y }; b.hearAt = this.now; }
    }
  }

  startMatch() {
    this.round = 1;
    this.score = { VANGUARD: 0, CINDER: 0 };
    this.attackers = 'VANGUARD';
    this.defenders = 'CINDER';
    this.player.money = ECONOMY.start;
    for (const b of this.bots) b.money = ECONOMY.start;
    this.matchKills = { player: 0 };
    this.startBuyPhase();
  }

  startBuyPhase() {
    this.phase = 'buy';
    this.buyTimer = ROUND.buySeconds;
    this.roundTimer = ROUND.roundSeconds;
    this.spike = { state: 'carried', x: 0, y: 0, fuse: 0, carrier: null };
    this.grenades = [];
    this.pickups = [
      { kind: 'health', x: 6.5, y: 12.5, taken: false },
      { kind: 'health', x: 17.5, y: 12.5, taken: false },
      { kind: 'ammo', x: 11.5, y: 17.5, taken: false },
    ];
    // place everyone at their spawn
    const atkSpawn = this.attackers === 'VANGUARD' ? ATTACKER_SPAWN : DEFENDER_SPAWN;
    const defSpawn = this.defenders === 'VANGUARD' ? ATTACKER_SPAWN : DEFENDER_SPAWN;
    const pSpawn = this.player.team === this.attackers ? atkSpawn : defSpawn;
    this.player.reset(this.player.team, pSpawn.x - 2, pSpawn.y, this.player.team === this.attackers ? -Math.PI / 2 : Math.PI / 2, this.player.money);
    placeBots(this);
    for (const b of this.bots) botBuy(this, b);
    this.setMessage(`ROUND ${this.round} — BUY PHASE`, 'Press B to shop, then push the site together.');
    if (this.onPhaseChange) this.onPhaseChange('buy');
  }

  startLive() {
    this.phase = 'live';
    this.setMessage('', '');
    if (this.onPhaseChange) this.onPhaseChange('live');
  }

  plantSpike(bot) {
    const site = bot.site || SITE_A;
    this.spike = { state: 'planted', x: (site.x0 + site.x1) / 2, y: (site.y0 + site.y1) / 2, fuse: ROUND.fuseSeconds, carrier: null };
    this.plantSite = site;
    this.player.money += ECONOMY.plant;
    this.setMessage('SPIKE PLANTED — ' + site.name, 'Defend it for 30 seconds. Defenders, defuse it!');
    this.audio.plantDone();
    this.addKillfeed(null, 'SPIKE PLANTED AT ' + site.name, null);
  }

  playerPlant() {
    const site = this.siteAt(this.player.x, this.player.y);
    if (!site) return false;
    if (this.spike.state !== 'carried') return false;
    if (this.player.team !== this.attackers) return false;
    this.plantSpike({ site });
    return true;
  }

  defuseSpike(bot) {
    this.spike = { state: 'defused', x: 0, y: 0, fuse: 0, carrier: null };
    this.endRound(this.defenders, 'SPIKE DEFUSED');
  }

  siteAt(x, y) {
    for (const s of [SITE_A, SITE_B]) {
      if (x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1) return s;
    }
    return null;
  }

  endRound(winner, reason) {
    if (this.phase === 'roundEnd' || this.phase === 'gameOver') return;
    this.score[winner]++;
    const playerWon = winner === this.player.team;
    this.phase = 'roundEnd';
    this.phaseTimer = 4;
    this.slowmo = 0.35;
    // economy
    for (const b of this.bots) {
      b.money += b.team === winner ? ECONOMY.win : ECONOMY.loss;
    }
    this.player.money += this.player.team === winner ? ECONOMY.win : ECONOMY.loss;
    // MVP: most kills this round
    let mvp = this.player;
    for (const b of this.bots) if (b.kills > mvp.kills) mvp = b;
    this.mvp = mvp;
    this.setMessage(reason, `${winner} takes round ${this.round} — MVP: ${mvp.name} (${mvp.kills} kills)`);
    if (playerWon) this.audio.roundWin(); else this.audio.roundLose();
    if (this.onPhaseChange) this.onPhaseChange('roundEnd');
    // match end?
    const w = this.score[winner];
    const l = this.score[winner === 'VANGUARD' ? 'CINDER' : 'VANGUARD'];
    const overtime = this.round >= 12 && this.score.VANGUARD === 6 && this.score.CINDER === 6;
    if (w >= ROUND.winRounds || this.round >= ROUND.maxRounds || overtime) {
      this.endMatch(winner);
    }
  }

  endMatch(winner) {
    this.phase = 'gameOver';
    this.phaseTimer = 0;
    this.setMessage('', '');
    if (this.onPhaseChange) this.onPhaseChange('gameOver');
  }

  nextRound() {
    this.round++;
    if (this.round === ROUND.halfRound + 1) {
      // halftime: swap sides
      const t = this.attackers;
      this.attackers = this.defenders;
      this.defenders = t;
      this.player.team = this.player.team === 'VANGUARD' ? 'CINDER' : 'VANGUARD';
      for (const b of this.bots) b.team = b.team === 'VANGUARD' ? 'CINDER' : 'VANGUARD';
      this.setMessage('HALFTIME — SIDES SWAPPED', 'You are now ' + this.player.team + '.');
    }
    this.startBuyPhase();
  }

  onPlayerHit(target, damage, headshot, killed) {
    this.hitmark = 1;
    this.audio.hit();
    if (killed) {
      this.player.kills++;
      this.matchKills.player++;
      this.player.money += ECONOMY.kill;
      this.audio.kill();
      this.addKillfeed(this.player, target, headshot);
      if (target.kind === 'bot') {
        target.deaths++;
        if (target.isCarrier && this.spike.state === 'carried') {
          // drop the spike where the carrier died
          this.spike.x = target.x; this.spike.y = target.y;
          this.spike.state = 'dropped';
        }
      }
    }
  }

  onBotHit(shooter, target, damage, headshot, killed) {
    if (target === this.player) {
      this.renderer.vignette = Math.min(1, this.renderer.vignette + 0.45);
      this.audio.hurt();
      this.renderer.shake = Math.min(1, this.renderer.shake + 0.25);
    }
    if (killed) {
      shooter.kills++;
      if (target.kind === 'bot') target.deaths++;
      if (target === this.player) {
        this.player.deaths++;
        this.player.alive = false;
        this.setMessage('YOU ARE DOWN', 'Spectating your squad — the round plays on.');
      }
      this.addKillfeed(shooter, target, headshot);
      if (target.kind === 'bot' && target.isCarrier && this.spike.state === 'carried') {
        this.spike.x = target.x; this.spike.y = target.y;
        this.spike.state = 'dropped';
      }
    }
  }

  addKillfeed(killer, victim, headshot) {
    const entry = {
      killer: killer ? killer.name : null,
      killerTeam: killer ? killer.team : null,
      victim: victim ? victim.name : null,
      victimTeam: victim ? victim.team : null,
      headshot: !!headshot,
      text: victim && victim.kind === undefined ? String(victim) : null,
      at: this.now,
    };
    if (typeof victim === 'string') entry.text = victim;
    this.killfeed.unshift(entry);
    if (this.killfeed.length > 5) this.killfeed.pop();
    if (this.onKillfeed) this.onKillfeed(entry);
  }

  throwGrenade() {
    if (this.player.grenades <= 0) return;
    this.player.grenades--;
    const g = new Grenade(this.player.x, this.player.y, this.player.angle, this.player.team);
    this.grenades.push(g);
    this.audio.blip(700, 0.08, 'sine', 0.15);
  }

  update(dt, input) {
    this.dt = dt;
    this.now += dt;
    this.time += dt;
    if (this.slowmo < 1) this.slowmo = Math.min(1, this.slowmo + dt * 0.25);
    const sdt = dt * this.slowmo;
    this.hitmark = Math.max(0, this.hitmark - dt * 3);

    if (this.phase === 'buy') {
      this.buyTimer -= dt;
      if (this.buyTimer <= 0) this.startLive();
    } else if (this.phase === 'live') {
      this.roundTimer -= dt;
      // spike fuse
      if (this.spike.state === 'planted') {
        this.spike.fuse -= dt;
        if (Math.floor(this.spike.fuse * 2) !== Math.floor((this.spike.fuse + dt) * 2)) this.audio.plantBeep();
        if (this.spike.fuse <= 0) {
          this.audio.explosion();
          this.renderer.shake = 1;
          this.endRound(this.attackers, 'SPIKE DETONATED');
        }
      }
      if (this.roundTimer <= 0 && this.spike.state !== 'planted') {
        this.endRound(this.defenders, 'TIME EXPIRED — SITE HELD');
      }
      // player plant/defuse progress (hold E)
      if (input.keys['KeyE'] && this.player.alive) {
        const site = this.siteAt(this.player.x, this.player.y);
        if (this.player.team === this.attackers && this.spike.state === 'carried' && site) {
          this.player.plantProgress += dt;
          if (this.player.plantProgress >= ROUND.plantSeconds) {
            this.playerPlant();
            this.player.plantProgress = 0;
          }
        } else if (this.player.team === this.defenders && this.spike.state === 'planted') {
          const d = Math.hypot(this.player.x - this.spike.x, this.player.y - this.spike.y);
          if (d < 1.6) {
            this.player.defuseProgress += dt;
            if (this.player.defuseProgress >= ROUND.defuseSeconds) {
              this.defuseSpike(this.player);
              this.player.defuseProgress = 0;
            }
          }
        }
      } else {
        this.player.plantProgress = 0;
        this.player.defuseProgress = 0;
      }
      // pickups
      for (const pk of this.pickups) {
        if (pk.taken) continue;
        const d = Math.hypot(this.player.x - pk.x, this.player.y - pk.y);
        if (d < 0.6) {
          pk.taken = true;
          if (pk.kind === 'health') { this.player.hp = Math.min(100, this.player.hp + 50); this.audio.plantDone(); }
          else { this.player.weapon.reserve = this.player.weapon.def.reserve; this.audio.buy(); }
        }
      }
      // grenades
      for (const g of this.grenades) {
        if (g.update(sdt, (x, y) => {
          if (x < 0 || y < 0 || x >= 24 || y >= 24) return true;
          const row = MAP[y];
          return row ? row[x] !== '.' : true;
        })) {
          // explode
          const hits = grenadeDamage(g.x, g.y, this.allActors(), (ax, ay, bx, by) => this.renderer.hasLOS(ax, ay, bx, by));
          for (const h of hits) {
            const killed = applyDamage(h.target, h.damage, this);
            if (h.target === this.player) { this.renderer.vignette = 1; this.audio.hurt(); }
            if (killed && h.target.kind === 'bot') h.target.deaths++;
          }
          const sp = this.renderer.projectToScreen(this, g.x, g.y);
          if (!sp.behind) this.renderer.addBurst(sp.x, sp.y, '#ff8c1a', 26);
          this.audio.explosion();
          this.renderer.shake = Math.min(1, this.renderer.shake + 0.5);
        }
      }
      this.grenades = this.grenades.filter((g) => !g.dead);
      // player + bots
      this.player.update(sdt, input, this);
      for (const b of this.bots) updateBot(this, b, sdt);
      // round end by elimination
      const atkAlive = this.allActors().filter((a) => a.team === this.attackers && a.alive).length;
      const defAlive = this.allActors().filter((a) => a.team === this.defenders && a.alive).length;
      if (atkAlive === 0 && this.spike.state !== 'planted') this.endRound(this.defenders, 'SQUAD WIPED');
      else if (defAlive === 0) this.endRound(this.attackers, 'SITE CLEARED');
    } else if (this.phase === 'roundEnd') {
      this.phaseTimer -= dt;
      for (const b of this.bots) updateBot(this, b, sdt * 0.3);
      if (this.phaseTimer <= 0) {
        this.slowmo = 1;
        this.nextRound();
      }
    }
  }

  setMessage(msg, sub) {
    this.message = msg;
    this.submessage = sub || '';
  }

  render() {
    this.renderer.render(this);
  }
}
