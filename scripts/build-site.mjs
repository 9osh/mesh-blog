import { cp, readdir, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { parsePublishedAt, preparePublishedPosts } from './lib/content-metadata.mjs'
import { createMarkdownRenderer } from './lib/markdown-renderer.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const contentDirectory = path.join(root, 'content', 'posts')
const outputDirectory = path.join(root, 'dist', 'articles')
const tagsOutputDirectory = path.join(root, 'dist', 'tags')
const publicDirectory = path.join(root, 'public')
const articleTemplate = await readFile(path.join(root, 'src', 'templates', 'article.html'), 'utf8')
const homeTemplate = await readFile(path.join(root, 'src', 'templates', 'home.html'), 'utf8')
const tagsTemplate = await readFile(path.join(root, 'src', 'templates', 'tags.html'), 'utf8')
const siteUrl = new URL(process.env.SITE_URL || 'http://127.0.0.1:4173').origin

const renderMarkdown = await createMarkdownRenderer(root)
function fail(file, message) {
  throw new Error(`${path.relative(root, file)}: ${message}`)
}

function parsePost(file, source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) fail(file, 'expected YAML front matter enclosed by ---')

  const attributes = parseYaml(match[1], { schema: 'core', strict: true })
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) fail(file, 'front matter must be a mapping')

  const requiredStrings = ['title', 'description', 'publishedAt']
  for (const key of requiredStrings) {
    if (typeof attributes[key] !== 'string' || !attributes[key].trim()) fail(file, `${key} must be a non-empty string`)
  }
  if (!Array.isArray(attributes.tags) || !attributes.tags.length || attributes.tags.some((tag) => typeof tag !== 'string' || !tag.trim())) {
    fail(file, 'tags must be a non-empty string array')
  }

  const slug = path.basename(file, '.md')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(file, 'filename must be a lowercase kebab-case slug')

  let publication
  try {
    publication = parsePublishedAt(attributes.publishedAt)
  } catch (error) {
    fail(file, error.message)
  }

  return {
    slug,
    title: attributes.title.trim(),
    description: attributes.description.trim(),
    ...publication,
    publishedAtDate: new Date(publication.publishedAtMs),
    tags: attributes.tags.map((tag) => tag.trim()),
    draft: attributes.draft === true,
    source: path.relative(root, file),
    file,
    markdown: match[2].trim(),
  }
}

function estimateReadingTime(markdown) {
  const text = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
  const hanCharacters = (text.match(/[\u3400-\u9fff]/g) || []).length
  const latinWords = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9_]+/g) || []).length
  return Math.max(1, Math.ceil(hanCharacters / 400 + latinWords / 220))
}

function formatDisplayDate(publishedDate) {
  const [year, month, day] = publishedDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(',', '')
    .toUpperCase()
}


function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

function renderToc(headings) {
  if (!headings.length) return ''
  return `<nav class="article-toc" aria-label="文章目录"><p>ON THIS PAGE</p><ol>${headings.map((heading) => `<li class="toc-${heading.level}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.label)}</a></li>`).join('')}</ol></nav>`
}

function renderArticleCard(article) {
  return `<article class="timeline-entry">
      <div class="timeline-date"><span>${escapeHtml(article.displayDate)}</span><span class="timeline-dot"></span></div>
      <a class="article-card" href="${escapeHtml(article.href)}" aria-label="阅读 ${escapeHtml(article.title)}">
        <div class="article-number">/${escapeHtml(article.index)}</div>
        <div class="article-main">
          <h3>${escapeHtml(article.title)}</h3>
          <p>${escapeHtml(article.description)}</p>
          <div class="article-meta">
            <div class="article-tags">${article.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
            <span>${escapeHtml(article.readingTime)}</span>
          </div>
        </div>
        <span class="article-arrow" aria-hidden="true">↗</span>
      </a>
    </article>`
}
function buildTagGraph(articles) {
  const nodesByName = new Map()
  const edgeWeights = new Map()

  for (const article of articles) {
    const articleTags = [...new Set(article.tags)].sort((left, right) => left.localeCompare(right))
    for (const tag of articleTags) {
      const node = nodesByName.get(tag) ?? { name: tag, articles: [], relatedCount: 0 }
      node.articles.push({
        title: article.title,
        href: article.href,
        publishedAt: article.publishedAt,
        displayDate: article.displayDate,
      })
      nodesByName.set(tag, node)
    }
    for (let left = 0; left < articleTags.length; left += 1) {
      for (let right = left + 1; right < articleTags.length; right += 1) {
        const key = `${articleTags[left]}\0${articleTags[right]}`
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1)
      }
    }
  }

  const edges = [...edgeWeights].map(([key, weight]) => {
    const [source, target] = key.split('\0')
    nodesByName.get(source).relatedCount += 1
    nodesByName.get(target).relatedCount += 1
    return { source, target, weight }
  }).sort((left, right) => right.weight - left.weight || left.source.localeCompare(right.source) || left.target.localeCompare(right.target))

  const nodes = [...nodesByName.values()].map((node) => ({
    ...node,
    articleCount: node.articles.length,
    latestPublishedAt: node.articles[0].publishedAt,
  })).sort((left, right) => right.articleCount - left.articleCount
    || right.latestPublishedAt.localeCompare(left.latestPublishedAt)
    || left.name.localeCompare(right.name))

  return { nodes, edges }
}

