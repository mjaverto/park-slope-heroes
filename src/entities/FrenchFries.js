import Phaser from 'phaser';

const SCALE = 0.06; // ~60 px visible

export class FrenchFries {
  constructor(scene, x, y) {
    this.scene = scene;
    this.consumed = false;

    this.sprite = scene.add.sprite(x, y, 'fries');
    this.sprite.setOrigin(0.5, 1); // feet/base anchor to match depth sort
    this.sprite.setScale(SCALE);

    scene.physics.add.existing(this.sprite);
    // Generous overlap box: ~120x120 local * 0.06 ≈ 72 world px
    this.sprite.body.setSize(1024, 1024);
    this.sprite.body.setOffset(0, 0);
    this.sprite.body.setAllowGravity(false);
    this.sprite.body.setImmovable(true);
    this.sprite.depth = y;
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  consume() {
    if (this.consumed) return;
    this.consumed = true;
    if (this.sprite && this.sprite.scene) this.sprite.destroy();
  }
}
