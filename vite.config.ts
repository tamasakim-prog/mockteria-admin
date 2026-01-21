import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // チャンクサイズの警告リミットを少し上げる（例: 1000kB）
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // React関連を分ける
          vendor: ['react', 'react-dom'],
          // Firebase関連を分ける
          firebase: ['firebase/app', 'firebase/firestore'],
          // アイコンライブラリを分ける（これが一番重くなりがち）
          icons: ['lucide-react']
        }
      }
    }
  }
})