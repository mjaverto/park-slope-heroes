import Phaser from 'phaser';
import { getCharacter } from '../data/characters.js';

// Feel constants — global across all kids, not per-character.
const ATTACK_LIFETIME_MS = 150;
// Weapon sweep: overlap the player's body and extend through the front half.
// This prevents tiny/low enemies (cockroaches) from getting stuck inside the
// player where a pure forward-only torso hitbox can't reach them.
const ATTACK_MIN_WIDTH = 96;
const ATTACK_FRONT_PADDING = 72;
const ATTACK_HEIGHT = 150;
const ATTACK_CENTER_Y_OFFSET = -45;
const INVULN_MS = 600;
const KNOCKBACK = 300;
const SCALE = 0.18;
// Hit state duration when the player takes damage — shows the hit texture briefly.
const HIT_TEXTURE_MS = 200;

export class Player {
  constructor(scene, x, y, characterKey = 'aiden') {
    this.scene = scene;
    this.characterKey = characterKey;

    // Pull per-character stats from data/characters.js. getCharacter() falls
    // back to aiden if the key is unknown.
    const { stats } = getCharacter(characterKey);
    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.speed = stats.speed;
    this.damage = stats.damage;
    this.reach = stats.reach; // used as ATTACK_OFFSET in attack()

    this.facing = 'right';
    this.invulnerable = false;
    this.attacking = false;
    this.alive = true;
    this.state = 'idle'; // idle | walking | attacking | hit

    this.sprite = scene.add.sprite(x, y, `${characterKey}-idle`);
    this.sprite.setOrigin(0.5, 1); // feet anchor for 2.5D depth sort
    // Per-character display scale multiplier (Dean is a 3yo so renders smaller).
    const scaleMul = stats.scale ?? 1;
    this.sprite.setScale(SCALE * scaleMul);

    scene.physics.add.existing(this.sprite);
    // Tight hitbox in sprite-local px (pre-scale). We size it as a fraction of the
    // sprite's actual texture dimensions so different source sizes work — Aiden is
    // 1024×1024 (character ~21% wide, ~66% tall in canvas), Dean is 256×256
    // (character trimmed to fill canvas). Same fractions land both at sensible
    // world-px hitboxes once their per-character display scale is applied.
    const w = this.sprite.width;
    const h = this.sprite.height;
    const bodyW = w * 0.215;
    const bodyH = h * 0.664;
    this.sprite.body.setSize(bodyW, bodyH);
    this.sprite.body.setOffset(w / 2 - bodyW / 2, h - bodyH);
    this.sprite.body.setCollideWorldBounds(true);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  _setState(next) {
    if (this.state === next) return;
    this.state = next;
    const k = this.characterKey;
    if (next === 'idle') {
      this.sprite.stop();
      this.sprite.setTexture(`${k}-idle`);
    } else if (next === 'walking') {
      this.sprite.play(`${k}-walk`, true);
    } else if (next === 'attacking') {
      this.sprite.play(`${k}-attack`);
    } else if (next === 'hit') {
      this.sprite.stop();
      this.sprite.setTexture(`${k}-hit`);
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
      vx = -this.speed;
      this.facing = 'left';
    } else if (cursors.right.isDown) {
      vx = this.speed;
      this.facing = 'right';
    }
    if (cursors.up.isDown) vy = -this.speed;
    else if (cursors.down.isDown) vy = this.speed;

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
    this.scene.sound_mgr?.playSfx('sfx_attack');

    const dirX = this.facing === 'left' ? -1 : 1;
    const width = Math.max(ATTACK_MIN_WIDTH, this.reach + ATTACK_FRONT_PADDING);
    const hx = this.sprite.x + dirX * (this.reach / 2);
    // Feet-anchored sprite: cover torso through feet. Roaches are short and
    // often overlap the player's lower body, so the sweep must reach down.
    const hy = this.sprite.y + ATTACK_CENTER_Y_OFFSET;
    const hitbox = this.scene.add.rectangle(hx, hy, width, ATTACK_HEIGHT, 0xffffff, 0);
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
    this.sprite.once(`animationcomplete-${this.characterKey}-attack`, () => {
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
    this.scene.sound_mgr?.playSfx('sfx_player_hurt');

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
