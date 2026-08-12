import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        user: resolve(process.cwd(), 'index.html'),
        admin: resolve(process.cwd(), 'admin/index.html'),
      },
    },
  },
})
