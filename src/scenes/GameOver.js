import Phaser from 'phaser';
import { SoundManager } from '../audio/SoundManager.js';
import { getCharacter } from '../data/characters.js';

// Shared palette with MainMenu / CharacterSelect.
const COLOR_BG = 0x0f0a1a;
const COLOR_TEXT = '#ffffff';
const COLOR_DIM = '#888888';
const COLOR_ACCENT = '#00e5ff';
const COLOR_GOLD = '#ffd54a';
const COLOR_RED = '#ff6666';
const HERO_SCALE = 0.18;

export class GameOver extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  preload() {
    // Re-declare the audio preload so GameOver can fade back to menu music
    // if the scene is entered standalone (e.g. dev hot-reload).
    new SoundManager(this).preload();

    this.missingAssets = new Set();
    this.load.on('loaderror', (file) => {
      if (file && file.key) this.missingAssets.add(file.key);
    });

    if (this.chosenChar) {
      this.load.image(`${this.chosenChar}-idle`, `./assets/sprites/${this.chosenChar}-idle.png`);
      this.load.image(`${this.chosenChar}-hit`, `./assets/sprites/${this.chosenChar}-hit.png`);
    }
  }

  init(data) {
    // Accept { score, chosenChar, victory } from the previous scene.
    this.finalScore = data?.score ?? 0;
    this.chosenChar = data?.chosenChar ?? null;
    this.victory = Boolean(data?.victory);
  }

  create() {
    this.sound_mgr = new SoundManager(this);
    this.selectedIndex = 0;
    this.options = [
      { label: this.victory ? 'Play Again' : 'Keep Trying', target: 'retry' },
      { label: 'Back to Title', target: 'MainMenu' },
    ];
    this.optionTexts = [];
    this._confirming = false;

    // Any music still playing from a stage was stopped before scene.start().
    // Keep this scene mostly quiet; the animation/text should carry the beat.
    if (this.victory) this._createVictoryClosing();
    else this._createDefeatTryAgain();

    this._buildOptions();
    this._refreshSelection();

    // Input
    this.input.keyboard.on('keydown-UP', () => this._move(-1));
    this.input.keyboard.on('keydown-DOWN', () => this._move(1));
    this.input.keyboard.on('keydown-ENTER', () => this._confirm());
    this.input.keyboard.on('keydown-SPACE', () => this._confirm());
  }

  _createDefeatTryAgain() {
    this.add.rectangle(512, 288, 1024, 576, COLOR_BG).setOrigin(0.5);

    // A simple animated street defeat tableau: the hero drops in, the city
    // goes quiet, then the retry question appears.
    this.add.rectangle(512, 430, 1024, 292, 0x1a1324).setOrigin(0.5);
    for (let x = 60; x < 1024; x += 135) {
      const h = Phaser.Math.Between(95, 170);
      this.add.rectangle(x, 365 - h / 2, 88, h, 0x211933).setOrigin(0.5);
      for (let wy = 300 - h; wy < 342; wy += 28) {
        this.add.rectangle(x - 22, wy, 10, 14, 0x4d3c67, 0.8);
        this.add.rectangle(x + 18, wy + 8, 10, 14, 0x4d3c67, 0.8);
      }
    }

    const shadow = this.add.ellipse(512, 412, 190, 34, 0x000000, 0.45).setScale(0.2, 0.5);
    const hero = this._addHero(512, 160, 'hit', 0.8);
    if (hero.setAngle) hero.setAngle(-12);

    this.tweens.add({
      targets: shadow,
      scaleX: 1,
      duration: 700,
      ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: hero,
      y: 418,
      angle: 0,
      duration: 700,
      ease: 'Bounce.easeOut',
    });

    const title = this.add.text(512, 84, 'YOU GOT KNOCKED DOWN', {
      fontFamily: 'monospace',
      fontSize: '44px',
      color: COLOR_RED,
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0);

    const question = this.add.text(512, 142, 'Keep trying to protect Park Slope?', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: COLOR_TEXT,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    const score = this.add.text(512, 190, `Score ${this.finalScore}`, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: COLOR_GOLD,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: title, alpha: 1, delay: 300, duration: 350 });
    this.tweens.add({ targets: [question, score], alpha: 1, delay: 550, duration: 350 });
    this.tweens.add({
      targets: hero,
      alpha: 0.55,
      duration: 180,
      yoyo: true,
      repeat: 2,
      delay: 800,
    });
  }

  _createVictoryClosing() {
    // Rooftop / high-rise epilogue overlooking JJ Byrne and the skate park.
    this.add.rectangle(512, 288, 1024, 576, 0x091326).setOrigin(0.5);

    const sky = this.add.graphics();
    sky.fillGradientStyle(0x2e155d, 0x2e155d, 0xf08a45, 0xf08a45, 1);
    sky.fillRect(0, 0, 1024, 576);

    // Distant Brooklyn skyline.
    const skyline = this.add.container(0, 20).setAlpha(0);
    for (let x = -10; x < 1060; x += 82) {
      const h = Phaser.Math.Between(110, 230);
      const b = this.add.rectangle(x, 330 - h / 2, 66, h, 0x1d2033).setOrigin(0.5);
      skyline.add(b);
      for (let wy = 220; wy < 324; wy += 26) {
        skyline.add(this.add.rectangle(x - 16, wy, 8, 12, 0xffc85a, 0.55));
        skyline.add(this.add.rectangle(x + 14, wy + 8, 8, 12, 0xffc85a, 0.45));
      }
    }

    // JJ Byrne / Old Stone House / skate park below, seen from above.
    const park = this.add.container(0, 48).setAlpha(0);
    park.add(this.add.rectangle(512, 405, 860, 210, 0x1f6b3c).setOrigin(0.5));
    park.add(this.add.rectangle(512, 405, 800, 150, 0x2b8a4e, 0.9).setOrigin(0.5));
    park.add(this.add.rectangle(304, 402, 260, 120, 0x77737d).setOrigin(0.5));
    park.add(this.add.rectangle(304, 402, 210, 82, 0x8e8992).setOrigin(0.5));
    park.add(this.add.triangle(232, 424, 0, 54, 78, 0, 156, 54, 0x55515d));
    park.add(this.add.triangle(376, 424, 0, 54, 78, 0, 156, 54, 0x55515d));
    park.add(this.add.rectangle(706, 396, 250, 120, 0x3c3b45).setOrigin(0.5));
    park.add(this.add.ellipse(660, 396, 105, 52, 0x77717c));
    park.add(this.add.ellipse(760, 398, 132, 58, 0x77717c));
    park.add(this.add.rectangle(706, 456, 280, 12, 0xd6b46a).setOrigin(0.5));
    park.add(this.add.text(512, 516, 'JJ BYRNE PLAYGROUND · SKATE PARK', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: COLOR_TEXT,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5));

    // High-rise balcony foreground.
    const balcony = this.add.container(0, 0).setAlpha(0);
    balcony.add(this.add.rectangle(512, 545, 1024, 90, 0x15111f).setOrigin(0.5));
    balcony.add(this.add.rectangle(512, 500, 900, 16, 0x353044).setOrigin(0.5));
    for (let x = 100; x < 930; x += 75) {
      balcony.add(this.add.rectangle(x, 542, 10, 82, 0x353044).setOrigin(0.5));
    }

    const hero = this._addHero(512, 512, 'idle', 0.9);
    hero.setAlpha?.(0);
    const capeGlow = this.add.ellipse(512, 498, 170, 30, 0x000000, 0.35).setAlpha(0);

    const title = this.add.text(512, 92, 'PARK SLOPE IS SAFE', {
      fontFamily: 'monospace',
      fontSize: '50px',
      color: COLOR_GOLD,
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0);

    const line = this.add.text(
      512,
      148,
      'From high above JJ Byrne, your hero watches over the neighborhood.',
      {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLOR_TEXT,
        stroke: '#000000',
        strokeThickness: 3,
      }
    ).setOrigin(0.5).setAlpha(0);

    const score = this.add.text(512, 190, `Final Score ${this.finalScore}`, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: COLOR_ACCENT,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: skyline, alpha: 1, y: 0, duration: 900, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: park, alpha: 1, y: 0, delay: 500, duration: 900, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: balcony, alpha: 1, delay: 1000, duration: 500 });
    this.tweens.add({ targets: [hero, capeGlow], alpha: 1, delay: 1250, duration: 500 });
    this.tweens.add({ targets: hero, y: 496, delay: 1250, duration: 900, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [title, line, score], alpha: 1, delay: 1700, duration: 700 });
  }

  _addHero(x, y, pose, alpha = 1) {
    const key = this.chosenChar ? `${this.chosenChar}-${pose}` : null;
    const hasTexture = key && this.textures.exists(key) && !this.missingAssets?.has(key);
    if (!hasTexture) {
      return this.add.rectangle(x, y - 50, 70, 110, this.victory ? 0xffd54a : 0xff6666, alpha)
        .setOrigin(0.5, 1);
    }

    const { stats } = getCharacter(this.chosenChar);
    return this.add.image(x, y, key)
      .setOrigin(0.5, 1)
      .setScale(HERO_SCALE * (stats.scale ?? 1) * 1.15)
      .setAlpha(alpha);
  }

  _buildOptions() {
    const baseY = this.victory ? 330 : 470;
    this.optionTexts = this.options.map((opt, i) => {
      const text = this.add
        .text(512, baseY + i * 42, opt.label, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: COLOR_TEXT,
          backgroundColor: 'rgba(0,0,0,0.35)',
          padding: { x: 14, y: 7 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => {
        this.selectedIndex = i;
        this._refreshSelection();
        this._confirm();
      });
      return text;
    });

    this.add
      .text(512, 552, 'Tap an option · ↑↓ + ENTER also works', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: this.victory ? COLOR_TEXT : COLOR_DIM,
        stroke: this.victory ? '#000000' : undefined,
        strokeThickness: this.victory ? 2 : 0,
      })
      .setOrigin(0.5);
  }

  _move(dy) {
    const next = Phaser.Math.Clamp(this.selectedIndex + dy, 0, this.options.length - 1);
    if (next !== this.selectedIndex) {
      this.selectedIndex = next;
      this._refreshSelection();
    }
  }

  _refreshSelection() {
    this.optionTexts.forEach((t, i) => {
      const selected = i === this.selectedIndex;
      t.setColor(selected ? COLOR_ACCENT : COLOR_TEXT);
      t.setText(selected ? `> ${this.options[i].label} <` : this.options[i].label);
    });
  }

  _confirm() {
    if (this._confirming) return;
    this._confirming = true;
    const target = this.options[this.selectedIndex].target;

    if (target === 'retry') {
      if (this.chosenChar) this.registry.set('chosenChar', this.chosenChar);
      this.scene.start('BootScene');
      return;
    }

    this.scene.start(target);
  }
}
