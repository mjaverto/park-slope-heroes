import Phaser from 'phaser';
import { Player } from '../entities/Player.js';
import { StreetRat } from '../entities/StreetRat.js';
import { FrenchFries } from '../entities/FrenchFries.js';
import { getStage } from '../data/stages.js';
import { SoundManager } from '../audio/SoundManager.js';

const RAT_CONTACT_DAMAGE = 5;
const FRIES_HEAL = 25;
const WAVE_CLEAR_TEXT_MS = 1500;
const WAVE_ADVANCE_DELAY_MS = 1000;
const STARTING_LIVES = 3;
const RAT_KILL_SCORE = 100;
const GET_UP_TEXT_MS = 1000;
const STAGE_CLEAR_PROMPT_DELAY_MS = 1500;
const RESPAWN_X = 512;
const RESPAWN_Y = 320;

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

    // Audio (SFX + music). SoundManager registers itself in create(), but the
    // loader calls live here so Phaser has textures/audio ready by create().
    new SoundManager(this).preload();
  }

  create() {
    // SoundManager must be created before the Player so entities can reach it
    // via `this.scene.sound_mgr?.playSfx(...)`. Don't shadow Phaser's built-in
    // `this.sound` — use `sound_mgr`.
    this.sound_mgr = new SoundManager(this);

    this.gameOver = false;
    this.stageCleared = false;
    // Lives + score reset on every fresh BootScene entry (Retry from GameOver
    // goes through CharacterSelect → BootScene, so this runs again).
    this.lives = STARTING_LIVES;
    this.score = 0;
    this._respawning = false;
    this._stageClearPromptShown = false;

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

    // Stage / wave state
    this.stage = getStage(0);
    this.currentWaveIndex = 0;
    this.rats = [];
    this.waveTransitioning = false;

    // Pickups (french fries)
    this.pickups = [];

    // Active attack hitboxes
    this.activeHitboxes = [];

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = {
      attack: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
    };

    // HUD — HP, Lives, Score stacked top-left.
    this.hpText = this.add.text(16, 12, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setDepth(100000);
    this.updateHpText();

    this.livesText = this.add.text(16, 36, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setDepth(100000);
    this.updateLivesText();

    this.scoreText = this.add.text(16, 60, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffd54a',
    }).setDepth(100000);
    this.updateScoreText();

    // Wave counter HUD (top-right, mirrors HP text style)
    this.waveText = this.add.text(1024 - 16, 12, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(1, 0).setDepth(100000);
    this.updateWaveText();

    this.gameOverText = null;

    // Stage music starts once the scene is up. Autoplay is already unlocked
    // because CharacterSelect's first-gesture handler ran before we got here.
    this.sound_mgr.startMusic('music_stage1');

    // Kick off wave 1 immediately
    this.startWave(0);
  }

  updateHpText() {
    this.hpText.setText(`HP: ${this.player.hp} / ${this.player.maxHp}`);
  }

  updateWaveText() {
    const total = this.stage.waves.length;
    // Display is 1-indexed. Clamp to total so it doesn't show "Wave 4 / 3"
    // during the last-kill frame before stage-clear text appears.
    const display = Math.min(this.currentWaveIndex + 1, total);
    this.waveText.setText(`Wave ${display} / ${total}`);
  }

  updateLivesText() {
    // Unicode hearts read cleanly in the monospace HUD. Fall back to a
    // numeric suffix when lives exceed 3 (shouldn't happen today, but cheap).
    const hearts =
      this.lives >= 0 && this.lives <= 5 ? '❤'.repeat(this.lives) : `x${this.lives}`;
    this.livesText.setText(`LIVES: ${hearts}`);
  }

  updateScoreText() {
    this.scoreText.setText(`SCORE: ${this.score}`);
  }

  addScore(points) {
    this.score += points;
    this.updateScoreText();
  }

  startWave(waveIndex) {
    this.currentWaveIndex = waveIndex;
    const wave = this.stage.waves[waveIndex];
    if (!wave) return;

    // 4 edge spawn points — cycle through them if wave has > 4 rats.
    const positions = [
      { x: 80, y: 200 },
      { x: 944, y: 200 },
      { x: 80, y: 440 },
      { x: 944, y: 440 },
    ];
    for (let i = 0; i < wave.rats; i++) {
      const spot = positions[i % positions.length];
      this.rats.push(new StreetRat(this, spot.x, spot.y));
    }

    this.waveTransitioning = false;
    this.updateWaveText();
  }

  onWaveCleared() {
    if (this.waveTransitioning) return;
    this.waveTransitioning = true;

    const hasMoreWaves = this.currentWaveIndex + 1 < this.stage.waves.length;

    if (hasMoreWaves) {
      const banner = this.add.text(512, 288, `Wave ${this.currentWaveIndex + 1} clear!`, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 16, y: 10 },
      }).setOrigin(0.5).setDepth(100001);

      this.time.delayedCall(WAVE_CLEAR_TEXT_MS, () => {
        if (banner && banner.scene) banner.destroy();
      });
      this.time.delayedCall(WAVE_ADVANCE_DELAY_MS, () => {
        if (this.gameOver) return;
        this.startWave(this.currentWaveIndex + 1);
      });
    } else {
      this.stageCleared = true;
      this.add.text(512, 288, 'STAGE CLEAR!', {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: '#ffd54a',
        stroke: '#000000',
        strokeThickness: 6,
      }).setOrigin(0.5).setDepth(100001);
      // Intentionally do NOT pause physics — player can still move around
      // for the screenshot / victory-lap feel.

      // After a beat, surface the "Press Enter to continue" prompt and wire
      // the key. Until Stages 2/3 exist, GameOver is the end screen.
      this.time.delayedCall(STAGE_CLEAR_PROMPT_DELAY_MS, () => {
        if (!this.scene.isActive() || this.gameOver) return;
        this._stageClearPromptShown = true;
        const prompt = this.add.text(512, 360, 'Press ENTER to continue', {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#ffffff',
        }).setOrigin(0.5).setDepth(100001);
        this.tweens.add({
          targets: prompt,
          alpha: 0.3,
          duration: 500,
          yoyo: true,
          repeat: -1,
        });
        this.input.keyboard.once('keydown-ENTER', () => this._goToVictory());
        this.input.keyboard.once('keydown-SPACE', () => this._goToVictory());
      });
    }
  }

  _goToVictory() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.sound_mgr?.stopMusic();
    this.scene.start('GameOver', {
      score: this.score,
      chosenChar: this.chosenKey,
      victory: true,
    });
  }

  update() {
    if (this.gameOver) return;

    // Player update (movement, attack input). Player.attack() registers hitboxes with
    // this.activeHitboxes directly.
    this.player.update(this.cursors, this.keys);

    // Rat behavior — iterate every live rat
    for (const rat of this.rats) {
      if (!rat.alive) continue;
      rat.update(this.player);

      // Contact damage: rat overlaps player
      if (
        this.player.alive &&
        !this.player.invulnerable &&
        this._overlap(rat.sprite, this.player.sprite)
      ) {
        this.player.takeDamage(RAT_CONTACT_DAMAGE);
        this.updateHpText();
        this.checkGameOver();
        if (this.gameOver) return;
      }

      // Attack hitboxes vs this rat. hb.hasHit stays single-target — one hitbox
      // can only damage one enemy, so we break out of the hitbox loop as soon as
      // one connects with this rat. Next rat in the outer loop gets its own shot
      // at any remaining not-yet-hit hitboxes.
      for (const hb of this.activeHitboxes) {
        if (!hb || !hb.scene) continue;
        if (hb.hasHit) continue;
        if (this._overlap(hb, rat.sprite)) {
          hb.hasHit = true;
          rat.takeDamage(this.player.damage);
          if (!rat.alive) {
            // Drop fries at kill location
            this.pickups.push(new FrenchFries(this, rat.x, rat.y));
            this.addScore(RAT_KILL_SCORE);
          }
          break;
        }
      }
    }

    // Remove dead rats from the active list
    this.rats = this.rats.filter((r) => r.alive);

    // Wave / stage clear check
    if (this.rats.length === 0 && !this.waveTransitioning && !this.stageCleared) {
      this.onWaveCleared();
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
    for (const r of this.rats) {
      if (r.sprite) r.sprite.depth = r.sprite.y;
    }
    for (const p of this.pickups) if (p.sprite) p.sprite.depth = p.sprite.y;
    for (const h of this.activeHitboxes) if (h) h.depth = h.y;
  }

  checkGameOver() {
    if (this.player.hp > 0 || this.gameOver || this._respawning) return;
    // Player just died. Decrement lives.
    this.lives -= 1;
    this.updateLivesText();

    if (this.lives > 0) {
      // Respawn flow — keep the current wave state (rats stay where they are)
      // so the "GET UP!" moment carries some weight.
      this._respawning = true;
      const banner = this.add.text(512, 288, 'GET UP!', {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: '#ffd54a',
        stroke: '#000000',
        strokeThickness: 6,
      }).setOrigin(0.5).setDepth(100001);

      this.time.delayedCall(GET_UP_TEXT_MS, () => {
        if (banner && banner.scene) banner.destroy();
        this._respawnPlayer();
        this._respawning = false;
      });
      return;
    }

    // No lives left → GameOver
    this.gameOver = true;
    this.sound_mgr?.stopMusic();
    this.scene.start('GameOver', {
      score: this.score,
      chosenChar: this.chosenKey,
      victory: false,
    });
  }

  _respawnPlayer() {
    const p = this.player;
    p.alive = true;
    p.hp = p.maxHp;
    p.invulnerable = false;
    p.attacking = false;
    p.state = 'idle';
    p.sprite.setTexture(`${this.chosenKey}-idle`);
    p.sprite.clearTint();
    p.sprite.setAlpha(1);
    p.sprite.setPosition(RESPAWN_X, RESPAWN_Y);
    p.sprite.body.setVelocity(0, 0);
    this.updateHpText();
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
