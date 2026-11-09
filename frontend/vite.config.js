import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:8000',
      '/dashboard': 'http://localhost:8000',
      '/items': 'http://localhost:8000',
      '/partners': 'http://localhost:8000',
      '/purchase': 'http://localhost:8000',
      '/receipt': 'http://localhost:8000',
      '/sales': 'http://localhost:8000',
      '/quality': 'http://localhost:8000',
      '/production': 'http://localhost:8000',
      '/bom': 'http://localhost:8000',
      '/report': 'http://localhost:8000',
      '/invoice': 'http://localhost:8000',
      '/cost': 'http://localhost:8000',
      '/mold': 'http://localhost:8000',
      '/hr': 'http://localhost:8000',
      '/mes': 'http://localhost:8000',
      '/mrp': 'http://localhost:8000',
      '/management': 'http://localhost:8000',
      '/lot': 'http://localhost:8000',
      '/users': 'http://localhost:8000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/xlsx')) return 'xlsx'
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/')
          ) return 'vendor'
        },
      },
    },
  },
})
