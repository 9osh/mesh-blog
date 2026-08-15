import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')

await Promise.all([
  rm(path.join(dist, 'app.js'), { force: true }),
  rm(path.join(dist, 'article.js'), { force: true }),
  rm(path.join(dist, 'tags.js'), { force: true }),
  rm(path.join(dist, 'chunks'), { recursive: true, force: true }),
])

await build({
  entryPoints: {
    app: path.join(root, 'src', 'client', 'app.ts'),
    article: path.join(root, 'src', 'client', 'article.ts'),
    tags: path.join(root, 'src', 'client', 'tags.ts'),
  },
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2020',
  splitting: true,
  outdir: dist,
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
})
