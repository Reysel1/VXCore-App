import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import cef103 from './cef-103'

export default defineConfig({
  base: './',
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  plugins: [react(), tailwindcss(), cef103()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@panel': path.resolve(__dirname, '../src'),
    },
    dedupe: ['react', 'react-dom', '@base-ui/react', 'cmdk', 'class-variance-authority', 'tailwind-merge', 'clsx'],
  },
  build: {
    outDir: path.resolve(__dirname, '../vxcore/source/nui/assets'),
    emptyOutDir: true,
    target: 'es2017',
    assetsInlineLimit: (fichero, contenido) => fichero.endsWith('.woff2') || contenido.length < 4096,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name].js',
        assetFileNames: asset => (asset.names?.[0] ?? '').endsWith('.css') ? 'css/[name][extname]' : '[name][extname]',
      },
    },
  },
})
