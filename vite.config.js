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
        // Split heavy libs so initial load is lighter and caching is better
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          recharts: ['recharts'],
        },
      },
    },
  },
})
