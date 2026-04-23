import Phaser from 'phaser';

const SPEED = 200;
const ATTACK_LIFETIME_MS = 150;
const ATTACK_SIZE = 16;
const ATTACK_OFFSET = 22; // distance from player center to hitbox center
const INVULN_MS = 200;
const KNOCKBACK = 220;

export class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.maxHp = 100;
    this.hp = 100;
    this.facing = 'right';
    this.invulnerable = false;
    this.attacking = false;
    this.alive = true;

    this.sprite = scene.add.rectangle(x, y, 32, 48, 0x44dd44);
    scene.physics.add.existing(this.sprite);
    this.sprite.body.setCollideWorldBounds(true);
    this.sprite.setStrokeStyle(2, 0x226611);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  update(cursors, keys) {
    if (!this.alive) {
      this.sprite.body.setVelocity(0, 0);
      return;
    }

    // Respect knockback: if invulnerable velocity is already set, don't clobber it mid-knockback
    // Simpler: allow input always, but the knockback impulse is short and visible.
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

    // If currently invulnerable and knocked back, preserve velocity (knockback tween takes ~100ms)
    if (!this._knockbackActive) {
      body.setVelocity(vx, vy);
    }

    // Attack on Z (just pressed)
    if (keys && keys.attack && Phaser.Input.Keyboard.JustDown(keys.attack) && !this.attacking) {
      this.attack();
    }

    this.sprite.depth = this.sprite.y;
  }

  attack() {
    this.attacking = true;
    const dirX = this.facing === 'left' ? -1 : 1;
    const hx = this.sprite.x + dirX * ATTACK_OFFSET;
    const hy = this.sprite.y;
    const hitbox = this.scene.add.rectangle(hx, hy, ATTACK_SIZE, ATTACK_SIZE, 0xffffff, 0.5);
    hitbox.setStrokeStyle(1, 0xffff00);
    this.scene.physics.add.existing(hitbox);
    hitbox.body.setAllowGravity(false);
    hitbox.body.setImmovable(true);
    hitbox.hasHit = false; // prevent multi-hit per swing
    hitbox.depth = hy;

    this.scene.time.delayedCall(ATTACK_LIFETIME_MS, () => {
      if (hitbox && hitbox.scene) hitbox.destroy();
      this.attacking = false;
    });

    // Register with scene for collision checks
    if (this.scene.activeHitboxes) {
      this.scene.activeHitboxes.push(hitbox);
    }

    return hitbox;
  }

  takeDamage(n) {
    if (!this.alive || this.invulnerable) return;
    this.hp = Math.max(0, this.hp - n);
    this.invulnerable = true;

    // Knockback away from the nearest threat — caller should pass a vector, but for v1
    // just push opposite of current facing.
    const dirX = this.facing === 'left' ? 1 : -1;
    this._knockbackActive = true;
    this.sprite.body.setVelocity(dirX * KNOCKBACK, 0);

    // Flash effect
    this.sprite.setFillStyle(0xffffff);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.sprite.setAlpha(1);
        this.sprite.setFillStyle(0x44dd44);
      },
    });

    this.scene.time.delayedCall(100, () => {
      this._knockbackActive = false;
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
