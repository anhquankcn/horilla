import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/pwa/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HNH Travel · HRM',
        short_name: 'HNH HRM',
        description: 'Hệ thống nhân sự nội bộ — Hồng Ngọc Hà Travel',
        theme_color: '#142B6F',
        background_color: '#142B6F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        importScripts: ['push-sw.js'],
        // Exclude Django backend URLs from service worker navigation interception.
        // Without this, iframe loads to /deeplink/, /eoffice/, etc. get served
        // index.html by the SW, which then falls back to <Navigate to="/" />.
        navigateFallbackDenylist: [
          /^\/deeplink\//,
          /^\/eoffice\//,
          /^\/accounts\//,
          /^\/oidc\//,
          /^\/admin\//,
          /^\/api\//,
          /^\/attendance\//,
          /^\/employee\//,
          /^\/leave\//,
          /^\/payroll\//,
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/bff': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}))
