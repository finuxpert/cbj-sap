import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import logSemanticsV160 from './scripts/vite-log-v160-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  base: '/sap/',
  plugins: [logSemanticsV160(), react()],
  build: {
    // keep the warning, but make it less noisy for dashboards with charts
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split heavy libs so initial load is lighter and caching is better
        manualChunks: {
          jszip: ['jszip'],
          recharts: ['recharts'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
})
