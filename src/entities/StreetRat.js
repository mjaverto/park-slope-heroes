import Phaser from 'phaser';

const SPEED = 90;
const MAX_HP = 30;
const SCALE = 0.18;
const HIT_TEXTURE_MS = 150;
const ATTACK_TEXTURE_MS = 180;
// When the rat is within this many px of the player, switch to attack pose briefly.
const ATTACK_DISTANCE = 70;
const ATTACK_COOLDOWN_MS = 500;

export class StreetRat {
  constructor(scene, x, y) {
    this.scene = scene;
    this.maxHp = MAX_HP;
    this.hp = MAX_HP;
    this.alive = true;
    this.state = 'walking'; // walking | attacking | hit
    this._nextAttackAt = 0;

    this.sprite = scene.add.sprite(x, y, 'rat-idle');
    this.sprite.setOrigin(0.5, 1); // feet anchor
    this.sprite.setScale(SCALE);

    scene.physics.add.existing(this.sprite);
    // Smaller body than player — rats are squatter
    this.sprite.body.setSize(220, 520);
    this.sprite.body.setOffset(1024 / 2 - 220 / 2, 1024 - 520);
    this.sprite.body.setCollideWorldBounds(true);

    // Start walk animation (rats are almost always moving)
    this.sprite.play('rat-walk');
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  _setState(next) {
    if (this.state === next) return;
    this.state = next;
    if (next === 'walking') {
      this.sprite.play('rat-walk', true);
    } else if (next === 'attacking') {
      this.sprite.stop();
      this.sprite.setTexture('rat-attack');
    } else if (next === 'hit') {
      this.sprite.stop();
      this.sprite.setTexture('rat-hit');
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
