import { defineConfig } from 'electron-vite'

export default defineConfig(({ command }) => ({
  main: {},
  preload: {},
  renderer: {
    plugins: [{
      name: 'renderer-csp',
      transformIndexHtml: (html) => html.replace(
        '__CONNECT_SRC__',
        command === 'serve' ? "'self' ws://localhost:* ws://127.0.0.1:*" : "'none'"
      )
    }]
  }
}))
