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

function installDebugShortcuts(game) {
  if (typeof window === 'undefined') return;

  const stageNames = ['BootScene', 'Stage2', 'Stage3', 'Stage4'];

  const startStage = (stage = 'Stage4', options = {}) => {
    const sceneKey = stageNames.includes(stage) ? stage : `Stage${stage}`;
    const char = options.char ?? 'lyelle';
    const score = options.score ?? 0;
    const lives = options.lives ?? 3;

    game.registry.set('chosenChar', char);
    game.scene.getScenes(true).forEach((scene) => scene.scene.stop());
    game.scene.start(sceneKey, { score, lives, chosenChar: char });

    return new Promise((resolve) => {
      const waitForScene = () => {
        const scene = game.scene.getScene(sceneKey);
        if (scene?.player?.sprite) {
          resolve(scene);
          return;
        }
        window.setTimeout(waitForScene, 50);
      };
      waitForScene();
    });
  };

  window.pshDebug = {
    startStage,
    stage1: (options) => startStage('BootScene', options),
    stage2: (options) => startStage('Stage2', options),
    stage3: (options) => startStage('Stage3', options),
    stage4: (options) => startStage('Stage4', options),
    beakzilla: async (options) => {
      const scene = await startStage('Stage4', options);
      scene.player.sprite.setPosition(3710, 420);
      scene.cameras.main.centerOn(3710, 420);
      return scene;
    },
  };
}

installDebugShortcuts(window.game);

// Mount on-screen touch controls (D-pad + attack button) for iPad / touch
// devices. No-ops on desktop. Synthesizes ArrowLeft/Right/Up/Down + KeyZ
// keyboard events so Player.js and all scenes pick them up unchanged.
if (typeof window !== 'undefined') {
  new TouchControls();
}
