import Phaser from 'phaser';
import { Player } from '../entities/Player.js';
import { StreetRat } from '../entities/StreetRat.js';
import { Cockroach } from '../entities/Cockroach.js';
import { FrenchFries } from '../entities/FrenchFries.js';
import { Boss } from '../entities/Boss.js';
import { getStage } from '../data/stages.js';
import { SoundManager } from '../audio/SoundManager.js';

const FRIES_HEAL = 25;
const WAVE_CLEAR_TEXT_MS = 1500;
const WAVE_ADVANCE_DELAY_MS = 1000;
const STARTING_LIVES = 3;
const RAT_KILL_SCORE = 100;
const BOSS_KILL_SCORE = 2000;
const GET_UP_TEXT_MS = 1000;
const STAGE_CLEAR_PROMPT_DELAY_MS = 1500;
const BOSS_DEFEAT_DELAY_MS = 2500;

// Same 3-tile world geometry as Stage 1/2.
const WORLD_WIDTH = 4608;
const WORLD_HEIGHT = 576;
const BG_TILE_WIDTH = 1536;
const BG_TILE_HEIGHT = 576;
const SIDEWALK_Y_MIN = 380;
const SIDEWALK_Y_MAX = 490;
const PLAYER_SPAWN_X = 200;
const PLAYER_SPAWN_Y = 420;
const CAMERA_VIEW_HALF = 512;
const CAMERA_PAN_MS = 400;
const CAMERA_LERP_X = 0.15;
const CAMERA_DEADZONE_W = 200;

// Boss HUD geometry — pinned to top-center via scrollFactor 0.
const BOSS_BAR_WIDTH = 520;
const BOSS_BAR_HEIGHT = 10;
const BOSS_BAR_Y = 84;

// Display label for the Stage 4 boss (single-phase Boss).
const BOSS_LABEL = 'BEAKZILLA';

export class Stage4 extends Phaser.Scene {
  constructor() {
    super('Stage4');
  }

  init(data) {
    // Stage 3 hands us { score, lives } on transition. Standalone dev starts
    // default to a fresh run.
    this._incomingScore = typeof data?.score === 'number' ? data.score : 0;
    this._incomingLives = typeof data?.lives === 'number' ? data.lives : STARTING_LIVES;
  }

  preload() {
    const chosenKey = this.registry.get('chosenChar') ?? 'aiden';
    this.chosenKey = chosenKey;

    // Player textures (shared with prior stages; Phaser dedupes by key).
    this.load.image(`${chosenKey}-idle`, `./assets/sprites/${chosenKey}-idle.png`);
    this.load.image(`${chosenKey}-walk-1`, `./assets/sprites/${chosenKey}-walk-1.png`);
    this.load.image(`${chosenKey}-walk-2`, `./assets/sprites/${chosenKey}-walk-2.png`);
    this.load.image(`${chosenKey}-attack-1`, `./assets/sprites/${chosenKey}-attack-1.png`);
    this.load.image(`${chosenKey}-attack-2`, `./assets/sprites/${chosenKey}-attack-2.png`);
    this.load.image(`${chosenKey}-hit`, `./assets/sprites/${chosenKey}-hit.png`);

    // Street rats (shared).
    this.load.image('rat-idle', './assets/sprites/rat-idle.png');
    this.load.image('rat-walk-1', './assets/sprites/rat-walk-1.png');
    this.load.image('rat-walk-2', './assets/sprites/rat-walk-2.png');
    this.load.image('rat-attack', './assets/sprites/rat-attack.png');
    this.load.image('rat-hit', './assets/sprites/rat-hit.png');

    this.load.image('cockroach-idle', './assets/sprites/cockroach-idle.png');
    this.load.image('cockroach-walk-1', './assets/sprites/cockroach-walk-1.png');
    this.load.image('cockroach-walk-2', './assets/sprites/cockroach-walk-2.png');
    this.load.image('cockroach-attack', './assets/sprites/cockroach-attack.png');
    this.load.image('cockroach-hit', './assets/sprites/cockroach-hit.png');

    // Fries pickup.
    this.load.image('fries', './assets/sprites/fries.png');

    // Track missing Stage 4 assets (bg + boss + music + r-train) so create() can fall back.
    this.missingAssets = new Set();
    this.load.on('loaderror', (file) => {
      if (file && typeof file.key === 'string') {
        this.missingAssets.add(file.key);
      }
    });

    // Stage 4 background tiles — 4th Ave & 9th St subway palette.
    this.load.image('bg-stage4-tile1', './assets/backgrounds/stage4-tile1.png');
    this.load.image('bg-stage4-tile2', './assets/backgrounds/stage4-tile2.png');
    this.load.image('bg-stage4-tile3', './assets/backgrounds/stage4-tile3.png');

    // Beakzilla — single-phase Boss, 6 sprites. Missing textures flip the
    // Boss entity to a tinted-rect fallback.
    for (const suffix of ['idle', 'walk-1', 'walk-2', 'attack', 'hit', 'defeat']) {
      const key = `beakzilla-${suffix}`;
      this.load.image(key, `./assets/sprites/${key}.png`);
    }

    // R train cinematic sprite.
    this.load.image('r-train', './assets/sprites/r-train.png');

    // Audio — shared SFX/music keys. SoundManager.preload is idempotent on
    // Phaser's loader. music_stage4 isn't in the default list, so load it
    // directly (loaderror tolerance above + startMusic no-op below).
    new SoundManager(this).preload();
    this.load.audio('music_stage4', './assets/audio/music/stage4.ogg');
  }

