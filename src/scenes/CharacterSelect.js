import Phaser from 'phaser';
import { CHARACTERS } from '../data/characters.js';
import { SoundManager } from '../audio/SoundManager.js';

// Grid: 3 cols x 2 rows of 260x200 cards, 20px gap, centered in 1024x576.
const CARD_W = 260;
const CARD_H = 200;
const GAP = 20;
const COLS = 3;
const ROWS = 2;
const GRID_W = COLS * CARD_W + (COLS - 1) * GAP; // 820
const GRID_H = ROWS * CARD_H + (ROWS - 1) * GAP; // 420
const GRID_X = Math.round((1024 - GRID_W) / 2); // 102
const GRID_Y = 120; // leaves ~80px for title, ~36px breathing room below

// Colors (TMNT-evocative: purple-on-black with cyan highlights).
const COLOR_BG = 0x0f0a1a;
const COLOR_CARD = 0x1e1430;
const COLOR_CARD_BORDER = 0x3a2a58;
const COLOR_CARD_HOVER = 0x2a1d44;
const COLOR_SELECT = 0x00e5ff;
const COLOR_PLACEHOLDER = 0x3a3a3a;
const COLOR_TEXT = '#ffffff';
const COLOR_TAGLINE = '#cfc6e4';
const COLOR_WEAPON = '#ffd447';

export class CharacterSelect extends Phaser.Scene {
  constructor() {
    super('CharacterSelect');
  }

  preload() {
    // Track which texture loads fail so we can render placeholders.
    this.missingTextures = new Set();
    this.load.on('loaderror', (file) => {
      if (file && file.key) this.missingTextures.add(file.key);
    });
    for (const c of CHARACTERS) {
      // Only request the idle pose for the select screen; gameplay scenes
      // handle the other poses.
      this.load.image(`${c.key}-idle`, `/assets/sprites/${c.key}-idle.png`);
    }

    // Audio — small enough to load in both scenes; Phaser dedupes by key.
    new SoundManager(this).preload();
  }

  create() {
    this.sound_mgr = new SoundManager(this);
    this._musicStarted = false;

    this.selectedIndex = 0;
    this.cards = [];

    // Backdrop.
    this.add.rectangle(512, 288, 1024, 576, COLOR_BG).setOrigin(0.5);

    // Title + subtitle.
    this.add
      .text(512, 50, 'CHOOSE YOUR HERO', {
        fontFamily: 'monospace',
        fontSize: '36px',
        color: COLOR_TEXT,
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.add
      .text(512, 85, 'Park Slope Heroes', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLOR_TAGLINE,
      })
      .setOrigin(0.5);

    // Build the 3x2 card grid.
    CHARACTERS.forEach((char, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = GRID_X + col * (CARD_W + GAP) + CARD_W / 2;
      const cy = GRID_Y + row * (CARD_H + GAP) + CARD_H / 2;
      this.cards.push(this._buildCard(char, i, cx, cy));
    });

    // Footer hint.
    this.add
      .text(
        512,
        552,
        '←↑↓→ to move    ENTER / SPACE to confirm    or click a card',
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: COLOR_TAGLINE,
        }
      )
      .setOrigin(0.5);

    // Keyboard input.
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this.input.keyboard.on('keydown-LEFT', () => this._move(-1, 0));
    this.input.keyboard.on('keydown-RIGHT', () => this._move(1, 0));
    this.input.keyboard.on('keydown-UP', () => this._move(0, -1));
    this.input.keyboard.on('keydown-DOWN', () => this._move(0, 1));
    this.input.keyboard.on('keydown-ENTER', () => this._confirm());
    this.input.keyboard.on('keydown-SPACE', () => this._confirm());

    // Autoplay gate: browsers block audio until the user interacts. Start
    // menu music on the first keydown/pointerdown. _musicStarted flag keeps
    // us from restarting on every key.
    this.input.keyboard.on('keydown', () => this._ensureMusic());
    this.input.on('pointerdown', () => this._ensureMusic());

    this._refreshSelection();
  }

  _buildCard(char, index, cx, cy) {
    const container = this.add.container(cx, cy);

    // Background + selection border (we redraw border on selection change).
    const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, COLOR_CARD).setOrigin(0.5);
    bg.setStrokeStyle(2, COLOR_CARD_BORDER);

