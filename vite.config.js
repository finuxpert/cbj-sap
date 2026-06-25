import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  base: '/sap/',
  plugins: [
    react(),
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 10240,
      deleteOriginFile: false,
    }),
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 10240,
      deleteOriginFile: false,
    }),
    visualizer({
      filename: 'dist/bundle-stats.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ],
  build: {
    // keep the warning visible while the ECharts ST03N bundle is being optimized
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Keep charting libraries cacheable and easier to inspect in bundle-stats.html.
        manualChunks: {
          recharts: ['recharts'],
          echarts: ['echarts', 'echarts-for-react'],
        },
      },
    },
  },
})
