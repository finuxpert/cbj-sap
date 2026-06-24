import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/sap/',
  plugins: [react()],
  build: {
    // keep the warning, but make it less noisy for dashboards with charts
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Keep the heavy charting library cacheable without forcing an empty React vendor chunk.
        manualChunks: {
          recharts: ['recharts'],
        },
      },
    },
  },
})
