import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig(({ command }) => ({
  main: {},
  preload: { build: { rollupOptions: { input: { index: resolve('src/preload/index.ts'), login: resolve('src/preload/login.ts') } } } },
  renderer: {
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html'), login: resolve('src/renderer/login.html') } } },
    plugins: [{
      name: 'renderer-csp',
      transformIndexHtml: (html) => html.replace(
        '__CONNECT_SRC__',
        command === 'serve' ? "'self' ws://localhost:* ws://127.0.0.1:*" : "'none'"
      )
    }]
  }
}))
