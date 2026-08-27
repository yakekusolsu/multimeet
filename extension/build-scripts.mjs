import { build } from 'esbuild';

await build({
  entryPoints: {
    background: 'src/background/index.ts',
    bridge: 'src/content/bridge.ts',
    'ometv-provider': 'src/providers/ometv/index.ts',
  },
  outdir: 'dist',
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'chrome120',
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
});
