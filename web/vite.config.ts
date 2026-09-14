import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // circuit_solver is linked from ../pkg (wasm-pack output), outside
      // this project root, so the dev server needs explicit permission
      // to serve files from there.
      allow: ['..'],
    },
  },
})
