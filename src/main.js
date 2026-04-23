import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1024,
  height: 576,
  backgroundColor: '#555',
  pixelArt: true, // nearest-neighbor filtering for crisp pixel-art sprites
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene],
};

window.game = new Phaser.Game(config);
