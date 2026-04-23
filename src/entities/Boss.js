import Phaser from 'phaser';

// Boss — the Jacked Rat King mini-boss that closes Stage 2.
// A beefed-up StreetRat with a 2-phase state machine:
//   Phase 1 (HP > 50%): slow walk, 250ms wind-up, 400ms cooldown
//   Phase 2 (HP <= 50%): 1.4x speed, 150ms wind-up, 250ms cooldown, red tint
//
// Missing textures are handled at construction time by rendering a tall dark-red
// rectangle placeholder instead of the sprite — the scene's loaderror tracker
// passes those in via `config.useFallback`.

const SCALE = 0.28;
const HIT_TEXTURE_MS = 200;
const KNOCKBACK_DISTANCE = 150;
const KNOCKBACK_MS = 180;

// Attack timings (ms)
const PHASE1_ATTACK_COOLDOWN = 400;
const PHASE1_WINDUP_MS = 250;
const PHASE2_ATTACK_COOLDOWN = 250;
const PHASE2_WINDUP_MS = 150;

// Distance threshold for triggering an attack wind-up.
const ATTACK_RANGE = 120;
// Time between attack attempts while walking toward the player.
const ATTACK_CHECK_INTERVAL = 1500;

// Phase 2 speed multiplier — applied to `config.speed`.
const PHASE2_SPEED_MULT = 1.4;
// Rage tint for phase 2.
const RAGE_TINT = 0xff9999;

// Placeholder rect used when sprite textures failed to load.
const FALLBACK_W = 300;
const FALLBACK_H = 400;
const FALLBACK_COLOR = 0x5a0a0a;

