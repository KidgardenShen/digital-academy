// Produce the Node-only release CLI from the same entry point used by authors.
import { build } from 'vite';

await build({
  configFile: false,
  ssr: { noExternal: true },
  build: {
    ssr: 'scripts/validate.mjs',
    ssrEmitAssets: true,
    target: 'node24',
    outDir: 'dist/portable',
    emptyOutDir: false,
    minify: false,
    license: { fileName: 'THIRD_PARTY_LICENSES.md' },
    rolldownOptions: { output: { entryFileNames: 'validate.mjs' } },
  },
});
