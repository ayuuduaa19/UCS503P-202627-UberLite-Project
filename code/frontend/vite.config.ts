import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_URL || 'http://localhost:5000'

  return {
    plugins: [react()],
    server: {
      port: parseInt(env.PORT || '5173', 10),
      host: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: parseInt(env.PORT || '4173', 10),
      host: true,
    },
  }
})

