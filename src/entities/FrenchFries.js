import Phaser from 'phaser';

export class FrenchFries {
  constructor(scene, x, y) {
    this.scene = scene;
    this.consumed = false;

    this.sprite = scene.add.rectangle(x, y, 20, 20, 0xffdd33);
    scene.physics.add.existing(this.sprite);
    this.sprite.body.setAllowGravity(false);
    this.sprite.body.setImmovable(true);
    this.sprite.setStrokeStyle(2, 0xaa8800);
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
