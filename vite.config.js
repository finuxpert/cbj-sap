import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

function gitValue(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const gitSha = String(process.env.GITHUB_SHA || gitValue('rev-parse', '--short=7', 'HEAD')).slice(0, 7)
const appEnv = String(process.env.GITHUB_REF_NAME || gitValue('branch', '--show-current'))

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_GIT_SHA': JSON.stringify(gitSha),
    'import.meta.env.VITE_APP_ENV': JSON.stringify(appEnv),
  },
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
