/// <reference types='vitest' />
import * as path from 'path'
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/3d-tiles',
  plugins: [
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(__dirname, 'tsconfig.lib.json')
    }),
    glsl()
  ],

  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [nxViteTsPaths()]
  // },

  // Configuration for building your library.
  // See: https://vitejs.dev/guide/build.html#library-mode
  build: {
    outDir: '../../dist/libs/3d-tiles',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      // Could also be a dictionary or array of multiple entry points.
      entry: 'src/index.ts',
      name: '3d-tiles',
      fileName: 'index',
      // Change this to the formats you want to support.
      // Don't forget to update your package.json as well.
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      // External packages that should not be bundled into your library.
      external: [
        /^@geovanni\/*/,
        'react',
        'react-dom',
        'react/jsx-runtime',
        'three',
        'three-stdlib',
        'postprocessing',
        '@react-three/fiber',
        '@react-three/drei',
        '@react-three/postprocessing'
      ]
    }
  }
})
