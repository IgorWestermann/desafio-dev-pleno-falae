import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxy = {
  target: process.env.API_PROXY_TARGET ?? 'http://localhost:3333',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api/, ''),
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiProxy,
    },
  },
  preview: {
    proxy: {
      '/api': apiProxy,
    },
  },
})
