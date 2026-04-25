import Phaser from 'phaser';
import { MainMenu } from './scenes/MainMenu.js';
import { CharacterSelect } from './scenes/CharacterSelect.js';
import { BootScene } from './scenes/BootScene.js';
import { Stage2 } from './scenes/Stage2.js';
import { Stage3 } from './scenes/Stage3.js';
import { Stage4 } from './scenes/Stage4.js';
import { GameOver } from './scenes/GameOver.js';
import { TouchControls } from './ui/TouchControls.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1024,
  height: 576,
  backgroundColor: '#555',
  pixelArt: true, // nearest-neighbor filtering for crisp pixel-art sprites
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // MainMenu is first → Phaser auto-starts it. Flow:
  //   MainMenu → CharacterSelect → BootScene → Stage2 → Stage3 → Stage4 → GameOver → {CharacterSelect | MainMenu}
  scene: [MainMenu, CharacterSelect, BootScene, Stage2, Stage3, Stage4, GameOver],
};

window.game = new Phaser.Game(config);

// Mount on-screen touch controls (D-pad + attack button) for iPad / touch
// devices. No-ops on desktop. Synthesizes ArrowLeft/Right/Up/Down + KeyZ
// keyboard events so Player.js and all scenes pick them up unchanged.
if (typeof window !== 'undefined') {
  new TouchControls();
}
