import { defineConfig } from 'vite'
import { initializeApp } from 'firebase/app' // 안전장치용 임포트 무시
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: "/", // 깃허브 저장소 이름인 'laptop' 주소를 올바르게 인식
  plugins: [react()],
})