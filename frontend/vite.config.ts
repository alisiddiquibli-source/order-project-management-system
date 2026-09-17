import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Backend runs on a separate PHP process in dev; same-origin in
      // production once both are served from the same Bluehost domain.
      '/api': {
        target: 'http://127.0.0.1:8130',
        changeOrigin: true,
      },
    },
  },
})
