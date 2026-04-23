// SoundManager — thin helper attached to a scene for playing SFX and music.
// Kept minimal: no volume UI, no settings persistence, no mute. Just preload
// + play. Entities access the active scene's sound_mgr via
// `this.scene.sound_mgr?.playSfx(...)` — optional chaining keeps unit tests
// (which may construct entities without a scene) from blowing up.
//
// Asset key → file mapping lives in preload(); see assets/audio/CREDITS.md
// for provenance. All files CC0 (Juhani Junkala retro packs).

const SFX_ASSETS = [
  { key: 'sfx_attack', path: '/assets/audio/sfx/swing.wav' },
  { key: 'sfx_hit', path: '/assets/audio/sfx/hit.wav' },
  { key: 'sfx_player_hurt', path: '/assets/audio/sfx/player-hurt.wav' },
  { key: 'sfx_enemy_death', path: '/assets/audio/sfx/enemy-die.wav' },
  { key: 'sfx_pickup', path: '/assets/audio/sfx/pickup.wav' },
];

const MUSIC_ASSETS = [
  { key: 'music_stage1', path: '/assets/audio/music/stage1.ogg' },
  { key: 'music_menu', path: '/assets/audio/music/title.ogg' },
];

const DEFAULT_SFX_VOLUME = 0.6;
const DEFAULT_MUSIC_VOLUME = 0.35;

export class SoundManager {
  constructor(scene) {
    this.scene = scene;
    this.currentMusic = null;
  }

  // Load every SFX + music asset on the scene's loader. Phaser dedupes by
  // key, so calling preload() from multiple scenes is safe.
  preload() {
    for (const { key, path } of SFX_ASSETS) {
      this.scene.load.audio(key, path);
    }
    for (const { key, path } of MUSIC_ASSETS) {
      this.scene.load.audio(key, path);
    }
  }

  playSfx(key, config = {}) {
    if (!this.scene.cache.audio.exists(key)) {
      console.warn(`[SoundManager] missing SFX key: ${key}`);
      return;
    }
    this.scene.sound.play(key, { volume: DEFAULT_SFX_VOLUME, ...config });
  }

  startMusic(key, config = {}) {
    this.stopMusic();
    if (!this.scene.cache.audio.exists(key)) {
      console.warn(`[SoundManager] missing music key: ${key}`);
      return;
    }
    this.currentMusic = this.scene.sound.add(key, {
      volume: DEFAULT_MUSIC_VOLUME,
      loop: true,
      ...config,
    });
    this.currentMusic.play();
  }

  stopMusic() {
    if (this.currentMusic) {
      this.currentMusic.stop();
      this.currentMusic = null;
    }
  }
}
