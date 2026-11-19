// Solmar Bay 3D — keyboard and mouse input.
// One job: turn DOM events into a small state object the game loop reads.
// The loop consumes the mouse deltas and wheel each frame, so a drag orbits
// the camera exactly once and a wheel notch zooms exactly once.

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.clicked = false;
    this.dragging = false;
    this.anyKey = false;
  }

  attach(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.anyKey = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.dragging = true;
      this.clicked = true;
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Mouse movement since the last frame (consumed once).
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  // Wheel notches since the last frame (consumed once).
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  // A click since the last frame (consumed once).
  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }
}
