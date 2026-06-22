import { defineConfig } from 'vite'
import { initializeApp } from 'firebase/app' // 안전장치용 임포트 무시
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})