export class Boss {
  constructor(scene, x, y, config = {}) {
    this.scene = scene;
    this.key = config.key ?? 'rat-king';
    this.maxHp = config.hp ?? 150;
    this.hp = this.maxHp;
    this.damage = config.damage ?? 12;
    this.speed = config.speed ?? 90;
    this.contactDamage = config.contactDamage ?? 10;
    this.alive = true;
    this.state = 'idle'; // idle | walking | winding | attacking | hit | defeated
    this.phase = 1;
    this.onDefeat = null;

    this._nextAttackCheckAt = 0;
    this._attackCooldownUntil = 0;
    this._knockbackUntil = 0;

    // Decide fallback vs sprite path. If any of the expected textures is
    // missing we commit to the fallback rect for the whole boss — no
    // partial sprite swapping mid-fight.
    const requiredTextures = [
      `${this.key}-idle`,
      `${this.key}-walk-1`,
      `${this.key}-walk-2`,
      `${this.key}-attack`,
      `${this.key}-hit`,
      `${this.key}-defeat`,
    ];
    const allPresent = requiredTextures.every((k) => scene.textures.exists(k));
    this.useFallback = !allPresent || Boolean(config.useFallback);

    if (this.useFallback) {
      // Tall dark-red rectangle placeholder, feet-anchored.
      this.sprite = scene.add.rectangle(
        x,
        y,
        FALLBACK_W,
        FALLBACK_H,
        FALLBACK_COLOR,
      );
      this.sprite.setOrigin(0.5, 1);
      this.sprite.setStrokeStyle(3, 0x220000);
      scene.physics.add.existing(this.sprite);
      // Rectangle body is already the right world size — center horizontally,
      // anchor at feet. Shrink a little so the hitbox isn't the full rect.
      this.sprite.body.setSize(FALLBACK_W * 0.7, FALLBACK_H * 0.85);
      this.sprite.body.setOffset(FALLBACK_W * 0.15, FALLBACK_H * 0.075);
      this.sprite.body.setCollideWorldBounds(true);
    } else {
      // Sprite path — register walk animation once per scene (idempotent).
      const walkKey = `${this.key}-walk`;
      if (!scene.anims.exists(walkKey)) {
        scene.anims.create({
          key: walkKey,
          frames: [{ key: `${this.key}-walk-1` }, { key: `${this.key}-walk-2` }],
          frameRate: 3, // heavy-footed
          repeat: -1,
        });
      }
      this.sprite = scene.add.sprite(x, y, `${this.key}-idle`);
      this.sprite.setOrigin(0.5, 1);
      this.sprite.setScale(SCALE);
      scene.physics.add.existing(this.sprite);
      // Body sized like player body (220x680 @ 0.18) but scaled up for the
      // 0.28 boss. Sprite source is 1024x1024 like player's.
      this.sprite.body.setSize(280, 820);
      this.sprite.body.setOffset(1024 / 2 - 280 / 2, 1024 - 820);
      this.sprite.body.setCollideWorldBounds(true);
      this.sprite.play(walkKey);
    }
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  _setTexture(suffix) {
    if (this.useFallback || !this.sprite) return;
    const key = `${this.key}-${suffix}`;
    this.sprite.stop();
    this.sprite.setTexture(key);
  }

  _setState(next) {
    if (this.state === next) return;
    this.state = next;

    if (this.useFallback) return; // no texture swaps on the rect

    if (next === 'walking') {
      this.sprite.play(`${this.key}-walk`, true);
    } else if (next === 'winding' || next === 'attacking') {
      // Hold the attack pose — don't animate. Telegraphs the swing.
      this._setTexture('attack');
    } else if (next === 'hit') {
      this._setTexture('hit');
    } else if (next === 'defeated') {
      this._setTexture('defeat');
    } else if (next === 'idle') {
      this._setTexture('idle');
    }
  }

  _updatePhase() {
    const phase2 = this.hp <= this.maxHp * 0.5;
    if (phase2 && this.phase === 1) {
      this.phase = 2;
      // Rage tint persists until defeat (works on both sprite + rect).
      if (this.sprite) this.sprite.setTint(RAGE_TINT);
    }
  }

  _currentSpeed() {
    return this.phase === 2 ? this.speed * PHASE2_SPEED_MULT : this.speed;
  }

  _currentCooldown() {
    return this.phase === 2 ? PHASE2_ATTACK_COOLDOWN : PHASE1_ATTACK_COOLDOWN;
  }

  _currentWindup() {
    return this.phase === 2 ? PHASE2_WINDUP_MS : PHASE1_WINDUP_MS;
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

    // Stay frozen during hit flash and knockback windows.
    if (this.state === 'hit' || now < this._knockbackUntil) {
      return;
    }

    // Mid-attack wind-up or resolve: velocities held at 0, timers drive state.
    if (this.state === 'winding' || this.state === 'attacking') {
      if (this.sprite.body) this.sprite.body.setVelocity(0, 0);
      return;
    }

    this._updatePhase();

    const dx = player.x - this.sprite.x;
    const dy = player.y - this.sprite.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Walk toward the player.
    const speed = this._currentSpeed();
    this.sprite.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);

    // Face player horizontally — sprite path supports flipX; rect is symmetric
    // so flipping is a no-op but harmless.
    if (dx < -1) this.sprite.setFlipX?.(true);
    else if (dx > 1) this.sprite.setFlipX?.(false);

    if (this.state !== 'walking') this._setState('walking');

    // Attack check — throttled by interval + cooldown.
    if (
      now >= this._nextAttackCheckAt &&
      now >= this._attackCooldownUntil &&
      dist < ATTACK_RANGE
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

    // Deal damage if the player is still in range at the resolve moment.
    if (player && player.alive && !player.invulnerable) {
      const dx = player.x - this.sprite.x;
      const dy = player.y - this.sprite.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < ATTACK_RANGE) {
        player.takeDamage(this.damage);
        this.scene.updateHpText?.();
        this.scene.checkGameOver?.();
      }
    }

    // Brief swing hold, then cooldown back to walking.
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

    this.hp -= n;
    this.scene.sound_mgr?.playSfx('sfx_hit');

    // Cancel any in-progress attack — interrupted by the hit.
    this._setState('hit');
    if (this.sprite) {
      // Flash white briefly. After the flash, restore whichever tint
      // `_updatePhase` ends up setting — reading `this.phase` inside the
      // delayed callback captures the post-hp phase (important: the hit may
      // have just pushed us into phase 2).
      this.sprite.setTint(0xffffff);
      this.scene.time.delayedCall(80, () => {
        if (!this.sprite || !this.sprite.scene) return;
        if (this.phase === 2) this.sprite.setTint(RAGE_TINT);
        else this.sprite.clearTint();
      });
    }

    // Knockback opposite from player
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
    } else {
      this._updatePhase();
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
