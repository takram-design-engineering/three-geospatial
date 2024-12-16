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
  cacheDir: '../../node_modules/.vite/packages/clouds',
  plugins: [
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['assets/**/*', 'src/**/*', '*.md']),
    dts({
      outDir: '../../dist/packages/clouds/types',
      entryRoot: 'src',
      tsconfigPath: path.join(__dirname, 'tsconfig.lib.json'),
      pathsToAliases: false,
      afterDiagnostic: diagnostics => {
        diagnostics.forEach(diagnostic => {
          console.warn(diagnostic)
        })
      }
    }),
    glsl()
  ],

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  // Configuration for building your library.
  // See: https://vitejs.dev/guide/build.html#library-mode
  build: {
    outDir: '../../dist/packages/clouds',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      // Could also be a dictionary or array of multiple entry points.
      entry: {
        'build/index': 'src/index.ts',
        'build/r3f': 'src/r3f/index.ts'
      },
      name: 'clouds'
    },
    sourcemap: true,
    rollupOptions: {
      output: [
        {
          format: 'es' as const,
          chunkFileNames: 'build/shared.js'
        },
        {
          format: 'cjs' as const,
          chunkFileNames: 'build/shared.cjs'
        }
      ].map(config => ({
        ...config,
        sourcemapExcludeSources: true,
        // Note this just append files in ignore list.
        sourcemapIgnoreList: relativeSourcePath =>
          relativeSourcePath.includes('node_modules'),
        sourcemapPathTransform: relativeSourcePath =>
          relativeSourcePath
            .replace('../../../../node_modules', '../node_modules')
            .replace('../../../../packages/clouds/src', '../src')
      })),
      // External packages that should not be bundled into your library.
      external: [
        /^@takram/,
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