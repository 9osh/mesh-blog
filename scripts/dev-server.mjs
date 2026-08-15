import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
}
const port = Number(process.env.PORT || 4173)
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0])
  const requestedFile = pathname === '/' || pathname.endsWith('/') ? `${pathname}index.html` : pathname
  const file = path.resolve(dist, `.${requestedFile}`)
  if (file !== dist && !file.startsWith(`${dist}${path.sep}`)) { res.writeHead(403); res.end('Forbidden'); return }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
    res.end(data)
  })
})
server.listen(port, '127.0.0.1', () => console.log(`MESH → http://127.0.0.1:${port}`))
