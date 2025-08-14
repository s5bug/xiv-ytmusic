import { defineManifest } from '@crxjs/vite-plugin'
import * as pkg from './package.json'

const isDev = process.env.NODE_ENV === 'development'

export default defineManifest<`${string}.${string}`>({
  name: `${pkg.displayName || pkg.name}${isDev ? ` ➡️ Dev` : ''}`,
  description: pkg.description,
  version: pkg.version,
  manifest_version: 3,
  icons: {
    16: 'public/img/logo-16.png',
    32: 'public/img/logo-34.png',
    48: 'public/img/logo-48.png',
    128: 'public/img/logo-128.png',
  },
  action: {
    // @ts-expect-error the crxjs library is just wrong here
    default_icon: 'public/img/logo-48.png',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  host_permissions: [
    '*://music.youtube.com/*',
  ],
  externally_connectable: {
    matches: ['*://music.youtube.com/*'],
  },
  web_accessible_resources: [
    {
      resources: ['img/logo-16.png', 'img/logo-34.png', 'img/logo-48.png', 'img/logo-128.png'],
      matches: [],
    },
  ],
  permissions: ['nativeMessaging', 'scripting', 'tabs'],
})
