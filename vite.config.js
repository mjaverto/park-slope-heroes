import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // binds to 0.0.0.0 for LAN access (iPad)
    port: 5173,
  },
  // Relative base so the built bundle works under any deploy subpath
  // (e.g. https://host/apps/quicks/park-slope-heroes-averto/). Phaser
  // runtime asset loads already use './assets/...' which resolve against
  // the served page URL; the Vite-emitted script tags resolve the same way.
  base: './',
  build: {
    // Emit bundled JS/CSS under ./bundle/ so it doesn't collide with the
    // game's runtime ./assets/ folder (sprites, backgrounds, audio) when
    // the built output is copied flat into a Quick site target.
    assetsDir: 'bundle',
  },
});
