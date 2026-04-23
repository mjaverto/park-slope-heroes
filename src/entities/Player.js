import Phaser from 'phaser';

const SPEED = 200;
const ATTACK_LIFETIME_MS = 150;
const ATTACK_SIZE = 16;
// Katana reach: sprite's swung weapon extends further than the original 32-wide rectangle,
// so we push the hitbox out to 45 to match what the eye sees.
const ATTACK_OFFSET = 45;
const INVULN_MS = 200;
const KNOCKBACK = 220;
const SCALE = 0.18;
// Hit state duration when the player takes damage — shows the hit texture briefly.
const HIT_TEXTURE_MS = 200;

export class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.maxHp = 100;
    this.hp = 100;
    this.facing = 'right';
    this.invulnerable = false;
    this.attacking = false;
    this.alive = true;
    this.state = 'idle'; // idle | walking | attacking | hit

    this.sprite = scene.add.sprite(x, y, 'aiden-idle');
    this.sprite.setOrigin(0.5, 1); // feet anchor for 2.5D depth sort
    this.sprite.setScale(SCALE);

    scene.physics.add.existing(this.sprite);
    // Keep the hitbox tight for game feel — the visible sprite is big but the body is small.
    // Arcade body size is in sprite-local px (pre-scale), so 220x680 at 0.18 => ~40x122 world px.
    this.sprite.body.setSize(220, 680);
    // Center the body on the sprite's feet-anchored origin:
    // sprite is 1024x1024 local, origin (0.5, 1). We want the body centered horizontally and
    // anchored near the feet. offset is measured from the sprite's top-left (local).
    this.sprite.body.setOffset(1024 / 2 - 220 / 2, 1024 - 680);
    this.sprite.body.setCollideWorldBounds(true);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  _setState(next) {
    if (this.state === next) return;
    this.state = next;
    if (next === 'idle') {
      this.sprite.stop();
      this.sprite.setTexture('aiden-idle');
    } else if (next === 'walking') {
      this.sprite.play('aiden-walk', true);
    } else if (next === 'attacking') {
      this.sprite.play('aiden-attack');
    } else if (next === 'hit') {
      this.sprite.stop();
      this.sprite.setTexture('aiden-hit');
    }
  }

  update(cursors, keys) {
    if (!this.alive) {
      this.sprite.body.setVelocity(0, 0);
      return;
    }

    const body = this.sprite.body;
    let vx = 0;
    let vy = 0;

    if (cursors.left.isDown) {
      vx = -SPEED;
      this.facing = 'left';
    } else if (cursors.right.isDown) {
      vx = SPEED;
      this.facing = 'right';
    }
    if (cursors.up.isDown) vy = -SPEED;
    else if (cursors.down.isDown) vy = SPEED;

    // If currently knocked back, preserve velocity (knockback lasts ~100ms)
    if (!this._knockbackActive) {
      body.setVelocity(vx, vy);
    }

    // Horizontal flip based on facing
    this.sprite.setFlipX(this.facing === 'left');

    // Attack on Z (just pressed)
    if (keys && keys.attack && Phaser.Input.Keyboard.JustDown(keys.attack) && !this.attacking) {
      this.attack();
    }

    // State transitions (only if we're not locked into attacking/hit)
    if (this.state !== 'attacking' && this.state !== 'hit') {
      const moving = vx !== 0 || vy !== 0;
      this._setState(moving ? 'walking' : 'idle');
    }

    this.sprite.depth = this.sprite.y;
  }

  attack() {
    this.attacking = true;
    this._setState('attacking');

    const dirX = this.facing === 'left' ? -1 : 1;
    const hx = this.sprite.x + dirX * ATTACK_OFFSET;
    // Feet-anchored sprite: the body's visual center is roughly sprite.y - (body height / 2 in world px)
    // Hitbox y at torso height ~= sprite.y - 60 (half of ~122 world-px body).
    const hy = this.sprite.y - 60;
    const hitbox = this.scene.add.rectangle(hx, hy, ATTACK_SIZE, ATTACK_SIZE, 0xffffff, 0);
    hitbox.visible = false; // invisible — no debug box in real gameplay
    this.scene.physics.add.existing(hitbox);
    hitbox.body.setAllowGravity(false);
    hitbox.body.setImmovable(true);
    hitbox.hasHit = false; // prevent multi-hit per swing
    hitbox.depth = hy;

    this.scene.time.delayedCall(ATTACK_LIFETIME_MS, () => {
      if (hitbox && hitbox.scene) hitbox.destroy();
      this.attacking = false;
    });

    // Revert to idle/walking when the attack animation finishes
    this.sprite.once('animationcomplete-aiden-attack', () => {
      if (!this.alive) return;
      if (this.state === 'attacking') {
        this._setState('idle');
      }
    });

    if (this.scene.activeHitboxes) {
      this.scene.activeHitboxes.push(hitbox);
    }

    return hitbox;
  }

  takeDamage(n) {
    if (!this.alive || this.invulnerable) return;
    this.hp = Math.max(0, this.hp - n);
    this.invulnerable = true;

    // Show hit texture briefly, then revert
    this._setState('hit');

    // Knockback opposite current facing
    const dirX = this.facing === 'left' ? 1 : -1;
    this._knockbackActive = true;
    this.sprite.body.setVelocity(dirX * KNOCKBACK, 0);

    // Flash white on tint (sprite, not fill style — rectangles are gone)
    this.sprite.setTint(0xffffff);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        if (this.sprite && this.sprite.scene) {
          this.sprite.setAlpha(1);
          this.sprite.clearTint();
        }
      },
    });

    this.scene.time.delayedCall(100, () => {
      this._knockbackActive = false;
    });
    this.scene.time.delayedCall(HIT_TEXTURE_MS, () => {
      if (this.alive && this.state === 'hit') {
        this._setState('idle');
      }
    });
    this.scene.time.delayedCall(INVULN_MS, () => {
      this.invulnerable = false;
    });

    if (this.hp <= 0) {
      this.alive = false;
      this.sprite.body.setVelocity(0, 0);
    }
  }

  heal(n) {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + n);
  }
}
