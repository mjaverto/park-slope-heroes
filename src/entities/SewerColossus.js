import Phaser from 'phaser';

// SewerColossus — the final boss that closes Stage 3 at Grand Army Plaza.
// A 2-phase hulking enemy whose phase transition is a dramatic beat:
//   Phase 1 (HP > 50%): slower walk, 260ms wind-up, 420ms cooldown.
//     Uses the `<key>-p1-*` texture set.
//   Phase 2 (HP <= 50%): buffed speed/damage, 140ms wind-up, 230ms cooldown,
//     larger scale, red-hot tint. Uses the `<key>-p2-*` texture set.
//
// Transition: freeze movement ~600ms, white flash, screen shake, swap texture
// prefix, scale up, buff stats. Replicates Boss.js's fallback pattern — if any
// phase's textures are missing, that phase renders as a tinted rectangle
// (dark-green placeholder for p1, bright-red for p2).
//
// This class intentionally does NOT import from Boss.js — it's self-contained
// so each can evolve independently.

const BASE_SCALE = 0.30;
const PHASE2_SCALE_MULT = 1.15;
const HIT_TEXTURE_MS = 200;
const KNOCKBACK_DISTANCE = 160;
const KNOCKBACK_MS = 180;

// Phase transition tuning
const PHASE_TRANSITION_MS = 600;
const SHAKE_MS = 500;
const SHAKE_INTENSITY = 0.008;

// Attack timings (ms)
const PHASE1_ATTACK_COOLDOWN = 420;
const PHASE1_WINDUP_MS = 260;
const PHASE2_ATTACK_COOLDOWN = 230;
const PHASE2_WINDUP_MS = 140;

// Distance threshold for triggering a wind-up. Phase 2 reaches further.
const PHASE1_ATTACK_RANGE = 130;
const PHASE2_ATTACK_RANGE = 170;

// Time between attack attempts while walking toward the player.
const ATTACK_CHECK_INTERVAL = 1400;

// Phase-2 rage tint (red-hot); applied on top of the p2 sprite.
const RAGE_TINT = 0xff6666;

// Placeholder rect used when a phase's sprites failed to load.
const FALLBACK_W = 340;
const FALLBACK_H = 460;
const FALLBACK_COLOR_P1 = 0x184a2a; // dark sewer green
const FALLBACK_COLOR_P2 = 0xcc1a1a; // glowing red