    // Portrait area: top ~120px of card. Use idle sprite if loaded, else a
    // gray placeholder rectangle so the card still renders cleanly for kids
    // whose sprites are still being generated.
    const portraitKey = `${char.key}-idle`;
    const portraitY = -CARD_H / 2 + 70; // ~70 down from top
    let portrait;
    const hasTexture =
      this.textures.exists(portraitKey) && !this.missingTextures.has(portraitKey);
    if (hasTexture) {
      portrait = this.add.image(0, portraitY, portraitKey);
      // Fit portrait into a ~120x120 box preserving aspect ratio.
      const src = portrait;
      const maxDim = 120;
      const scale = Math.min(maxDim / src.width, maxDim / src.height, 2);
      portrait.setScale(scale);
    } else {
      portrait = this.add.rectangle(0, portraitY, 110, 110, COLOR_PLACEHOLDER);
      const q = this.add
        .text(0, portraitY, '?', {
          fontFamily: 'monospace',
          fontSize: '48px',
          color: '#888',
        })
        .setOrigin(0.5);
      container.add(q);
    }

    // Text stack: name, weapon, tagline.
    const nameText = this.add
      .text(0, CARD_H / 2 - 60, char.name, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5);
    const weaponText = this.add
      .text(0, CARD_H / 2 - 38, char.weapon, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLOR_WEAPON,
      })
      .setOrigin(0.5);
    const taglineText = this.add
      .text(0, CARD_H / 2 - 18, char.tagline, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: COLOR_TAGLINE,
      })
      .setOrigin(0.5);

    container.add([bg, portrait, nameText, weaponText, taglineText]);

    // Mouse interactions via an invisible hit zone on the bg rectangle.
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      if (this.selectedIndex !== index) {
        bg.setFillStyle(COLOR_CARD_HOVER);
      }
    });
    bg.on('pointerout', () => {
      if (this.selectedIndex !== index) {
        bg.setFillStyle(COLOR_CARD);
      }
    });
    bg.on('pointerdown', () => {
      this.selectedIndex = index;
      this._refreshSelection();
      this._confirm();
    });

    return { container, bg, index };
  }

  _move(dx, dy) {
    const col = this.selectedIndex % COLS;
    const row = Math.floor(this.selectedIndex / COLS);
    const nextCol = Phaser.Math.Clamp(col + dx, 0, COLS - 1);
    const nextRow = Phaser.Math.Clamp(row + dy, 0, ROWS - 1);
    const next = nextRow * COLS + nextCol;
    if (next !== this.selectedIndex && next < CHARACTERS.length) {
      this.selectedIndex = next;
      this._refreshSelection();
    }
  }

  _refreshSelection() {
    for (const card of this.cards) {
      const selected = card.index === this.selectedIndex;
      card.bg.setFillStyle(selected ? COLOR_CARD_HOVER : COLOR_CARD);
      card.bg.setStrokeStyle(selected ? 4 : 2, selected ? COLOR_SELECT : COLOR_CARD_BORDER);
    }
  }

  _ensureMusic() {
    // _confirming guards against the ordering quirk where Phaser's generic
    // `keydown` (used for our first-gesture gate) fires AFTER `keydown-SPACE`,
    // so we'd otherwise restart menu music on the same key press that just
    // transitioned us to BootScene.
    if (this._musicStarted || this._confirming) return;
    this._musicStarted = true;
    this.sound_mgr.startMusic('music_menu');
  }

  _confirm() {
    const chosen = CHARACTERS[this.selectedIndex];
    if (!chosen) return;
    this._confirming = true;
    this.registry.set('chosenChar', chosen.key);
    // Phaser doesn't auto-stop scene sounds on shutdown when added via
    // `sound.add`; stop menu music explicitly before handing off.
    this.sound_mgr.stopMusic();
    // Prefer Stage1 if it's been registered; otherwise fall back to BootScene.
    const nextKey = this.scene.manager.keys.Stage1 ? 'Stage1' : 'BootScene';
    this.scene.start(nextKey);
  }
}
