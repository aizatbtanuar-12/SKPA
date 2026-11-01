import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // never ship source maps: they would expose the original source in the browser's developer tools
  build: { sourcemap: false },
})
