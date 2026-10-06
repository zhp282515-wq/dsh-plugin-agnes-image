// Preview the console without dsh.
//
// The console is a plain page served by the plugin's own routes, so it can be
// run on its own: this mounts the *real* route handlers on a throwaway HTTP
// server. That matters because the browser half only reloads when dsh restarts,
// and iterating on markup through restart-fail-restart is miserable.
//
//   node scripts/preview-console.mjs            # http://127.0.0.1:8791/agnes-image/console
//   node scripts/preview-console.mjs --port 9000
//
// It reads and writes the same settings file the plugin uses, so changes made
// in the preview are changes you keep.

import http from 'node:http'
import process from 'node:process'
import { loadSettings, STATE_DIR } from '../lib/settings.js'
import { registerRoutes, ROUTE_PREFIX } from '../lib/routes.js'

const portFlag = process.argv.indexOf('--port')
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : Number(process.env.PREVIEW_PORT || 8791)
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`preview-console: bad port ${process.argv[portFlag + 1]}`)
  process.exit(1)
}

const routes = new Map()
const scope = {
  webServer: {
    register(route) {
      routes.set(route.path, route.handler)
      return () => routes.delete(route.path)
    },
  },
}

// Pass a ctx with no `effect`: registerOne then registers directly instead of
// tying the routes to a cordis fiber that does not exist here.
registerRoutes({}, scope)

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://127.0.0.1:${port}`)
  const handler = routes.get(pathname)
  if (!handler) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`no such route: ${pathname}\n\nTry ${ROUTE_PREFIX}/console`)
    return
  }
  Promise.resolve(handler(req, res)).catch((error) => {
    try {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(String(error?.stack ?? error))
    } catch {
      /* response already sent */
    }
  })
})

server.listen(port, '127.0.0.1', () => {
  const settings = loadSettings()
  console.log(`settings   ${STATE_DIR}`)
  console.log(`language   ${settings.locale}`)
  console.log(`console    http://127.0.0.1:${port}${ROUTE_PREFIX}/console`)
  console.log(`           ${ROUTE_PREFIX}/console?theme=dark&lang=zh`)
  console.log('')
  console.log('Screenshot it with:')
  console.log(
    `  chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1500,1000 \\\n` +
      `    --virtual-time-budget=8000 --screenshot=console.png ` +
      `"http://127.0.0.1:${port}${ROUTE_PREFIX}/console?theme=dark"`,
  )
})
