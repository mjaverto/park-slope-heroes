import Phaser from 'phaser';

const SPEED = 180;
const MAX_HP = 10;
const SCALE = 0.10;
const HIT_TEXTURE_MS = 120;
const ATTACK_TEXTURE_MS = 150;
// When the cockroach is within this many px of the player, switch to attack pose briefly.
const ATTACK_DISTANCE = 40;
const ATTACK_COOLDOWN_MS = 350;
const CONTACT_DAMAGE = 3;

export class Cockroach {
  constructor(scene, x, y) {
    this.scene = scene;
    this.maxHp = MAX_HP;
    this.hp = MAX_HP;
    this.alive = true;
    this.state = 'walking'; // walking | attacking | hit
    this._nextAttackAt = 0;
    this.contactDamage = CONTACT_DAMAGE;

    this.sprite = scene.add.sprite(x, y, 'cockroach-idle');
    this.sprite.setOrigin(0.5, 1); // feet anchor
    this.sprite.setScale(SCALE);

    scene.physics.add.existing(this.sprite);
    // Smaller body tuned for the cockroach scale
    this.sprite.body.setSize(180, 220);
    this.sprite.body.setOffset(1024 / 2 - 180 / 2, 1024 - 220);
    this.sprite.body.setCollideWorldBounds(true);

    // Start walk animation (cockroaches are almost always moving)
    this.sprite.play('cockroach-walk');
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  _setState(next) {
    if (this.state === next) return;
    this.state = next;
    if (next === 'walking') {
      this.sprite.play('cockroach-walk', true);
    } else if (next === 'attacking') {
      this.sprite.stop();
      this.sprite.setTexture('cockroach-attack');
    } else if (next === 'hit') {
      this.sprite.stop();
      this.sprite.setTexture('cockroach-hit');
    }
  }

  update(playerRef) {
    if (!this.alive || !playerRef || !playerRef.alive) {
      if (this.sprite && this.sprite.body) this.sprite.body.setVelocity(0, 0);
      return;
    }
    const dx = playerRef.x - this.sprite.x;
    const dy = playerRef.y - this.sprite.y;
    const len = Math.hypot(dx, dy) || 1;
    this.sprite.body.setVelocity((dx / len) * SPEED, (dy / len) * SPEED);

    // Face player horizontally
    if (dx < -1) this.sprite.setFlipX(true);
    else if (dx > 1) this.sprite.setFlipX(false);

    // Attack pose when close (and cooldown ready)
    const now = this.scene.time.now;
    if (this.state !== 'hit' && len < ATTACK_DISTANCE && now >= this._nextAttackAt) {
      this._nextAttackAt = now + ATTACK_COOLDOWN_MS;
      this._setState('attacking');
      this.scene.time.delayedCall(ATTACK_TEXTURE_MS, () => {
        if (this.alive && this.state === 'attacking') {
          this._setState('walking');
        }
      });
    } else if (this.state !== 'attacking' && this.state !== 'hit') {
      this._setState('walking');
    }

    this.sprite.depth = this.sprite.y;
  }

  takeDamage(n) {
    if (!this.alive) return;
    this.hp -= n;
    this.scene.sound_mgr?.playSfx('sfx_hit');

    // Flash white via tint + show hit texture
    this._setState('hit');
    this.sprite.setTint(0xffffff);
    this.scene.time.delayedCall(HIT_TEXTURE_MS, () => {
      if (this.sprite && this.sprite.scene && this.alive) {
        this.sprite.clearTint();
        this._setState('walking');
      }
    });

    if (this.hp <= 0) {
      this.die();
    }
  }

  die() {
    this.alive = false;
    this.scene.sound_mgr?.playSfx('sfx_enemy_death');
    if (this.sprite && this.sprite.scene) {
      this.sprite.destroy();
    }
  }
}
