import Phaser from 'phaser';

const SPEED = 90;
const MAX_HP = 30;

export class StreetRat {
  constructor(scene, x, y) {
    this.scene = scene;
    this.maxHp = MAX_HP;
    this.hp = MAX_HP;
    this.alive = true;

    this.sprite = scene.add.rectangle(x, y, 32, 48, 0xdd4444);
    scene.physics.add.existing(this.sprite);
    this.sprite.body.setCollideWorldBounds(true);
    this.sprite.setStrokeStyle(2, 0x661111);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  update(playerRef) {
    if (!this.alive || !playerRef || !playerRef.alive) {
      if (this.sprite && this.sprite.body) this.sprite.body.setVelocity(0, 0);
      return;
    }
    const dx = playerRef.x - this.sprite.x;
    const dy = playerRef.y - this.sprite.y;
    const len = Math.hypot(dx, dy) || 1;
    this.sprite.body.setVelocity((dx / len) * SPEED, (dy / len) * SPEED);

    this.sprite.depth = this.sprite.y;
  }

  takeDamage(n) {
    if (!this.alive) return;
    this.hp -= n;

    // Flash white 100ms
    const original = 0xdd4444;
    this.sprite.setFillStyle(0xffffff);
    this.scene.time.delayedCall(100, () => {
      if (this.sprite && this.sprite.scene && this.alive) {
        this.sprite.setFillStyle(original);
      }
    });

    if (this.hp <= 0) {
      this.die();
    }
  }

  die() {
    this.alive = false;
    if (this.sprite && this.sprite.scene) {
      this.sprite.destroy();
    }
  }
}
