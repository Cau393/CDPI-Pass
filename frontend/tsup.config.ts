import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server/index.ts', 'server/run-email-worker.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  format: ['esm'],
  target: 'node18',
  external: [
    '@babel/preset-typescript',
    'lightningcss',
    'vite',           // ✅ Add this
    'rollup',         // ✅ Add this
    'dotenv',         // ✅ Add this for safety
    '@vitejs/plugin-react',
    '@vitejs/plugin-react-swc',
    'express',
  ],
  // Add this to handle ESM properly
  shims: true,
  noExternal: [],
});