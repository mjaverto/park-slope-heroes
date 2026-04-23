import Phaser from 'phaser';
import { Player } from '../entities/Player.js';
import { StreetRat } from '../entities/StreetRat.js';
import { FrenchFries } from '../entities/FrenchFries.js';

const RAT_RESPAWN_MS = 2000;
const RAT_CONTACT_DAMAGE = 5;
const FRIES_HEAL = 25;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Which kid did the player pick in CharacterSelect? Fall back to aiden
    // if BootScene was started directly (e.g. in dev without going through
    // the select screen).
    const chosenKey = this.registry.get('chosenChar') ?? 'aiden';
    this.chosenKey = chosenKey;

    // Player: load only the chosen kid's 6 pose sprites.
    this.load.image(`${chosenKey}-idle`, `/assets/sprites/${chosenKey}-idle.png`);
    this.load.image(`${chosenKey}-walk-1`, `/assets/sprites/${chosenKey}-walk-1.png`);
    this.load.image(`${chosenKey}-walk-2`, `/assets/sprites/${chosenKey}-walk-2.png`);
    this.load.image(`${chosenKey}-attack-1`, `/assets/sprites/${chosenKey}-attack-1.png`);
    this.load.image(`${chosenKey}-attack-2`, `/assets/sprites/${chosenKey}-attack-2.png`);
    this.load.image(`${chosenKey}-hit`, `/assets/sprites/${chosenKey}-hit.png`);

    // Street rat (enemy) — shared across all kids.
    this.load.image('rat-idle', '/assets/sprites/rat-idle.png');
    this.load.image('rat-walk-1', '/assets/sprites/rat-walk-1.png');
    this.load.image('rat-walk-2', '/assets/sprites/rat-walk-2.png');
    this.load.image('rat-attack', '/assets/sprites/rat-attack.png');
    this.load.image('rat-hit', '/assets/sprites/rat-hit.png');

    // French fries (pickup) — shared.
    this.load.image('fries', '/assets/sprites/fries.png');
  }

  create() {
    this.gameOver = false;

    // Register animations. Idle / hit / rat-attack textures are handled via setTexture
    // on the entity state machines — only walks and the player-attack swing are multi-frame.
    // Player anims keyed by chosenKey so each kid gets their own walk/attack cycle.
    const k = this.chosenKey;
    this.anims.create({
      key: `${k}-walk`,
      frames: [{ key: `${k}-walk-1` }, { key: `${k}-walk-2` }],
      frameRate: 6,
      repeat: -1,
    });
    this.anims.create({
      key: `${k}-attack`,
      frames: [{ key: `${k}-attack-1` }, { key: `${k}-attack-2` }],
      frameRate: 10,
      repeat: 0,
    });
    this.anims.create({
      key: 'rat-walk',
      frames: [{ key: 'rat-walk-1' }, { key: 'rat-walk-2' }],
      frameRate: 4,
      repeat: -1,
    });

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

    // Player — pass the chosen kid so Player pulls the right texture/anim keys
    // and per-character stats (hp, speed, damage, reach) from src/data/characters.js.
    this.player = new Player(this, 512, 320, this.chosenKey);

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
          this.rat.takeDamage(this.player.damage);
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
    // Prefer arcade physics body rect when present — this keeps collision tight for
    // feet-anchored sprites whose visual getBounds() would be far larger than the body.
    const ar = a.body
      ? new Phaser.Geom.Rectangle(a.body.x, a.body.y, a.body.width, a.body.height)
      : a.getBounds();
    const br = b.body
      ? new Phaser.Geom.Rectangle(b.body.x, b.body.y, b.body.width, b.body.height)
      : b.getBounds();
    return Phaser.Geom.Intersects.RectangleToRectangle(ar, br);
  }
}
