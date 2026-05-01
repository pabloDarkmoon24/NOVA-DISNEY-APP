import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Security headers en el servidor de desarrollo.
    // En producción los headers los provee Express + Helmet con configuración más estricta.
    headers: {
      'X-Content-Type-Options':    'nosniff',
      'X-Frame-Options':           'DENY',
      'Referrer-Policy':           'strict-origin-when-cross-origin',
      'Permissions-Policy':        'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-XSS-Protection':          '0',
    },
    proxy: {
      '/api': {
        target:       'http://localhost:5000',
        changeOrigin: true,
        secure:       false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // desactivar sourcemaps en producción
  },
})