export class SewerColossus {
  constructor(scene, x, y, config = {}) {
    this.scene = scene;
    this.key = config.key ?? 'sewer-colossus';
    this.maxHp = config.hp ?? 250;
    this.hp = this.maxHp;
    this.contactDamage = config.contactDamage ?? 12;
    this.alive = true;
    this.state = 'idle'; // idle | walking | winding | attacking | hit | defeated | transitioning
    this.phase = 1;
    this.transitioning = false;
    this.onDefeat = null;

    // Phase stat bundles — each has damage, speed, and a spriteKey prefix.
    this.phase1 = {
      damage: config.phase1?.damage ?? 15,
      speed: config.phase1?.speed ?? 80,
      spriteKey: config.phase1?.spriteKey ?? `${this.key}-p1`,
    };
    this.phase2 = {
      damage: config.phase2?.damage ?? 22,
      speed: config.phase2?.speed ?? 120,
      spriteKey: config.phase2?.spriteKey ?? `${this.key}-p2`,
    };

    // Active stats mirror `phase1` until transition swaps them.
    this.damage = this.phase1.damage;
    this.speed = this.phase1.speed;
    this.textureKey = this.phase1.spriteKey;

    this._nextAttackCheckAt = 0;
    this._attackCooldownUntil = 0;
    this._knockbackUntil = 0;

    // Per-phase fallback detection. If any of the 6 sprites for a phase is
    // missing we commit to the rect fallback for that phase.
    this.useFallbackP1 = !this._phaseTexturesPresent(this.phase1.spriteKey) || Boolean(config.useFallback);
    this.useFallbackP2 = !this._phaseTexturesPresent(this.phase2.spriteKey) || Boolean(config.useFallback);
    this.useFallback = this.useFallbackP1;

    this._buildSprite(x, y);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  _phaseTexturesPresent(prefix) {
    const required = [
      `${prefix}-idle`,
      `${prefix}-walk-1`,
      `${prefix}-walk-2`,
      `${prefix}-attack`,
      `${prefix}-hit`,
      `${prefix}-defeat`,
    ];
    return required.every((k) => this.scene.textures.exists(k));
  }

  // Build the initial phase-1 display object + physics body. Called once.
  _buildSprite(x, y) {
    if (this.useFallbackP1) {
      this.sprite = this.scene.add.rectangle(
        x,
        y,
        FALLBACK_W,
        FALLBACK_H,
        FALLBACK_COLOR_P1,
      );
      this.sprite.setOrigin(0.5, 1);
      this.sprite.setStrokeStyle(3, 0x061a10);
      this.scene.physics.add.existing(this.sprite);
      this.sprite.body.setSize(FALLBACK_W * 0.7, FALLBACK_H * 0.85);
      this.sprite.body.setOffset(FALLBACK_W * 0.15, FALLBACK_H * 0.075);
      this.sprite.body.setCollideWorldBounds(true);
    } else {
      this._ensureWalkAnim(this.phase1.spriteKey);
      this.sprite = this.scene.add.sprite(x, y, `${this.phase1.spriteKey}-idle`);
      this.sprite.setOrigin(0.5, 1);
      this.sprite.setScale(BASE_SCALE);
      this.scene.physics.add.existing(this.sprite);
      // Same body tuning as Boss.js for 1024x1024 sprite sources.
      this.sprite.body.setSize(280, 820);
      this.sprite.body.setOffset(1024 / 2 - 280 / 2, 1024 - 820);
      this.sprite.body.setCollideWorldBounds(true);
      this.sprite.play(`${this.phase1.spriteKey}-walk`);
    }
  }

  _ensureWalkAnim(prefix) {
    const walkKey = `${prefix}-walk`;
    if (!this.scene.anims.exists(walkKey)) {
      this.scene.anims.create({
        key: walkKey,
        frames: [{ key: `${prefix}-walk-1` }, { key: `${prefix}-walk-2` }],
        frameRate: 3,
        repeat: -1,
      });
    }
  }

  _setTexture(suffix) {
    if (this.useFallback || !this.sprite) return;
    const key = `${this.textureKey}-${suffix}`;
    this.sprite.stop();
    this.sprite.setTexture(key);
  }

  _setState(next) {
    if (this.state === next) return;
    this.state = next;

    if (this.useFallback) return; // no texture swaps on the rect

    if (next === 'walking') {
      this.sprite.play(`${this.textureKey}-walk`, true);
    } else if (next === 'winding' || next === 'attacking') {
      this._setTexture('attack');
    } else if (next === 'hit') {
      this._setTexture('hit');
    } else if (next === 'defeated') {
      this._setTexture('defeat');
    } else if (next === 'idle') {
      this._setTexture('idle');
    }
  }

  _currentSpeed() {
    return this.speed;
  }

  _currentCooldown() {
    return this.phase === 2 ? PHASE2_ATTACK_COOLDOWN : PHASE1_ATTACK_COOLDOWN;
  }

  _currentWindup() {
    return this.phase === 2 ? PHASE2_WINDUP_MS : PHASE1_WINDUP_MS;
  }

  _currentAttackRange() {
    return this.phase === 2 ? PHASE2_ATTACK_RANGE : PHASE1_ATTACK_RANGE;
  }

  // ── Phase transition ─────────────────────────────────────────────────────

  _triggerPhaseTransition() {
    if (this.phase !== 1 || this.transitioning || !this.alive) return;
    this.transitioning = true;
    this._setState('transitioning');

    // Freeze movement + hold a neutral pose.
    if (this.sprite && this.sprite.body) this.sprite.body.setVelocity(0, 0);

    // White flash + screen shake.
    if (this.sprite) this.sprite.setTint(0xffffff);
    this.scene.cameras.main.shake(SHAKE_MS, SHAKE_INTENSITY);

    // Notify scene so boss HUD label can update.
    this.scene.onBossPhaseChange?.(2);

    this.scene.time.delayedCall(PHASE_TRANSITION_MS, () => {
      if (!this.alive) return;
      this._enterPhase2();
    });
  }

  _enterPhase2() {
    this.phase = 2;
    this.damage = this.phase2.damage;
    this.speed = this.phase2.speed;

    // Swap the render path entirely — different fallback flag per phase.
    if (this.useFallbackP2) {
      // If phase-1 was a sprite but phase-2 sprites are missing, rebuild as
      // a rectangle. Destroy old and create fresh so the body stays clean.
      const oldX = this.sprite.x;
      const oldY = this.sprite.y;
      if (this.sprite) this.sprite.destroy();
      this.useFallback = true;
      this.sprite = this.scene.add.rectangle(
        oldX,
        oldY,
        FALLBACK_W * PHASE2_SCALE_MULT,
        FALLBACK_H * PHASE2_SCALE_MULT,
        FALLBACK_COLOR_P2,
      );
      this.sprite.setOrigin(0.5, 1);
      this.sprite.setStrokeStyle(3, 0x2a0000);
      this.scene.physics.add.existing(this.sprite);
      const bw = FALLBACK_W * PHASE2_SCALE_MULT;
      const bh = FALLBACK_H * PHASE2_SCALE_MULT;
      this.sprite.body.setSize(bw * 0.7, bh * 0.85);
      this.sprite.body.setOffset(bw * 0.15, bh * 0.075);
      this.sprite.body.setCollideWorldBounds(true);
    } else if (this.useFallbackP1) {
      // Phase-1 was rect, phase-2 has sprites: promote to sprite.
      const oldX = this.sprite.x;
      const oldY = this.sprite.y;
      if (this.sprite) this.sprite.destroy();
      this.useFallback = false;
      this.textureKey = this.phase2.spriteKey;
      this._ensureWalkAnim(this.phase2.spriteKey);
      this.sprite = this.scene.add.sprite(oldX, oldY, `${this.phase2.spriteKey}-idle`);
      this.sprite.setOrigin(0.5, 1);
      this.sprite.setScale(BASE_SCALE * PHASE2_SCALE_MULT);
      this.scene.physics.add.existing(this.sprite);
      this.sprite.body.setSize(280, 820);
      this.sprite.body.setOffset(1024 / 2 - 280 / 2, 1024 - 820);
      this.sprite.body.setCollideWorldBounds(true);
      this.sprite.setTint(RAGE_TINT);
    } else {
      // Both phases sprite-backed — swap textureKey + anim, bump scale.
      this.textureKey = this.phase2.spriteKey;
      this._ensureWalkAnim(this.phase2.spriteKey);
      this.sprite.setScale(BASE_SCALE * PHASE2_SCALE_MULT);
      this.sprite.setTexture(`${this.phase2.spriteKey}-idle`);
      this.sprite.setTint(RAGE_TINT);
    }

    this.transitioning = false;
    this._setState('walking');
  }

  update(player) {
    if (!this.alive || this.state === 'defeated') {
      if (this.sprite && this.sprite.body) this.sprite.body.setVelocity(0, 0);
      return;
    }
    if (!player || !player.alive) {
      if (this.sprite && this.sprite.body) this.sprite.body.setVelocity(0, 0);
      return;
    }

    const now = this.scene.time.now;

    // Hold still during the phase transition window.
    if (this.transitioning || this.state === 'transitioning') {
      if (this.sprite && this.sprite.body) this.sprite.body.setVelocity(0, 0);
      return;
    }

    // Stay frozen during hit flash and knockback windows.
    if (this.state === 'hit' || now < this._knockbackUntil) {
      return;
    }

    // Mid-attack wind-up or resolve: velocities held at 0, timers drive state.
    if (this.state === 'winding' || this.state === 'attacking') {
      if (this.sprite.body) this.sprite.body.setVelocity(0, 0);
      return;
    }

    const dx = player.x - this.sprite.x;
    const dy = player.y - this.sprite.y;
    const dist = Math.hypot(dx, dy) || 1;

    const speed = this._currentSpeed();
    this.sprite.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);

    if (dx < -1) this.sprite.setFlipX?.(true);
    else if (dx > 1) this.sprite.setFlipX?.(false);

    if (this.state !== 'walking') this._setState('walking');

    const atkRange = this._currentAttackRange();
    if (
      now >= this._nextAttackCheckAt &&
      now >= this._attackCooldownUntil &&
      dist < atkRange
    ) {
      this._nextAttackCheckAt = now + ATTACK_CHECK_INTERVAL;
      this._beginAttack(player);
    }
  }

