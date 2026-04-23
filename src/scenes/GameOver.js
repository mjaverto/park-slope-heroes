import Phaser from 'phaser';
import { SoundManager } from '../audio/SoundManager.js';

// Shared palette with MainMenu / CharacterSelect.
const COLOR_BG = 0x0f0a1a;
const COLOR_TEXT = '#ffffff';
const COLOR_DIM = '#888888';
const COLOR_ACCENT = '#00e5ff';
const COLOR_GOLD = '#ffd54a';
const COLOR_RED = '#ff6666';

const OPTIONS = [
  { label: 'Retry', target: 'CharacterSelect' },
  { label: 'Back to Title', target: 'MainMenu' },
];

export class GameOver extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  preload() {
    // Re-declare the audio preload so GameOver can fade back to menu music
    // if the scene is entered standalone (e.g. dev hot-reload).
    new SoundManager(this).preload();
  }

  init(data) {
    // Accept { score, chosenChar, victory } from the previous scene.
    this.finalScore = data?.score ?? 0;
    this.chosenChar = data?.chosenChar ?? null;
    this.victory = Boolean(data?.victory);
  }

  create() {
    this.sound_mgr = new SoundManager(this);

    // Any music still playing from BootScene was stopped on scene.start() by
    // BootScene's shutdown handler. We deliberately do NOT restart music here
    // — silence sells the "end of run" moment. Menu music picks back up when
    // the player returns to MainMenu or CharacterSelect.

    // Backdrop
    this.add.rectangle(512, 288, 1024, 576, COLOR_BG).setOrigin(0.5);

    // Title — swap between GAME OVER / VICTORY based on init data
    const titleText = this.victory ? 'VICTORY!' : 'GAME OVER';
    const titleColor = this.victory ? COLOR_GOLD : COLOR_RED;
    this.add
      .text(512, 160, titleText, {
        fontFamily: 'monospace',
        fontSize: '72px',
        color: titleColor,
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    // Final score
    this.add
      .text(512, 260, 'FINAL SCORE', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLOR_DIM,
      })
      .setOrigin(0.5);
    this.add
      .text(512, 310, String(this.finalScore), {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: COLOR_GOLD,
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // Option menu
    this.selectedIndex = 0;
    this.optionTexts = OPTIONS.map((opt, i) => {
      return this.add
        .text(512, 410 + i * 42, opt.label, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: COLOR_TEXT,
        })
        .setOrigin(0.5);
    });
    this._refreshSelection();

    // Footer hint
    this.add
      .text(512, 552, '↑↓ to move · ENTER to confirm', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: COLOR_DIM,
      })
      .setOrigin(0.5);

    // Input
    this.input.keyboard.on('keydown-UP', () => this._move(-1));
    this.input.keyboard.on('keydown-DOWN', () => this._move(1));
    this.input.keyboard.on('keydown-ENTER', () => this._confirm());
    this.input.keyboard.on('keydown-SPACE', () => this._confirm());
  }

  _move(dy) {
    const next = Phaser.Math.Clamp(
      this.selectedIndex + dy,
      0,
      OPTIONS.length - 1
    );
    if (next !== this.selectedIndex) {
      this.selectedIndex = next;
      this._refreshSelection();
    }
  }

  _refreshSelection() {
    this.optionTexts.forEach((t, i) => {
      const selected = i === this.selectedIndex;
      t.setColor(selected ? COLOR_ACCENT : COLOR_TEXT);
      t.setText(selected ? `> ${OPTIONS[i].label} <` : OPTIONS[i].label);
    });
  }

  _confirm() {
    if (this._confirming) return;
    this._confirming = true;
    const target = OPTIONS[this.selectedIndex].target;
    this.scene.start(target);
  }
}