function renderTagRows(nodes) {
  return nodes.map((node, index) => {
    const href = `/?tag=${encodeURIComponent(node.name)}#journal`
    return `<a class="tags-row${index === 0 ? ' is-selected' : ''}" href="${escapeHtml(href)}" data-tag-row="${escapeHtml(node.name)}" aria-current="${index === 0 ? 'true' : 'false'}">
      <span class="tags-row-number">${String(index + 1).padStart(2, '0')}</span>
      <strong>${escapeHtml(node.name)}</strong>
      <small>${node.relatedCount} related ${node.relatedCount === 1 ? 'topic' : 'topics'}</small>
      <b>${String(node.articleCount).padStart(2, '0')}</b>
      <i aria-hidden="true">↗</i>
    </a>`
  }).join('\n')
}

function renderRecentTagArticles(node) {
  return node.articles.slice(0, 3).map((article) => `<li><a href="${escapeHtml(article.href)}"><span>${escapeHtml(article.displayDate)}</span><strong>${escapeHtml(article.title)}</strong></a></li>`).join('')
}


function renderFeed(posts) {
  const items = posts.map((post) => {
    const url = `${siteUrl}/articles/${post.slug}/`
    return `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${escapeHtml(url)}</link>
      <guid isPermaLink="true">${escapeHtml(url)}</guid>
      <pubDate>${post.publishedAtDate.toUTCString()}</pubDate>
      <description>${escapeHtml(post.description)}</description>
${post.tags.map((tag) => `      <category>${escapeHtml(tag)}</category>`).join('\n')}
    </item>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>MESH</title>
    <link>${escapeHtml(`${siteUrl}/`)}</link>
    <description>关于系统、攻击面与智能体工程的长期技术笔记。</description>
    <language>zh-CN</language>
    <lastBuildDate>${posts[0]?.publishedAtDate.toUTCString() || new Date(0).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`
}

function renderSitemap(posts) {
  const entries = [
    { url: `${siteUrl}/`, date: posts[0]?.publishedDate },
    { url: `${siteUrl}/tags/`, date: posts[0]?.publishedDate },
    ...posts.map((post) => ({ url: `${siteUrl}/articles/${post.slug}/`, date: post.publishedDate })),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => `  <url><loc>${escapeHtml(entry.url)}</loc>${entry.date ? `<lastmod>${entry.date}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`
}

function fillTemplate(post, body, headings, previous, next) {
  const canonicalPath = `/articles/${post.slug}/`
  const canonicalUrl = `${siteUrl}${canonicalPath}`
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    url: canonicalUrl,
    keywords: post.tags,
  }).replace(/</g, '\\u003c')
  const navigation = [
    previous
      ? `<a href="/articles/${previous.slug}/"><span>← PREVIOUS</span><strong>${escapeHtml(previous.title)}</strong></a>`
      : '<div class="article-endpoint first-entry"><span class="article-endpoint__node" aria-hidden="true"></span><span class="article-endpoint__rule" aria-hidden="true"></span><span>FIRST ENTRY</span></div>',
    next
      ? `<a class="next-article" href="/articles/${next.slug}/"><span>NEXT →</span><strong>${escapeHtml(next.title)}</strong></a>`
      : '<div class="article-endpoint latest-entry"><span>LATEST ENTRY</span><span class="article-endpoint__rule" aria-hidden="true"></span><span class="article-endpoint__node" aria-hidden="true"></span></div>',
  ].join('')

  const replacements = {
    '{{TITLE}}': escapeHtml(post.title),
    '{{DESCRIPTION}}': escapeHtml(post.description),
    '{{PUBLISHED_AT}}': escapeHtml(post.publishedAt),
    '{{DISPLAY_DATE}}': escapeHtml(post.displayDate),
    '{{READING_TIME}}': `${post.readingMinutes} min read`,
    '{{INDEX}}': escapeHtml(post.index),
    '{{TAGS}}': post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join(''),
    '{{PRIMARY_TAG}}': escapeHtml(post.tags[0]),
    '{{ARTICLE_BODY}}': body,
    '{{TOC}}': renderToc(headings),
    '{{ARTICLE_NAVIGATION}}': navigation,
    '{{STRUCTURED_DATA}}': structuredData,
    '{{CANONICAL_URL}}': escapeHtml(canonicalUrl),
    '{{SITE_URL}}': escapeHtml(siteUrl),
  }
  return Object.entries(replacements).reduce((html, [token, value]) => html.replaceAll(token, value), articleTemplate)
}

const files = (await readdir(contentDirectory)).filter((file) => file.endsWith('.md')).sort()
const parsedPosts = await Promise.all(files.map(async (name) => {
  const file = path.join(contentDirectory, name)
  return parsePost(file, await readFile(file, 'utf8'))
}))
const posts = preparePublishedPosts(parsedPosts)

const uniqueSlugs = new Set(posts.map((post) => post.slug))
if (uniqueSlugs.size !== posts.length) throw new Error('Post slugs must be unique')

await Promise.all([
  rm(outputDirectory, { recursive: true, force: true }),
  rm(tagsOutputDirectory, { recursive: true, force: true }),
])
await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(tagsOutputDirectory, { recursive: true }),
])
for (const entry of await readdir(publicDirectory)) {
  await cp(path.join(publicDirectory, entry), path.join(root, 'dist', entry), { recursive: true, force: true })
}

const metadata = posts.map((post) => ({
  slug: post.slug,
  href: `/articles/${post.slug}/`,
  publishedAt: post.publishedAt,
  displayDate: formatDisplayDate(post.publishedDate),
  title: post.title,
  description: post.description,
  tags: post.tags,
  readingTime: `${estimateReadingTime(post.markdown)} min`,
  index: post.index,
}))

for (const [index, post] of posts.entries()) {
  const rendered = renderMarkdown(post.markdown, post.file)
  const enrichedPost = { ...post, ...metadata[index], readingMinutes: estimateReadingTime(post.markdown) }
  const directory = path.join(outputDirectory, post.slug)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'index.html'), fillTemplate(enrichedPost, rendered.html, rendered.headings, posts[index - 1], posts[index + 1]))
}


const articleIndex = JSON.stringify(metadata).replace(/</g, '\\u003c')
const tagGraph = buildTagGraph(metadata)
const defaultTag = tagGraph.nodes[0] ?? { name: '', articleCount: 0, relatedCount: 0, articles: [] }
const tagGraphIndex = JSON.stringify(tagGraph).replace(/</g, '\\u003c')
const tagsReplacements = {
  '{{SITE_URL}}': escapeHtml(siteUrl),
  '{{TAG_COUNT}}': String(tagGraph.nodes.length).padStart(2, '0'),
  '{{TAG_ROWS}}': renderTagRows(tagGraph.nodes),
  '{{DEFAULT_TAG}}': escapeHtml(defaultTag.name),
  '{{DEFAULT_ARTICLE_COUNT}}': String(defaultTag.articleCount).padStart(2, '0'),
  '{{DEFAULT_RELATED_COUNT}}': String(defaultTag.relatedCount).padStart(2, '0'),
  '{{DEFAULT_RECENT_ARTICLES}}': renderRecentTagArticles(defaultTag),
  '{{DEFAULT_TAG_HREF}}': escapeHtml(`/?tag=${encodeURIComponent(defaultTag.name)}#journal`),
  '{{TAG_GRAPH}}': tagGraphIndex,
}
const tagsPage = Object.entries(tagsReplacements).reduce((html, [token, value]) => html.replaceAll(token, value), tagsTemplate)
await writeFile(path.join(tagsOutputDirectory, 'index.html'), tagsPage)

const homeReplacements = {
  '{{SITE_URL}}': escapeHtml(siteUrl),
  '{{ENTRY_COUNT}}': String(posts.length).padStart(2, '0'),
  '{{ARTICLE_CARDS}}': metadata.map(renderArticleCard).join('\n'),
  '{{ARTICLE_INDEX}}': articleIndex,
}
const home = Object.entries(homeReplacements).reduce((html, [token, value]) => html.replaceAll(token, value), homeTemplate)
await writeFile(path.join(root, 'dist', 'index.html'), home)

await writeFile(path.join(root, 'dist', 'articles.json'), `${JSON.stringify(metadata, null, 2)}\n`)
await writeFile(path.join(root, 'dist', 'feed.xml'), renderFeed(posts))
await writeFile(path.join(root, 'dist', 'sitemap.xml'), renderSitemap(posts))
await writeFile(path.join(root, 'dist', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`)
console.log(`Generated ${posts.length} published articles`)
