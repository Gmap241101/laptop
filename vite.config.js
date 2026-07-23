import { defineConfig } from 'vite'
import { initializeApp } from 'firebase/app' // 안전장치용 임포트 무시
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: "/", // 커스텀 도메인의 루트 경로를 기준으로 정적 파일 로드
  plugins: [react()],
})