const STAGE_TRANSITION_DELAY_MS = 5000;

export function sealFinalSection(scene) {
  scene.currentSectionIndex = scene.sections?.length ?? scene.currentSectionIndex;
  scene.waveTransitioning = true;
}

export function showStageTransition(scene, { title, subtitle, nextLabel, onComplete }) {
  if (scene._stageTransitionStarted) return;
  scene._stageTransitionStarted = true;
  scene.stageCleared = true;

  scene.player?.sprite?.body?.setVelocity(0, 0);
  scene.activeHitboxes?.forEach((h) => {
    if (h && h.scene) h.destroy();
  });
  scene.activeHitboxes = [];

  scene.add.rectangle(512, 288, 1024, 576, 0x05040d, 0.78)
    .setDepth(1000000)
    .setScrollFactor(0);

  scene.add.text(512, 210, title, {
    fontFamily: 'monospace',
    fontSize: '54px',
    color: '#ffd54a',
    stroke: '#000000',
    strokeThickness: 6,
  }).setOrigin(0.5).setDepth(1000001).setScrollFactor(0);

  if (subtitle) {
    scene.add.text(512, 280, subtitle, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(1000001).setScrollFactor(0);
  }

  scene.add.text(512, 340, nextLabel, {
    fontFamily: 'monospace',
    fontSize: '22px',
    color: '#00e5ff',
    stroke: '#000000',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(1000001).setScrollFactor(0);

  const loading = scene.add.text(512, 392, 'Loading automatically...', {
    fontFamily: 'monospace',
    fontSize: '16px',
    color: '#cfc6e4',
  }).setOrigin(0.5).setDepth(1000001).setScrollFactor(0);

  scene.tweens.add({
    targets: loading,
    alpha: 0.35,
    duration: 650,
    yoyo: true,
    repeat: -1,
  });

  scene.time.delayedCall(STAGE_TRANSITION_DELAY_MS, () => {
    if (!scene.scene.isActive() || scene.gameOver) return;
    onComplete?.();
  });
}
