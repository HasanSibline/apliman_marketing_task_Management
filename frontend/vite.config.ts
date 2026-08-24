import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',

    /**
     * No source maps in the production bundle.
     *
     * This was `true`, and the built JS ended with a sourceMappingURL comment, so every
     * deploy published complete readable source for the whole application and browsers
     * fetched it: 18MB of dist, most of it maps. For a commercial multi-tenant product
     * that is the entire codebase handed to anyone who opens devtools, and the maps also
     * embed the absolute build path from whichever machine ran the build.
     *
     * If stack traces from production are wanted later, the answer is to generate maps
     * in CI and upload them to an error tracker, not to serve them next to the bundle.
     */
    sourcemap: false,

    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          redux: ['@reduxjs/toolkit', 'react-redux', 'redux-persist'],
          ui: ['@headlessui/react', '@heroicons/react', 'framer-motion'],
          charts: ['recharts'],
          socket: ['socket.io-client'],
        },
      },
    },
  },
})
