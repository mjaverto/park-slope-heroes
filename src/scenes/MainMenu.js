import Phaser from 'phaser';
import { SoundManager } from '../audio/SoundManager.js';

// Palette matches CharacterSelect so the title → select handoff doesn't flash
// a different bg.
const COLOR_BG = 0x0f0a1a;
const COLOR_TEXT = '#ffffff';
const COLOR_ACCENT = '#00e5ff';
const COLOR_GOLD = '#ffd54a';
const COLOR_TAGLINE = '#cfc6e4';

export class MainMenu extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  preload() {
    // SoundManager handles all audio preload. Phaser dedupes by key so
    // re-preloading in later scenes is a no-op.
    new SoundManager(this).preload();

    // Track missing title bg so create() can fall back to the plain
    // rectangle backdrop if the PNG isn't on disk (e.g. during
    // regeneration). Same pattern Stage2 uses for its tiles.
    this.missingAssets = new Set();
    this.load.on('loaderror', (file) => {
      if (file && typeof file.key === 'string') {
        this.missingAssets.add(file.key);
      }
    });

    // Title hero background. Use a relative path (NOT leading-slash) so
    // deployment-time path rewrites work correctly.
    this.load.image('title-bg', './assets/backgrounds/title-bg.png');
  }

  create() {
    this.sound_mgr = new SoundManager(this);
    this._musicStarted = false;
    this._confirming = false;

    // Backdrop — use the generated title image when available, else fall
    // back to the plain purple rectangle.
    if (this.textures.exists('title-bg') && !this.missingAssets?.has('title-bg')) {
      this.add
        .image(512, 288, 'title-bg')
        .setOrigin(0.5)
        .setDisplaySize(1024, 576)
        .setDepth(-10);
    } else {
      this.add.rectangle(512, 288, 1024, 576, COLOR_BG).setOrigin(0.5).setDepth(-10);
    }

    // Big title
    this.add
      .text(512, 200, 'PARK SLOPE', {
        fontFamily: 'monospace',
        fontSize: '72px',
        color: COLOR_GOLD,
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.add
      .text(512, 275, 'HEROES', {
        fontFamily: 'monospace',
        fontSize: '72px',
        color: COLOR_ACCENT,
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    // Subtitle
    this.add
      .text(512, 340, 'A Brooklyn Beat-em-up', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLOR_TAGLINE,
      })
      .setOrigin(0.5);

    // Blinking prompt
    this.prompt = this.add
      .text(512, 450, 'Press ENTER or click to Start', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: this.prompt,
      alpha: 0.2,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // Footer hint
    this.add
      .text(512, 552, 'Arrows/WASD controls · Z to attack · Cross 5th to JJ Byrne Park', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: COLOR_TAGLINE,
      })
      .setOrigin(0.5);

    // Input
    this.input.keyboard.on('keydown-ENTER', () => this._confirm());
    this.input.keyboard.on('keydown-SPACE', () => this._confirm());
    this.input.on('pointerdown', () => this._confirm());

    // Autoplay gate — same pattern as CharacterSelect. Browsers block audio
    // until the user interacts, so gate the music on first keydown/click.
    this.input.keyboard.on('keydown', () => this._ensureMusic());
    this.input.on('pointerdown', () => this._ensureMusic());
  }

  _ensureMusic() {
    if (this._musicStarted || this._confirming) return;
    this._musicStarted = true;
    this.sound_mgr.startMusic('music_menu');
  }

  _confirm() {
    if (this._confirming) return;
    this._confirming = true;
    // Keep menu music playing through CharacterSelect — that scene re-uses
    // music_menu so stopping now would just cause a blip. CharacterSelect's
    // own _ensureMusic() is idempotent.
    this.scene.start('CharacterSelect');
  }
}
