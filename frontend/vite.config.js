import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const resolveApiTarget = () => {
  const raw = process.env.VITE_API_URL || 'http://localhost:5000'
  try {
    const url = new URL(raw)
    url.pathname = ''
    return url.origin
  } catch {
    return raw.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '') || 'http://localhost:5000'
  }
}

// Vite configuration — WorkFlow Frontend
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '8443'),
    proxy: {
      '/api': {
        target: resolveApiTarget(),
        changeOrigin: true,
      },
      '/uploads': {
        target: resolveApiTarget(),
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '8443'),
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react'
            }
            if (id.includes('@tanstack/react-query') || id.includes('zustand')) {
              return 'vendor-query'
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons'
            }
            return 'vendor-other'
          }
        },
      },
    },
  },
})