  create() {
    this.sound_mgr = new SoundManager(this);

    this.gameOver = false;
    this.stageCleared = false;
    this.bossDefeated = false;
    this.lives = this._incomingLives;
    this.score = this._incomingScore;
    this._respawning = false;
    this._stageClearPromptShown = false;

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Background tiles — Stage 4 palette: sky blue → steel girders →
    // under-track shadow. Fallback rectangles if tiles are missing.
    const fallbackColors = [0x7d99b8, 0x4a4a52, 0x2a2a35];
    for (let i = 0; i < 3; i++) {
      const key = `bg-stage4-tile${i + 1}`;
      const x = BG_TILE_WIDTH * i;
      if (this.textures.exists(key) && !this.missingAssets?.has(key)) {
        this.add
          .image(x, 0, key)
          .setOrigin(0, 0)
          .setDisplaySize(BG_TILE_WIDTH, BG_TILE_HEIGHT)
          .setDepth(-1000);
      } else {
        this.add
          .rectangle(x, 0, BG_TILE_WIDTH, BG_TILE_HEIGHT, fallbackColors[i])
          .setOrigin(0, 0)
          .setDepth(-1000);
      }
    }

    // Player + rat animations.
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
    this.anims.create({
      key: 'cockroach-walk',
      frames: [{ key: 'cockroach-walk-1' }, { key: 'cockroach-walk-2' }],
      frameRate: 8,
      repeat: -1,
    });

    // Player — spawn at the subway entrance.
    this.player = new Player(this, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, this.chosenKey);

    // Stage data (STAGES[3]). `sections` drives scroll-lock triggers.
    this.stage = getStage(3);
    this.sections = this.stage.sections ?? [];
    this.currentSectionIndex = 0;
    this.currentWaveIndex = 0;
    this.enemies = [];
    this.boss = null;
    this.waveTransitioning = false;
    this.sectionActive = false;
    this.scrollLockX = null;
    this.scrollLockWall = null;

    this.cameras.main.startFollow(this.player.sprite, true, CAMERA_LERP_X, 0);
    this.cameras.main.setDeadzone(CAMERA_DEADZONE_W, WORLD_HEIGHT);

    this.pickups = [];
    this.activeHitboxes = [];

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = {
      attack: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
    };

    // HUD — HP / Lives / Score / Wave.
    this.hpText = this.add.text(16, 12, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setDepth(100000).setScrollFactor(0);
    this.updateHpText();

    this.livesText = this.add.text(16, 36, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setDepth(100000).setScrollFactor(0);
    this.updateLivesText();

    this.scoreText = this.add.text(16, 60, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffd54a',
    }).setDepth(100000).setScrollFactor(0);
    this.updateScoreText();

    this.waveText = this.add.text(1024 - 16, 12, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(1, 0).setDepth(100000).setScrollFactor(0);
    this.updateWaveText();

    this.add.text(512, 24, 'Stage 4 — 4th Ave & 9th St', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100000);

    this.add.text(512, 48, 'Arrows = move, Z = attack', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cccccc',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100000);

    // Boss HUD — created empty + hidden.
    this._createBossHud();

    this.gameOverText = null;

    // Stage 4 music (loaderror-tolerant — startMusic no-ops if the key is missing).
    this.sound_mgr.startMusic('music_stage4');

    // R-train cinematic intro: train slides in from off-right, pauses
    // mid-screen with kids waving, slides off-left. Pinned to viewport
    // (scrollFactor 0). Loaderror-tolerant: skipped if r-train texture
    // missing or marked missing by the loader.
    if (this.textures.exists('r-train') && !this.missingAssets?.has('r-train')) {
      const trainY = 110;
      const train = this.add.image(1024 + 600, trainY, 'r-train')
        .setOrigin(0.5, 0.5)
        .setScale(0.7)
        .setScrollFactor(0)
        .setDepth(50000);

      this.tweens.chain({
        targets: train,
        tweens: [
          { x: 512, duration: 2200, ease: 'Sine.easeOut' },
          { x: 512, duration: 1500 }, // pause — kids waving
          { x: -800, duration: 2200, ease: 'Sine.easeIn' },
        ],
        onComplete: () => {
          if (train && train.scene) train.destroy();
        },
      });
    }
  }

  // ── HUD helpers ──────────────────────────────────────────────────────────

  _createBossHud() {
    this.bossHud = {};
    this.bossHud.label = this.add.text(512, BOSS_BAR_Y - 18, BOSS_LABEL, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100000).setScrollFactor(0);

    this.bossHud.barBg = this.add.rectangle(
      512,
      BOSS_BAR_Y,
      BOSS_BAR_WIDTH + 4,
      BOSS_BAR_HEIGHT + 4,
      0x000000,
    ).setOrigin(0.5).setDepth(100000).setScrollFactor(0);

    this.bossHud.barFill = this.add.rectangle(
      512 - BOSS_BAR_WIDTH / 2,
      BOSS_BAR_Y,
      BOSS_BAR_WIDTH,
      BOSS_BAR_HEIGHT,
      0xff3333,
    ).setOrigin(0, 0.5).setDepth(100001).setScrollFactor(0);

    this._setBossHudVisible(false);
  }

  _setBossHudVisible(visible) {
    if (!this.bossHud) return;
    this.bossHud.label.setVisible(visible);
    this.bossHud.barBg.setVisible(visible);
    this.bossHud.barFill.setVisible(visible);
  }

  _updateBossHud() {
    if (!this.bossHud || !this.boss) return;
    const ratio = Phaser.Math.Clamp(this.boss.hp / this.boss.maxHp, 0, 1);
    this.bossHud.barFill.width = BOSS_BAR_WIDTH * ratio;
  }

  updateHpText() {
    this.hpText.setText(`HP: ${this.player.hp} / ${this.player.maxHp}`);
  }

  updateWaveText() {
    const total = this.sections.length;
    const display = Math.min(this.currentWaveIndex + 1, total);
    this.waveText.setText(`Wave ${display} / ${total}`);
  }

  updateLivesText() {
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

  // ── Section / battle zone lifecycle ──────────────────────────────────────

  _activateSection(index) {
    const section = this.sections[index];
    if (!section) return;

    this.sectionActive = true;
    this.currentSectionIndex = index;
    this.currentWaveIndex = index;
    this.scrollLockX = section.cameraLockX;

    this.cameras.main.stopFollow();
    const targetScrollX = Phaser.Math.Clamp(
      section.cameraLockX - CAMERA_VIEW_HALF,
      0,
      WORLD_WIDTH - 1024,
    );
    this.cameras.main.pan(
      targetScrollX + CAMERA_VIEW_HALF,
      CAMERA_PAN_MS,
      'Sine.easeInOut',
    );

    const wall = this.add.rectangle(
      section.cameraLockX + 40,
      WORLD_HEIGHT / 2,
      20,
      WORLD_HEIGHT,
      0x000000,
      0,
    );
    this.physics.add.existing(wall, true);
    this.physics.add.collider(this.player.sprite, wall);
    this.scrollLockWall = wall;

    if (section.boss) {
      this._spawnBoss(section);
    } else {
      this._spawnSectionEnemies(section);
    }

    this.waveTransitioning = false;
    this.updateWaveText();
  }

  _spawnSectionEnemies(section) {
    const lockX = section.cameraLockX;
    const randY = () => Phaser.Math.Between(SIDEWALK_Y_MIN, SIDEWALK_Y_MAX);

    if (section.rats != null) {
      const count = section.rats;
      const behindCount = Math.max(1, Math.floor(count / 3));
      const aheadCount = count - behindCount;
      for (let i = 0; i < aheadCount; i++) {
        const x = lockX + Phaser.Math.Between(50, 200) + i * 80;
        this.enemies.push(new StreetRat(this, x, randY()));
      }
      for (let i = 0; i < behindCount; i++) {
        const x = section.triggerX - 100 - i * 60;
        this.enemies.push(new StreetRat(this, x, randY()));
      }
      return;
    }

    if (section.roaches != null) {
      const count = section.roaches;
      const behindCount = Math.max(1, Math.floor(count / 3));
      const aheadCount = count - behindCount;
      for (let i = 0; i < aheadCount; i++) {
        const x = lockX + Phaser.Math.Between(50, 200) + i * 60;
        this.enemies.push(new Cockroach(this, x, randY()));
      }
      for (let i = 0; i < behindCount; i++) {
        const x = section.triggerX - 100 - i * 50;
        this.enemies.push(new Cockroach(this, x, randY()));
      }
      return;
    }
  }

  _spawnBoss(section) {
    const spawnX = section.cameraLockX + 220;
    const spawnY = PLAYER_SPAWN_Y;
    this.boss = new Boss(this, spawnX, spawnY, {
      key: 'beakzilla',
      hp: 300,
      damage: 16,
      speed: 100,
      contactDamage: 11,
    });
    this.boss.onDefeat = () => this._onBossDefeated();
    if (this.bossHud) this.bossHud.label.setText(BOSS_LABEL);
    this._setBossHudVisible(true);
    this._updateBossHud();
  }

  _onSectionCleared() {
    if (this.scrollLockWall) {
      this.scrollLockWall.destroy();
      this.scrollLockWall = null;
    }
    this.scrollLockX = null;
    this.sectionActive = false;

    this.cameras.main.startFollow(this.player.sprite, true, CAMERA_LERP_X, 0);

    const banner = this.add.text(512, 288, 'Zone Clear!', {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setDepth(100001).setScrollFactor(0);
    this.time.delayedCall(WAVE_CLEAR_TEXT_MS, () => {
      if (banner && banner.scene) banner.destroy();
    });

    const nextIndex = this.currentSectionIndex + 1;
    if (nextIndex >= this.sections.length) {
      this.time.delayedCall(WAVE_ADVANCE_DELAY_MS, () => {
        if (this.gameOver) return;
        this._onStageCleared();
      });
    } else {
      this.currentSectionIndex = nextIndex;
      this.currentWaveIndex = nextIndex;
      this.waveTransitioning = false;
      this.updateWaveText();
    }
  }

  _onBossDefeated() {
    if (this.bossDefeated) return;
    this.bossDefeated = true;
    this.addScore(BOSS_KILL_SCORE);
    this._setBossHudVisible(false);

    // Drop a celebratory pile of fries.
    if (this.boss && this.boss.sprite) {
      this.pickups.push(new FrenchFries(this, this.boss.x, this.boss.y));
    }

    if (this.scrollLockWall) {
      this.scrollLockWall.destroy();
      this.scrollLockWall = null;
    }
    this.sectionActive = false;
    this.currentSectionIndex = this.sections.length;

    this.time.delayedCall(BOSS_DEFEAT_DELAY_MS, () => {
      if (this.gameOver) return;
      this._onStageCleared();
    });
  }

  _onStageCleared() {
    this.stageCleared = true;
    // Final stage — use FINAL VICTORY styling.
    this.add.text(512, 260, 'FINAL VICTORY!', {
      fontFamily: 'monospace',
      fontSize: '56px',
      color: '#ffd54a',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(100001).setScrollFactor(0);

    this.add.text(512, 320, 'Park Slope is safe.', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100001).setScrollFactor(0);

    this.time.delayedCall(STAGE_CLEAR_PROMPT_DELAY_MS, () => {
      if (!this.scene.isActive() || this.gameOver) return;
      this._stageClearPromptShown = true;
      const prompt = this.add.text(512, 380, 'Press ENTER to continue', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      }).setOrigin(0.5).setDepth(100001).setScrollFactor(0);
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

    this.player.update(this.cursors, this.keys);

    if (this.player.sprite.y < SIDEWALK_Y_MIN) this.player.sprite.y = SIDEWALK_Y_MIN;
    if (this.player.sprite.y > SIDEWALK_Y_MAX) this.player.sprite.y = SIDEWALK_Y_MAX;

    if (
      !this.sectionActive &&
      !this.stageCleared &&
      this.currentSectionIndex < this.sections.length
    ) {
      const next = this.sections[this.currentSectionIndex];
      if (next && this.player.sprite.x >= next.triggerX) {
        this._activateSection(this.currentSectionIndex);
      }
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.update(this.player);

      if (enemy.sprite.y < SIDEWALK_Y_MIN) enemy.sprite.y = SIDEWALK_Y_MIN;
      if (enemy.sprite.y > SIDEWALK_Y_MAX) enemy.sprite.y = SIDEWALK_Y_MAX;

      if (
        this.player.alive &&
        !this.player.invulnerable &&
        this._overlap(enemy.sprite, this.player.sprite)
      ) {
        this.player.takeDamage(enemy.contactDamage);
        this.updateHpText();
        this.checkGameOver();
        if (this.gameOver) return;
      }

      for (const hb of this.activeHitboxes) {
        if (!hb || !hb.scene) continue;
        if (hb.hasHit) continue;
        if (this._overlap(hb, enemy.sprite)) {
          hb.hasHit = true;
          enemy.takeDamage(this.player.damage);
          if (!enemy.alive) {
            this.pickups.push(new FrenchFries(this, enemy.x, enemy.y));
            this.addScore(RAT_KILL_SCORE);
          }
          break;
        }
      }
    }

    this.enemies = this.enemies.filter((e) => e.alive);

    if (this.boss && this.boss.alive) {
      this.boss.update(this.player);

      if (this.boss.sprite.y < SIDEWALK_Y_MIN) this.boss.sprite.y = SIDEWALK_Y_MIN;
      if (this.boss.sprite.y > SIDEWALK_Y_MAX) this.boss.sprite.y = SIDEWALK_Y_MAX;

      if (
        this.player.alive &&
        !this.player.invulnerable &&
        this._overlap(this.boss.sprite, this.player.sprite)
      ) {
        this.player.takeDamage(this.boss.contactDamage);
        this.updateHpText();
        this.checkGameOver();
        if (this.gameOver) return;
      }

      for (const hb of this.activeHitboxes) {
        if (!hb || !hb.scene) continue;
        if (hb.hasHit) continue;
        if (this._overlap(hb, this.boss.sprite)) {
          hb.hasHit = true;
          this.boss.takeDamage(this.player.damage);
          break;
        }
      }

      this._updateBossHud();
    }

    const currentSection = this.sections[this.currentSectionIndex];
    const isBossSection = Boolean(currentSection && currentSection.boss);
    if (
      this.sectionActive &&
      !isBossSection &&
      this.enemies.length === 0 &&
      !this.waveTransitioning &&
      !this.stageCleared
    ) {
      this.waveTransitioning = true;
      this._onSectionCleared();
    }

    this.activeHitboxes = this.activeHitboxes.filter((h) => h && h.scene);

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

    this.player.sprite.depth = this.player.sprite.y;
    for (const e of this.enemies) {
      if (e.sprite) e.sprite.depth = e.sprite.y;
    }
    if (this.boss && this.boss.sprite) {
      this.boss.sprite.depth = this.boss.sprite.y;
    }
    for (const p of this.pickups) if (p.sprite) p.sprite.depth = p.sprite.y;
    for (const h of this.activeHitboxes) if (h) h.depth = h.y;
  }

  checkGameOver() {
    if (this.player.hp > 0 || this.gameOver || this._respawning) return;
    this.lives -= 1;
    this.updateLivesText();

    if (this.lives > 0) {
      this._respawning = true;
      const banner = this.add.text(512, 288, 'GET UP!', {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: '#ffd54a',
        stroke: '#000000',
        strokeThickness: 6,
      }).setOrigin(0.5).setDepth(100001).setScrollFactor(0);

      this.time.delayedCall(GET_UP_TEXT_MS, () => {
        if (banner && banner.scene) banner.destroy();
        this._respawnPlayer();
        this._respawning = false;
      });
      return;
    }

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
    const respawnX = this.sectionActive && this.scrollLockX != null
      ? this.scrollLockX - 150
      : Math.max(PLAYER_SPAWN_X, p.sprite.x - 100);
    p.alive = true;
    p.hp = p.maxHp;
    p.invulnerable = false;
    p.attacking = false;
    p.state = 'idle';
    p.sprite.setTexture(`${this.chosenKey}-idle`);
    p.sprite.clearTint();
    p.sprite.setAlpha(1);
    p.sprite.setPosition(respawnX, PLAYER_SPAWN_Y);
    p.sprite.body.setVelocity(0, 0);
    this.updateHpText();
  }

  _overlap(a, b) {
    if (!a || !b || !a.scene || !b.scene) return false;
    const ar = a.body
      ? new Phaser.Geom.Rectangle(a.body.x, a.body.y, a.body.width, a.body.height)
      : a.getBounds();
    const br = b.body
      ? new Phaser.Geom.Rectangle(b.body.x, b.body.y, b.body.width, b.body.height)
      : b.getBounds();
    return Phaser.Geom.Intersects.RectangleToRectangle(ar, br);
  }
}
