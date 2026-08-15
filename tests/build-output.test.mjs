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
  assert.deepEqual(
    articles.map(({ slug, index }) => ({ slug, index })),
    [
      { slug: 'markdown-heading-toc-showcase', index: '003' },
      { slug: 'markdown-code-mermaid-showcase', index: '002' },
      { slug: 'markdown-reading-components-showcase', index: '001' },
    ],
  )
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
    assert.ok(html.includes(`<h1>${article.title}</h1>`), `${article.slug} title is missing`)
    assert.ok(html.includes('class="article-prose"'), `${article.slug} prose is missing`)
    assert.ok(html.includes(`rel="canonical" href="${canonicalUrl}"`), `${article.slug} canonical URL is missing`)
    assert.ok(html.includes(`"url":"${canonicalUrl}"`), `${article.slug} structured URL is missing`)
    assert.ok(html.includes(`content="${article.publishedAt}"`), `${article.slug} Open Graph publication time is missing`)
    assert.ok(html.includes(`<time datetime="${article.publishedAt}">`), `${article.slug} time element is missing`)
    assert.ok(html.includes(`"datePublished":"${article.publishedAt}"`), `${article.slug} structured publication time is missing`)
    assert.ok(!html.includes('{{'), `${article.slug} contains an unresolved template token`)
  }
})

test('article timeline endpoints are rendered as non-interactive pagination markers', async () => {
  const newest = await readOutput(path.join('articles', articles[0].slug, 'index.html'))
  const oldest = await readOutput(path.join('articles', articles.at(-1).slug, 'index.html'))

  assert.match(newest, /<div class="article-endpoint first-entry">[\s\S]*?<span>FIRST ENTRY<\/span><\/div>/)
  assert.doesNotMatch(newest, /class="article-endpoint first-entry"[^>]*(?:href|tabindex|role=)/)
  assert.match(oldest, /<div class="article-endpoint latest-entry"><span>LATEST ENTRY<\/span>[\s\S]*?<\/div>/)
  assert.doesNotMatch(oldest, /class="article-endpoint latest-entry"[^>]*(?:href|tabindex|role=)/)

  assert.ok(newest.includes('class="next-article"'), 'newest entry must retain its Next article link')
  assert.match(oldest, /<a href="\/articles\/[^"]+\/"><span>← PREVIOUS<\/span><strong>/)
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

test('published article recognizes multi-level, symbolic, and emoji headings in the table of contents', async () => {
  const article = await readOutput(path.join('articles', 'markdown-heading-toc-showcase', 'index.html'))
  assert.match(article, /<nav class="article-toc" aria-label="文章目录">/)

  // h2 and h3 enter the TOC with their level classes.
  assert.match(article, /<li class="toc-h2"><a href="#section-标题级别">标题级别<\/a>/)
  assert.match(article, /<li class="toc-h3"><a href="#section-二级章节">二级章节<\/a>/)

  // Symbols are stripped from anchor slugs but preserved in labels.
  assert.match(article, /<a href="#section-符号标题">⚙️ 符号标题<\/a>/)
  assert.match(article, /<a href="#section-c-rust-实战">C\+\+ &amp; Rust → 实战<\/a>/)
  assert.match(article, /<a href="#section-50-100-迁移">50% → 100% 迁移<\/a>/)

  // Emoji are stripped from anchor slugs but preserved in labels.
  assert.match(article, /<a href="#section-emoji-标题">🚀 Emoji 标题<\/a>/)
  assert.match(article, /<a href="#section-组件化">🧩 组件化<\/a>/)
  assert.match(article, /<a href="#section-demo">💉 Demo<\/a>/)

  // Duplicate headings keep unique anchors by suffixing -2 and -3.
  assert.match(article, /<a href="#section-相同章节">相同章节<\/a>/)
  assert.match(article, /<a href="#section-相同章节-2">相同章节<\/a>/)
  assert.match(article, /<a href="#section-相同章节-3">相同章节<\/a>/)

  // h4 through h6 still render anchors but never enter the TOC.
  assert.match(article, /<h4 id="section-四级标题">四级标题<\/h4>/)
  assert.match(article, /<h5 id="section-五级标题">五级标题<\/h5>/)
  assert.match(article, /<h6 id="section-六级标题">六级标题<\/h6>/)
  assert.doesNotMatch(article, /href="#section-四级标题"/)
  assert.doesNotMatch(article, /href="#section-五级标题"/)
  assert.doesNotMatch(article, /href="#section-六级标题"/)
})

test('article assets are bundled locally and published code is highlighted at build time', async () => {
  const showcase = await readOutput(path.join('articles', 'markdown-code-mermaid-showcase', 'index.html'))
  assert.equal((showcase.match(/data-code-block/g) || []).length, 7)
  assert.equal((showcase.match(/data-code-copy(?=[\s>])/g) || []).length, 7)
  assert.equal((showcase.match(/class="code-block__language-icon"/g) || []).length, 7)
  assert.match(showcase, /<span class="code-block__language-label">Bash<\/span>/)
  assert.match(showcase, /<span class="code-block__language-label">Python<\/span>/)
  assert.match(showcase, /<span class="code-block__language-label">Plain text<\/span>/)

  const readingShowcase = await readOutput(path.join('articles', 'markdown-reading-components-showcase', 'index.html'))
  assert.equal((readingShowcase.match(/data-lightbox-trigger/g) || []).length, 5)
  assert.equal((readingShowcase.match(/data-image-lightbox/g) || []).length, 1)
  assert.equal((readingShowcase.match(/class="markdown-figure__number"/g) || []).length, 4)
  assert.match(readingShowcase, /<img src="\/images\/runtime-architecture\.svg" alt="[^"]+"/)
  assert.equal((readingShowcase.match(/class="markdown-columns markdown-width-wide"/g) || []).length, 2)
  assert.equal((readingShowcase.match(/class="markdown-column"/g) || []).length, 4)
  assert.match(readingShowcase, /<h3 id="column-title-1" class="markdown-column__title">Before<\/h3>/)
  assert.ok(!readingShowcase.includes('href="#column-title-'), 'Column titles must not enter the article TOC')
  assert.match(await readOutput(path.join('images', 'runtime-architecture.svg')), /<svg[^>]+width="1600" height="900"/)

  const articleOutputs = await Promise.all(
    articles.map((article) => readOutput(path.join('articles', article.slug, 'index.html'))),
  )
  assert.ok(
    articleOutputs.reduce((count, html) => count + (html.match(/<pre><code class="language-text">/g) || []).length, 0) > 0,
    'at least one plain-text code block is required',
  )

  assert.ok((await readOutput('article.js')).length > 0)
  const chunks = await readdir(path.join(dist, 'chunks'))
  assert.ok(chunks.some((file) => file.endsWith('.js')), 'a local Mermaid JavaScript chunk is required')
})
