import Phaser from 'phaser';
import { MainMenu } from './scenes/MainMenu.js';
import { CharacterSelect } from './scenes/CharacterSelect.js';
import { BootScene } from './scenes/BootScene.js';
import { GameOver } from './scenes/GameOver.js';

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
  //   MainMenu → CharacterSelect → BootScene → GameOver → {CharacterSelect | MainMenu}
  scene: [MainMenu, CharacterSelect, BootScene, GameOver],
};

window.game = new Phaser.Game(config);
