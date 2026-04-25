// TouchControls — on-screen D-pad + attack button for iPad/touch play.
//
// Design: zero changes to Player.js or any scene. We detect touch devices,
// mount a DOM overlay, and synthesize keyboard events on `window` when
// buttons are pressed. Phaser's keyboard plugin listens on `window` by
// default, so the existing `cursors.left.isDown` / `keys.attack` code
// picks up our events transparently.
//
// Pointer events (not touch events) are used so multi-touch works and
// pointerId tracking handles diagonals (up+right pressed together) and
// finger-slides-off-button cleanly.

const BUTTON_MAP = {
  up:     { key: 'ArrowUp',    code: 'ArrowUp',    keyCode: 38 },
  down:   { key: 'ArrowDown',  code: 'ArrowDown',  keyCode: 40 },
  left:   { key: 'ArrowLeft',  code: 'ArrowLeft',  keyCode: 37 },
  right:  { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  attack: { key: 'z',          code: 'KeyZ',       keyCode: 90 },
};

const CSS = `
.psh-touch-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: none;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  font-family: system-ui, -apple-system, sans-serif;
}
.psh-touch-overlay * {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}
.psh-touch-dpad {
  --psh-dpad-btn: clamp(56px, 8.25vw, 78px);
  --psh-dpad-step: calc(var(--psh-dpad-btn) * 0.83);
  position: absolute;
  left: max(12px, 2.5vw);
  bottom: max(12px, 3vh);
  width: calc(var(--psh-dpad-btn) + var(--psh-dpad-step) * 2);
  height: calc(var(--psh-dpad-btn) + var(--psh-dpad-step) * 2);
}
.psh-touch-dpad .psh-btn {
  position: absolute;
  width: var(--psh-dpad-btn);
  height: var(--psh-dpad-btn);
  font-size: clamp(30px, 5vw, 44px);
}
.psh-touch-dpad .psh-btn[data-psh="up"] { left: var(--psh-dpad-step); top: 0; }
.psh-touch-dpad .psh-btn[data-psh="left"] { left: 0; top: var(--psh-dpad-step); }
.psh-touch-dpad .psh-btn[data-psh="right"] { right: 0; top: var(--psh-dpad-step); }
.psh-touch-dpad .psh-btn[data-psh="down"] { left: var(--psh-dpad-step); bottom: 0; }
.psh-touch-attack {
  position: absolute;
  right: 4vw;
  bottom: 6vh;
}
.psh-touch-attack .psh-btn {
  width: 22vw; height: 22vw;
  max-width: 150px; max-height: 150px;
  border-radius: 50%;
  font-size: 8vw;
}
.psh-touch-chip {
  position: absolute;
  top: max(6px, env(safe-area-inset-top));
  pointer-events: auto;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(0,0,0,0.45);
  color: #fff;
  font-size: 12px;
  border: 1px solid rgba(255,255,255,0.3);
  opacity: 0.7;
}
.psh-touch-reset { left: max(6px, env(safe-area-inset-left)); }
.psh-touch-fs { right: max(6px, env(safe-area-inset-right)); }
.psh-btn {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%; height: 100%;
  background: rgba(255,255,255,0.18);
  border: 2px solid rgba(255,255,255,0.55);
  color: #fff;
  border-radius: 14px;
  font-size: clamp(28px, 6vw, 54px);
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
  opacity: 0.55;
  transition: background 0.05s, transform 0.05s;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.psh-btn.active {
  background: rgba(255,230,120,0.55);
  transform: scale(0.94);
  opacity: 0.85;
}
.psh-touch-attack .psh-btn {
  background: rgba(220,60,60,0.35);
  border-color: rgba(255,150,150,0.8);
}
.psh-touch-attack .psh-btn.active {
  background: rgba(255,120,120,0.7);
}
.psh-dpad-spacer { display: none; }
`;

export class TouchControls {
  constructor() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!this._isTouchDevice()) return;
    this._installZoomGuard();
    if (document.getElementById('psh-touch-overlay-root')) return; // idempotent

    // pointerId -> button name. A finger can only press one button at a
    // time (if it slides onto another we release the old one first).
    this._activePointers = new Map();
    // button name -> HTMLElement. For quick lookup on pointermove.
    this._buttons = {};
    // Button name -> true while key is "held down" (any pointer pressing it).
    this._held = {};

    this._injectStyle();
    this._buildOverlay();
  }

  _isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  }

  _installZoomGuard() {
    if (window.__pshZoomGuardInstalled) return;
    window.__pshZoomGuardInstalled = true;

    const prevent = (e) => e.preventDefault();

    // iOS Safari gesture events cover pinch zoom. The touchmove fallback
    // covers Chromium/Android multi-touch and older WebKit builds.
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(type, prevent, { passive: false, capture: true });
    }
    document.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches && e.touches.length > 1) e.preventDefault();
      },
      { passive: false, capture: true }
    );

    // Suppress double-tap zoom without blocking normal single-tap controls.
    let lastTouchEnd = 0;
    document.addEventListener(
      'touchend',
      (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 350) e.preventDefault();
        lastTouchEnd = now;
      },
      { passive: false, capture: true }
    );
  }

  _injectStyle() {
    if (document.getElementById('psh-touch-style')) return;
    const style = document.createElement('style');
    style.id = 'psh-touch-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  _buildOverlay() {
    const root = document.createElement('div');
    root.id = 'psh-touch-overlay-root';
    root.className = 'psh-touch-overlay';

    // D-pad: four absolute buttons around a tight center gap.
    const dpad = document.createElement('div');
    dpad.className = 'psh-touch-dpad';
    const layout = [
      '',     'up',   '',
      'left', '',     'right',
      '',     'down', '',
    ];
    for (const slot of layout) {
      if (!slot) {
        const sp = document.createElement('div');
        sp.className = 'psh-dpad-spacer';
        dpad.appendChild(sp);
        continue;
      }
      dpad.appendChild(this._makeButton(slot, this._glyph(slot)));
    }

    const attackWrap = document.createElement('div');
    attackWrap.className = 'psh-touch-attack';
    attackWrap.appendChild(this._makeButton('attack', '⚔'));

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'psh-touch-chip psh-touch-reset';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.reload();
    });

    // Fullscreen chip — optional. Best-effort; will no-op if unsupported.
    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className = 'psh-touch-chip psh-touch-fs';
    fsBtn.textContent = 'Fullscreen';
    fsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const el = document.documentElement;
      const fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (fn) {
        try { fn.call(el); } catch (_) {}
      }
    });

    root.appendChild(dpad);
    root.appendChild(attackWrap);
    root.appendChild(resetBtn);
    root.appendChild(fsBtn);
    document.body.appendChild(root);

    // Global listeners to handle pointers moving off a button while still
    // pressed (finger slides away) and cancellations.
    window.addEventListener('pointerup', (e) => this._onGlobalRelease(e), true);
    window.addEventListener('pointercancel', (e) => this._onGlobalRelease(e), true);
    window.addEventListener('pointermove', (e) => this._onGlobalMove(e), true);
  }

  _glyph(name) {
    return { up: '▲', down: '▼', left: '◀', right: '▶' }[name] || name;
  }

  _makeButton(name, label) {
    const btn = document.createElement('div');
    btn.className = 'psh-btn';
    btn.dataset.psh = name;
    btn.textContent = label;
    this._buttons[name] = btn;

    const onDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // If this pointer was already pressing a different button, release it.
      const prev = this._activePointers.get(e.pointerId);
      if (prev && prev !== name) this._releaseButton(prev, e.pointerId);
      this._activePointers.set(e.pointerId, name);
      this._pressButton(name);
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    };
    btn.addEventListener('pointerdown', onDown);
    // Prevent iOS from showing callouts / selection on long-press
    btn.addEventListener('contextmenu', (e) => e.preventDefault());

    return btn;
  }

  _onGlobalRelease(e) {
    const name = this._activePointers.get(e.pointerId);
    if (!name) return;
    this._releaseButton(name, e.pointerId);
  }

  _onGlobalMove(e) {
    // If this pointer isn't pressing anything we track, ignore.
    const currentName = this._activePointers.get(e.pointerId);
    if (!currentName) return;
    // Find which (if any) button is under the pointer.
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const hitName = (el && el.classList && el.classList.contains('psh-btn')) ? el.dataset.psh : null;
    if (hitName === currentName) return;
    // Slid off — release old.
    this._releaseButton(currentName, e.pointerId);
    // If slid onto a new button, press that.
    if (hitName) {
      this._activePointers.set(e.pointerId, hitName);
      this._pressButton(hitName);
    }
  }

  _pressButton(name) {
    if (this._held[name]) return; // already down
    this._held[name] = true;
    const btn = this._buttons[name];
    if (btn) btn.classList.add('active');
    this._dispatchKey('keydown', BUTTON_MAP[name]);
  }

  _releaseButton(name, pointerId) {
    if (pointerId != null) this._activePointers.delete(pointerId);
    // If some other pointer is still holding the same button, don't release.
    for (const v of this._activePointers.values()) {
      if (v === name) return;
    }
    if (!this._held[name]) return;
    this._held[name] = false;
    const btn = this._buttons[name];
    if (btn) btn.classList.remove('active');
    this._dispatchKey('keyup', BUTTON_MAP[name]);
  }

  _dispatchKey(type, spec) {
    if (!spec) return;
    const ev = new KeyboardEvent(type, {
      key: spec.key,
      code: spec.code,
      keyCode: spec.keyCode,
      which: spec.keyCode,
      bubbles: true,
      cancelable: true,
    });
    // Some browsers refuse to set keyCode/which via the constructor; force them.
    try {
      Object.defineProperty(ev, 'keyCode', { get: () => spec.keyCode });
      Object.defineProperty(ev, 'which',   { get: () => spec.keyCode });
    } catch (_) {}
    window.dispatchEvent(ev);
  }
}
