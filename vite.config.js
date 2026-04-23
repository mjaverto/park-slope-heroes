import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // binds to 0.0.0.0 for LAN access (iPad)
    port: 5173,
  },
});
