import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server/index.ts', 'server/run-email-worker.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  format: ['esm'],
  target: 'node18',
  // Add this 'external' array to exclude problematic packages
  external: [
    '@babel/preset-typescript',
    'lightningcss',
  ],
});