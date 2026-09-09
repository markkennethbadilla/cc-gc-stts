import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const outdir = 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: ['src/stts.ts', 'src/stts-mcp-server.ts', 'src/stts-daemon.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outdir,
  minify: true,
  outExtension: { '.js': '.mjs' },
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

copyFileSync(path.join('src', 'stts_ui.html'), path.join(outdir, 'stts_ui.html'));

console.log('Build complete: dist/stts.mjs, dist/stts-mcp-server.mjs, dist/stts-daemon.mjs');
