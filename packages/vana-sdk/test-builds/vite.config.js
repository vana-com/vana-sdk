import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    minify: false,
    rollupOptions: {
      input: './src/verify.js',
    }
  },
  optimizeDeps: {
    exclude: ['@opendatalabs/vana-sdk']
  }
});