  _beginAttack(player) {
    if (!this.alive) return;
    this._setState('winding');
    if (this.sprite.body) this.sprite.body.setVelocity(0, 0);

    const windup = this._currentWindup();
    this.scene.time.delayedCall(windup, () => {
      if (!this.alive || this.state !== 'winding') return;
      this._resolveAttack(player);
    });
  }

  _resolveAttack(player) {
    this._setState('attacking');

    if (player && player.alive && !player.invulnerable) {
      const dx = player.x - this.sprite.x;
      const dy = player.y - this.sprite.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < this._currentAttackRange()) {
        player.takeDamage(this.damage);
        this.scene.updateHpText?.();
        this.scene.checkGameOver?.();
      }
    }

    const cooldown = this._currentCooldown();
    this.scene.time.delayedCall(120, () => {
      if (!this.alive) return;
      if (this.state === 'attacking') {
        this._attackCooldownUntil = this.scene.time.now + cooldown;
        this._setState('walking');
      }
    });
  }

  takeDamage(n) {
    if (!this.alive || this.state === 'defeated') return;
    // During the transition window we still accept damage but don't overwrite
    // the frozen transition pose. The phase-flash takes precedence visually.
    if (this.transitioning) {
      this.hp -= n;
      if (this.hp <= 0) {
        this.hp = 0;
        this._die();
      }
      return;
    }

    this.hp -= n;
    this.scene.sound_mgr?.playSfx('sfx_hit');

    this._setState('hit');
    if (this.sprite) {
      this.sprite.setTint(0xffffff);
      this.scene.time.delayedCall(80, () => {
        if (!this.sprite || !this.sprite.scene) return;
        if (this.phase === 2) this.sprite.setTint(RAGE_TINT);
        else this.sprite.clearTint();
      });
    }

    if (this.sprite && this.sprite.body) {
      const player = this.scene.player;
      let dirX = -1;
      if (player) {
        dirX = this.sprite.x < player.x ? -1 : 1;
      }
      const vx = dirX * (KNOCKBACK_DISTANCE * 1000 / KNOCKBACK_MS);
      this.sprite.body.setVelocity(vx, 0);
      this._knockbackUntil = this.scene.time.now + KNOCKBACK_MS;
    }

    this.scene.time.delayedCall(HIT_TEXTURE_MS, () => {
      if (!this.alive) return;
      if (this.state === 'hit') {
        this._setState('walking');
      }
    });

    if (this.hp <= 0) {
      this.hp = 0;
      this._die();
      return;
    }

    // 50% HP → trigger phase 2 transition.
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this._triggerPhaseTransition();
    }
  }

  _die() {
    this.alive = false;
    this._setState('defeated');
    this.scene.sound_mgr?.playSfx('sfx_enemy_death');
    if (this.sprite && this.sprite.body) {
      this.sprite.body.setVelocity(0, 0);
      this.sprite.body.enable = false;
    }
    if (typeof this.onDefeat === 'function') {
      this.onDefeat();
    }
  }
}
