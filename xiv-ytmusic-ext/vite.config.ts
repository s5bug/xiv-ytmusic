import { defineConfig } from 'vite'
import zip from 'vite-plugin-zip-pack'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config.ts'
import { name, version } from './package.json'

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [
      crx({ manifest }),
      zip({ outDir: 'release', outFileName: `crx-${name}-${version}.zip` }),
    ],
    server: {
      cors: {
        origin: [
          /chrome-extension:\/\//,
        ],
      },
    },
  }
})
