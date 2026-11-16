import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'LEDGER_')
  const backendPort = env.LEDGER_PORT || '8000'
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: false },
      },
    },
  }
})
