import Phaser from 'phaser';
import { Player } from '../entities/Player.js';
import { StreetRat } from '../entities/StreetRat.js';
import { FrenchFries } from '../entities/FrenchFries.js';

const RAT_RESPAWN_MS = 2000;
const ATTACK_DAMAGE = 15;
const RAT_CONTACT_DAMAGE = 10;
const FRIES_HEAL = 25;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.gameOver = false;

    // Title
    this.add.text(512, 24, 'Park Slope Heroes', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.add.text(512, 48, 'Arrows = move, Z = attack', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cccccc',
    }).setOrigin(0.5);

    // Player
    this.player = new Player(this, 512, 320);

    // Active rat (one at a time)
    this.rat = null;
    this.scheduleRatSpawn(0);

    // Pickups (french fries)
    this.pickups = [];

    // Active attack hitboxes
    this.activeHitboxes = [];

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = {
      attack: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
    };

    // HUD
    this.hpText = this.add.text(16, 12, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setDepth(100000);
    this.updateHpText();

    this.gameOverText = null;
  }

  updateHpText() {
    this.hpText.setText(`HP: ${this.player.hp} / ${this.player.maxHp}`);
  }

  scheduleRatSpawn(delayMs) {
    this.time.delayedCall(delayMs, () => {
      if (this.gameOver) return;
      this.spawnRat();
    });
  }

  spawnRat() {
    // Spawn at an edge of the play area, but not on top of the player
    const positions = [
      { x: 80, y: 200 },
      { x: 944, y: 200 },
      { x: 80, y: 440 },
      { x: 944, y: 440 },
    ];
    const spot = Phaser.Utils.Array.GetRandom(positions);
    this.rat = new StreetRat(this, spot.x, spot.y);
  }

  update() {
    if (this.gameOver) return;

    // Player update (movement, attack input). Player.attack() registers hitboxes with
    // this.activeHitboxes directly.
    this.player.update(this.cursors, this.keys);

    // Rat behavior
    if (this.rat && this.rat.alive) {
      this.rat.update(this.player);

      // Contact damage: rat overlaps player
      if (this.player.alive && !this.player.invulnerable && this._overlap(this.rat.sprite, this.player.sprite)) {
        this.player.takeDamage(RAT_CONTACT_DAMAGE);
        this.updateHpText();
        this.checkGameOver();
      }

      // Attack hitboxes vs rat
      for (const hb of this.activeHitboxes) {
        if (!hb || !hb.scene) continue;
        if (hb.hasHit) continue;
        if (this._overlap(hb, this.rat.sprite)) {
          hb.hasHit = true;
          this.rat.takeDamage(ATTACK_DAMAGE);
          if (!this.rat.alive) {
            // Drop fries
            this.pickups.push(new FrenchFries(this, this.rat.x, this.rat.y));
            this.rat = null;
            this.scheduleRatSpawn(RAT_RESPAWN_MS);
            break;
          }
        }
      }
    }

    // Prune destroyed hitboxes
    this.activeHitboxes = this.activeHitboxes.filter((h) => h && h.scene);

    // Pickups: overlap with player
    if (this.player.alive) {
      for (const p of this.pickups) {
        if (p.consumed) continue;
        if (this._overlap(p.sprite, this.player.sprite)) {
          p.consume();
          this.player.heal(FRIES_HEAL);
          this.updateHpText();
        }
      }
      this.pickups = this.pickups.filter((p) => !p.consumed);
    }

    // Depth sort by y
    this.player.sprite.depth = this.player.sprite.y;
    if (this.rat && this.rat.sprite) this.rat.sprite.depth = this.rat.sprite.y;
    for (const p of this.pickups) if (p.sprite) p.sprite.depth = p.sprite.y;
    for (const h of this.activeHitboxes) if (h) h.depth = h.y;
  }

  checkGameOver() {
    if (this.player.hp <= 0 && !this.gameOver) {
      this.gameOver = true;
      this.gameOverText = this.add.text(512, 288, 'GAME OVER — reload to retry', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ff6666',
        backgroundColor: '#000000',
        padding: { x: 16, y: 10 },
      }).setOrigin(0.5).setDepth(100001);

      // Freeze: stop physics
      this.physics.pause();
    }
  }

  _overlap(a, b) {
    if (!a || !b || !a.scene || !b.scene) return false;
    // Rectangle game objects: use getBounds
    const ab = a.getBounds();
    const bb = b.getBounds();
    return Phaser.Geom.Intersects.RectangleToRectangle(ab, bb);
  }
}
