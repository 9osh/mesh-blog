import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')
const siteUrl = new URL(process.env.SITE_URL || 'http://127.0.0.1:4173').origin
const articles = JSON.parse(await readFile(path.join(dist, 'articles.json'), 'utf8'))

async function readOutput(relativePath) {
  return readFile(path.join(dist, relativePath), 'utf8')
}

test('article index is complete and newest-first', () => {
  assert.ok(articles.length > 0, 'at least one published article is required')
  assert.equal(new Set(articles.map((article) => article.slug)).size, articles.length)
  assert.equal(new Set(articles.map((article) => article.index)).size, articles.length)
  const instants = articles.map((article) => Date.parse(article.publishedAt))
  assert.ok(instants.every(Number.isFinite), 'every publishedAt must represent an instant')
  for (let position = 1; position < instants.length; position += 1) {
    assert.ok(instants[position - 1] > instants[position], 'articles must be strictly newest-first')
  }
  for (const article of articles) {
    assert.match(article.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.equal(article.href, `/articles/${article.slug}/`)
    assert.ok(article.tags.length > 0)
  }
  for (const [position, article] of articles.entries()) {
    assert.equal(article.index, String(articles.length - position).padStart(3, '0'))
    assert.ok(!Object.hasOwn(article, 'date'), `${article.slug} still exposes the legacy date field`)
  }
})

test('home page includes static cards and the embedded article index', async () => {
  const home = await readOutput('index.html')
  assert.equal((home.match(/class="article-card"/g) || []).length, articles.length)
  for (const article of articles) assert.ok(home.includes(`href="${article.href}"`), article.href)

  const embeddedMatch = home.match(/<script id="articleIndex" type="application\/json">([\s\S]*?)<\/script>/)
  assert.ok(embeddedMatch, 'embedded article index is missing')
  assert.deepEqual(JSON.parse(embeddedMatch[1]), articles)
  assert.deepEqual(
    [...home.matchAll(/class="article-number">\/([^<]+)<\/div>/g)].map((match) => match[1]),
    articles.map((article) => article.index),
  )
  assert.ok(!home.includes('{{'), 'home contains an unresolved template token')
})

test('topics page contains the complete tag index and co-occurrence graph', async () => {
  const topics = await readOutput(path.join('tags', 'index.html'))
  assert.ok(topics.includes(`rel="canonical" href="${siteUrl}/tags/"`))
  assert.ok(!topics.includes('{{'), 'topics page contains an unresolved template token')

  const embeddedMatch = topics.match(/<script id="tagGraph" type="application\/json">([\s\S]*?)<\/script>/)
  assert.ok(embeddedMatch, 'embedded tag graph is missing')
  const graph = JSON.parse(embeddedMatch[1])

  const expectedCounts = new Map()
  const expectedEdges = new Map()
  for (const article of articles) {
    const tags = [...new Set(article.tags)].sort()
    for (const tag of tags) expectedCounts.set(tag, (expectedCounts.get(tag) || 0) + 1)
    for (let left = 0; left < tags.length; left += 1) {
      for (let right = left + 1; right < tags.length; right += 1) {
        const key = `${tags[left]}\0${tags[right]}`
        expectedEdges.set(key, (expectedEdges.get(key) || 0) + 1)
      }
    }
  }

  assert.deepEqual(
    graph.nodes.map((node) => [node.name, node.articleCount]).sort(),
    [...expectedCounts].sort(),
  )
  assert.deepEqual(
    graph.edges.map((edge) => [`${edge.source}\0${edge.target}`, edge.weight]).sort(),
    [...expectedEdges].sort(),
  )
  assert.equal(new Set(graph.nodes.map((node) => node.name)).size, graph.nodes.length)
  assert.equal(new Set(graph.edges.map((edge) => `${edge.source}\0${edge.target}`)).size, graph.edges.length)
  for (const tag of expectedCounts.keys()) assert.ok(topics.includes(`data-tag-row="${tag}"`), `${tag} row is missing`)

  const [home, article, tagsBundle] = await Promise.all([
    readOutput('index.html'),
    readOutput(path.join('articles', articles[0].slug, 'index.html')),
    readOutput('tags.js'),
  ])
  assert.match(home, /<a href="\/tags\/">Topics<\/a>/)
  assert.match(article, /<a href="\/tags\/">Topics<\/a>/)
  assert.ok(tagsBundle.length > 0)
})


test('every article has rendered content and absolute publication metadata', async () => {
  for (const article of articles) {
    const html = await readOutput(path.join('articles', article.slug, 'index.html'))
    const canonicalUrl = `${siteUrl}${article.href}`
    assert.ok(html.includes(`<h1 id="article-title">${article.title}</h1>`), `${article.slug} title is missing`)
    assert.ok(html.includes('class="article-prose"'), `${article.slug} prose is missing`)
    assert.ok(html.includes(`rel="canonical" href="${canonicalUrl}"`), `${article.slug} canonical URL is missing`)
    assert.ok(html.includes(`"url":"${canonicalUrl}"`), `${article.slug} structured URL is missing`)
    assert.ok(html.includes(`content="${article.publishedAt}"`), `${article.slug} Open Graph publication time is missing`)
    assert.ok(html.includes(`<time datetime="${article.publishedAt}">`), `${article.slug} time element is missing`)
    assert.ok(html.includes(`"datePublished":"${article.publishedAt}"`), `${article.slug} structured publication time is missing`)
    assert.equal((html.match(/data-image-lightbox/g) || []).length, 1, `${article.slug} image lightbox is missing`)
    assert.ok(!html.includes('{{'), `${article.slug} contains an unresolved template token`)
  }
})

test('article table of contents includes h1 through h6 in document order', async () => {
  const html = await readOutput(path.join('articles', 'markdown-heading-toc-showcase', 'index.html'))
  const entries = [...html.matchAll(/<li class="toc-(h[1-6])"><a href="#([^"]+)">([^<]+)<\/a><\/li>/g)]
    .map(([, level, id, label]) => ({ level, id, label }))

  assert.deepEqual(entries.slice(0, 6), [
    { level: 'h1', id: 'article-title', label: 'Markdown Heading and TOC Showcase' },
    { level: 'h2', id: 'section-标题级别', label: '标题级别' },
    { level: 'h3', id: 'section-二级章节', label: '二级章节' },
    { level: 'h4', id: 'section-四级标题', label: '四级标题' },
    { level: 'h5', id: 'section-五级标题', label: '五级标题' },
    { level: 'h6', id: 'section-六级标题', label: '六级标题' },
  ])
})

test('article timeline endpoints handle single and multiple published articles', async () => {
  const newest = await readOutput(path.join('articles', articles[0].slug, 'index.html'))
  const oldest = await readOutput(path.join('articles', articles.at(-1).slug, 'index.html'))

  assert.match(newest, /<div class="article-endpoint first-entry">[\s\S]*?<span>FIRST ENTRY<\/span><\/div>/)
  assert.doesNotMatch(newest, /class="article-endpoint first-entry"[^>]*(?:href|tabindex|role=)/)
  assert.match(oldest, /<div class="article-endpoint latest-entry"><span>LATEST ENTRY<\/span>[\s\S]*?<\/div>/)
  assert.doesNotMatch(oldest, /class="article-endpoint latest-entry"[^>]*(?:href|tabindex|role=)/)

  if (articles.length === 1) {
    assert.doesNotMatch(newest, /<span>← PREVIOUS<\/span>|<span>NEXT →<\/span>/)
  } else {
    assert.ok(newest.includes('class="next-article"'), 'newest entry must retain its Next article link')
    assert.match(oldest, /<a href="\/articles\/[^"]+\/"><span>← PREVIOUS<\/span><strong>/)
  }
})

test('RSS, sitemap, and robots enumerate published routes', async () => {
  const [feed, sitemap, robots] = await Promise.all([
    readOutput('feed.xml'),
    readOutput('sitemap.xml'),
    readOutput('robots.txt'),
  ])
  assert.match(feed, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.ok(sitemap.includes(`<loc>${siteUrl}/tags/</loc>`), 'topics page is missing from sitemap')
  for (const article of articles) {
    const url = `${siteUrl}${article.href}`
    assert.ok(feed.includes(`<guid isPermaLink="true">${url}</guid>`), `${article.slug} is missing from RSS`)
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${article.slug} is missing from sitemap`)
    assert.ok(feed.includes(`<pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>`), `${article.slug} has the wrong RSS date`)
    assert.ok(
      sitemap.includes(`<loc>${url}</loc><lastmod>${article.publishedAt.slice(0, 10)}</lastmod>`),
      `${article.slug} has the wrong sitemap date`,
    )
  }
  assert.ok(robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`))
})


test('article runtime assets are bundled locally', async () => {
  assert.match(await readOutput(path.join('images', 'runtime-architecture.svg')), /<svg[^>]+width="1600" height="900"/)
  assert.ok((await readOutput('article.js')).length > 0)
  const chunks = await readdir(path.join(dist, 'chunks'))
  assert.ok(chunks.some((file) => file.endsWith('.js')), 'a local Mermaid JavaScript chunk is required')
})
