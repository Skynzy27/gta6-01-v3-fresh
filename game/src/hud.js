// Solmar Bay 3D — the HUD.
// One job: every pixel of interface. Wanted stars, cash, health, speed and
// ammo as DOM; the minimap as a 2D canvas drawn top-down each frame; the
// start, pause and busted screens as overlays. The game loop calls the
// setters; this class never decides game state.

export class Hud {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.starsEl = this.el('stars');
    this.cashEl = this.el('cash');
    this.healthFill = this.el('health-fill');
    this.speedEl = this.el('speed');
    this.ammoEl = this.el('ammo');
    this.objectiveEl = this.el('objective');
    this.messageEl = this.el('message');
    this.hintEl = this.el('hint');
    this.crosshairEl = this.el('crosshair');
    this.menuEl = this.el('menu');
    this.pauseEl = this.el('pause');
    this.endEl = this.el('end');
    this.endTitle = this.el('end-title');
    this.endText = this.el('end-text');
    this.minimap = this.el('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.messageT = 0;
    this.onPlay = null;
    this.onContinue = null;
    this.onResume = null;
    this.onRespawn = null;
    this.el('btn-play').addEventListener('click', () => this.onPlay && this.onPlay());
    this.el('btn-continue').addEventListener('click', () => this.onContinue && this.onContinue());
    this.el('btn-resume').addEventListener('click', () => this.onResume && this.onResume());
    this.el('btn-respawn').addEventListener('click', () => this.onRespawn && this.onRespawn());
  }

  setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    if (this.starsEl.textContent !== s) this.starsEl.textContent = s;
    this.starsEl.classList.toggle('hot', n >= 3);
  }

  setCash(n) {
    const t = `$${Math.floor(n).toLocaleString('en-US')}`;
    if (this.cashEl.textContent !== t) this.cashEl.textContent = t;
  }

  setHealth(h) {
    this.healthFill.style.width = `${Math.max(0, Math.min(100, h))}%`;
  }

  setSpeed(kmh) {
    if (kmh === null) {
      this.speedEl.style.display = 'none';
      return;
    }
    this.speedEl.style.display = 'block';
    this.speedEl.textContent = `${Math.round(kmh)} km/h`;
  }

  setAmmo(n) {
    if (n === null) {
      this.ammoEl.style.display = 'none';
      return;
    }
    this.ammoEl.style.display = 'block';
    this.ammoEl.textContent = `▸ ${n} / 12`;
  }

  setObjective(text) {
    if (this.objectiveEl.textContent !== text) this.objectiveEl.textContent = text;
  }

  toast(text, seconds = 4) {
    this.messageEl.textContent = text;
    this.messageEl.style.opacity = '1';
    this.messageT = seconds;
  }

  updateToast(dt) {
    if (this.messageT > 0) {
      this.messageT -= dt;
      if (this.messageT <= 0) this.messageEl.style.opacity = '0';
    }
  }

  setHint(text) {
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
  }

  setCrosshair(show) {
    this.crosshairEl.style.display = show ? 'block' : 'none';
  }

  showMenu(hasSave) {
    this.menuEl.style.display = 'flex';
    this.el('btn-continue').style.display = hasSave ? 'inline-block' : 'none';
  }

  hideMenu() {
    this.menuEl.style.display = 'none';
  }

  showPause(show) {
    this.pauseEl.style.display = show ? 'flex' : 'none';
  }

  showEnd(kind, text) {
    this.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    this.endText.textContent = text;
    this.endEl.style.display = 'flex';
  }

  hideEnd() {
    this.endEl.style.display = 'none';
  }

  // Top-down minimap: roads, blocks, ocean, waypoint, police, traffic, you.
  drawMinimap(view) {
    const ctx = this.mapCtx;
    const S = 180;
    const half = view.half;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(12, 12, 20, 0.82)';
    ctx.fillRect(0, 0, S, S);
    // Ocean on the west edge.
    ctx.fillStyle = '#27355e';
    const [ox] = toMap(view.beachX, 0);
    ctx.fillRect(0, 0, ox, S);
    // Roads.
    ctx.strokeStyle = '#5a5a66';
    ctx.lineWidth = 4;
    for (let c = -half; c <= half; c += 40) {
      const [x] = toMap(c, 0);
      const [, z] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(S, z); ctx.stroke();
    }
    // Waypoint.
    if (view.waypoint) {
      const [x, y] = toMap(view.waypoint.x, view.waypoint.z);
      ctx.fillStyle = '#ffd24e';
      ctx.beginPath();
      ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 6, y);
      ctx.closePath(); ctx.fill();
    }
    // Traffic (white) and police (red).
    ctx.fillStyle = '#d8d8e0';
    for (const c of view.traffic) {
      const [x, y] = toMap(c.x, c.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    ctx.fillStyle = '#ff3b30';
    for (const c of view.police) {
      const [x, y] = toMap(c.x, c.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // The player: a green arrow that turns with the heading. The arrow is
    // drawn pointing up; on the map +z is down, so the heading rotates it
    // by PI - heading (PI when facing south, 0 when facing north).
    const [px, py] = toMap(view.player.x, view.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - view.heading);
    ctx.fillStyle = '#39d353';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#e0e0e0';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', S - 14, 14);
  }
}
