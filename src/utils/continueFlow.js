const CONTINUE_LIVES = 3;
const CONTINUE_SECONDS = 10;
const CONTINUE_REGISTRY_KEY = 'continueUsed';

export function resetContinue(scene) {
  scene.registry.set(CONTINUE_REGISTRY_KEY, false);
}

export function handlePlayerDeath(scene, { getUpTextMs }) {
  if (scene.player.hp > 0 || scene.gameOver || scene._respawning) return;

  scene.lives -= 1;
  scene.updateLivesText();

  if (scene.lives > 0) {
    startRespawn(scene, getUpTextMs);
    return;
  }

  if (!scene.registry.get(CONTINUE_REGISTRY_KEY)) {
    showContinuePrompt(scene, getUpTextMs);
    return;
  }

  goToGameOver(scene);
}

function startRespawn(scene, getUpTextMs) {
  scene._respawning = true;
  const banner = scene.add.text(512, 288, 'GET UP!', {
    fontFamily: 'monospace',
    fontSize: '56px',
    color: '#ffd54a',
    stroke: '#000000',
    strokeThickness: 6,
  }).setOrigin(0.5).setDepth(100001).setScrollFactor(0);

  scene.time.delayedCall(getUpTextMs, () => {
    if (banner && banner.scene) banner.destroy();
    scene._respawnPlayer();
    scene._respawning = false;
  });
}

function showContinuePrompt(scene, getUpTextMs) {
  scene._respawning = true;

  const overlay = scene.add.container(0, 0).setDepth(100002).setScrollFactor(0);
  const panel = scene.add.rectangle(512, 288, 640, 300, 0x05020a, 0.9)
    .setOrigin(0.5)
    .setStrokeStyle(4, 0xffd54a);
  const title = scene.add.text(512, 205, 'CONTINUE?', {
    fontFamily: 'monospace',
    fontSize: '56px',
    color: '#ffd54a',
    stroke: '#000000',
    strokeThickness: 6,
  }).setOrigin(0.5);
  const countdown = scene.add.text(512, 278, `${CONTINUE_SECONDS}`, {
    fontFamily: 'monospace',
    fontSize: '44px',
    color: '#00e5ff',
    stroke: '#000000',
    strokeThickness: 5,
  }).setOrigin(0.5);
  const prompt = scene.add.text(
    512,
    350,
    `Press ENTER / SPACE or tap to get ${CONTINUE_LIVES} more lives`,
    {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    },
  ).setOrigin(0.5);
  const hint = scene.add.text(512, 388, 'One continue per run', {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: '#cfc6e4',
  }).setOrigin(0.5);

  overlay.add([panel, title, countdown, prompt, hint]);
  panel.setInteractive({ useHandCursor: true });

  const expiresAt = scene.time.now + CONTINUE_SECONDS * 1000;
  let done = false;
  let tickTimer = null;
  let expireTimer = null;

  const cleanup = () => {
    scene.input.keyboard?.off('keydown-ENTER', accept);
    scene.input.keyboard?.off('keydown-SPACE', accept);
    scene.input.off('pointerdown', accept);
    scene.events.off('shutdown', cleanup);
    expireTimer?.remove(false);
    tickTimer?.remove(false);
    if (overlay.scene) overlay.destroy();
  };

  const accept = () => {
    if (done) return;
    done = true;
    scene.registry.set(CONTINUE_REGISTRY_KEY, true);
    cleanup();
    scene.lives = CONTINUE_LIVES;
    scene.updateLivesText();
    startRespawn(scene, getUpTextMs);
  };

  const expire = () => {
    if (done) return;
    done = true;
    cleanup();
    goToGameOver(scene);
  };

  const updateCountdown = () => {
    const remaining = Math.max(0, Math.ceil((expiresAt - scene.time.now) / 1000));
    countdown.setText(`${remaining}`);
  };

  scene.input.keyboard?.on('keydown-ENTER', accept);
  scene.input.keyboard?.on('keydown-SPACE', accept);
  scene.input.on('pointerdown', accept);
  scene.events.once('shutdown', cleanup);

  tickTimer = scene.time.addEvent({ delay: 250, loop: true, callback: updateCountdown });
  expireTimer = scene.time.delayedCall(CONTINUE_SECONDS * 1000, expire);
  updateCountdown();
}

function goToGameOver(scene) {
  scene.gameOver = true;
  scene.sound_mgr?.stopMusic();
  scene.scene.start('GameOver', {
    score: scene.score,
    chosenChar: scene.chosenKey,
    victory: false,
  });
}
