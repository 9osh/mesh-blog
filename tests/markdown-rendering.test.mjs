import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createMarkdownRenderer } from '../scripts/lib/markdown-renderer.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fixture = path.join(root, 'content', 'posts', 'fixture.md')
const renderMarkdown = await createMarkdownRenderer(root)

const languageCases = {
  javascript: { displayName: 'JavaScript', aliases: ['js', 'javascript'] },
  jsx: { displayName: 'JSX', aliases: ['jsx'] },
  typescript: { displayName: 'TypeScript', aliases: ['ts', 'typescript'] },
  tsx: { displayName: 'TSX', aliases: ['tsx'] },
  json: { displayName: 'JSON', aliases: ['json'] },
  html: { displayName: 'HTML', aliases: ['html'] },
  css: { displayName: 'CSS', aliases: ['css'] },
  bash: { displayName: 'Bash', aliases: ['bash', 'sh', 'shell'] },
  yaml: { displayName: 'YAML', aliases: ['yaml', 'yml'] },
  markdown: { displayName: 'Markdown', aliases: ['md', 'markdown'] },
  python: { displayName: 'Python', aliases: ['python', 'py'] },
  go: { displayName: 'Go', aliases: ['go'] },
  rust: { displayName: 'Rust', aliases: ['rust', 'rs'] },
  sql: { displayName: 'SQL', aliases: ['sql'] },
  dockerfile: { displayName: 'Dockerfile', aliases: ['dockerfile'] },
}

function render(markdown) {
  return renderMarkdown(markdown, fixture)
}

function assertRenderFailure(markdown, message) {
  assert.throws(
    () => render(markdown),
    (error) => {
      assert.match(error.message, /^content\/posts\/fixture\.md: /)
      assert.ok(error.message.includes(message), error.message)
      return true
    },
  )
}

test('every canonical fenced language and public alias is highlighted and labeled', () => {
  for (const [canonical, { displayName, aliases }] of Object.entries(languageCases)) {
    for (const alias of aliases) {
      const { html } = render(`\`\`\`${alias.toUpperCase()}\nvalue\n\`\`\``)
      assert.ok(html.includes('class="shiki shiki-block"'), alias)
      assert.ok(html.includes(`data-language="${canonical}"`), alias)
      assert.ok(html.includes(`class="language-${canonical}"`), alias)
      assert.ok(html.includes(`<span class="code-block__language-label">${displayName}</span>`), alias)
      assert.equal((html.match(/class="code-block__language-icon"/g) || []).length, 1, alias)
      assert.ok(html.includes('aria-hidden="true" focusable="false"'), alias)
      assert.equal((html.match(/data-code-block/g) || []).length, 1, alias)
      assert.equal((html.match(/data-code-copy(?=[\s>])/g) || []).length, 1, alias)
    }
  }
})

test('code copy control renders a scalable icon instead of a text glyph', () => {
  const { html } = render('```js\nconst value = 1\n```')
  assert.equal((html.match(/class="code-block__copy-svg"/g) || []).length, 1)
  assert.match(html, /<path d="M9 8V6C9 3\.239 11\.239 1 14 1H26/)
  assert.match(html, /<rect x="1" y="9" width="22" height="22" rx="5"/)
  assert.ok(!html.includes('⧉'))
})

test('highlighted blocks escape source without exposing raw HTML', () => {
  const { html } = render('```html\n<script>alert("x")</script>\n```')
  assert.ok(html.includes('&#x3C;'))
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('class="shiki shiki-block"'))
})

test('annotated inline code is highlighted without a visible marker', () => {
  const { html } = render('Use `{ts} const x = 1` here.')
  assert.ok(html.includes('class="shiki-inline language-typescript"'))
  assert.ok(html.includes('data-language="typescript"'))
  assert.ok(!html.includes('{ts}'))
  assert.ok(!html.includes('<pre'))
  assert.ok(!html.includes('data-code-block'))
  assert.ok(!html.includes('data-code-copy'))
})

test('ordinary inline code retains the Markdown renderer output', () => {
  assert.equal(render('Use `content/posts` here.').html, '<p>Use <code>content/posts</code> here.</p>\n')
})

test('empty and plain-text fences remain unhighlighted with distinct labels', () => {
  for (const info of ['text', 'txt', 'plain', 'plaintext']) {
    const { html } = render(`\`\`\`${info}\nplain <text>\n\`\`\``)
    assert.ok(!html.includes('shiki-block'), info)
    assert.ok(html.includes('<span class="code-block__language-label">Plain text</span>'), info)
    assert.equal((html.match(/class="code-block__language-icon"/g) || []).length, 1, info)
    assert.ok(html.includes(`<pre><code class="language-${info}">plain &lt;text&gt;\n</code></pre>`), info)
    assert.equal((html.match(/data-code-block/g) || []).length, 1, info)
    assert.equal((html.match(/data-code-copy(?=[\s>])/g) || []).length, 1, info)
  }

  const { html } = render('```\nplain <text>\n```')
  assert.ok(!html.includes('shiki-block'))
  assert.ok(html.includes('<span class="code-block__language-label">Code</span>'))
  assert.equal((html.match(/class="code-block__language-icon"/g) || []).length, 1)
  assert.ok(html.includes('<pre><code>plain &lt;text&gt;\n</code></pre>'))
  assert.equal((html.match(/data-code-block/g) || []).length, 1)
  assert.equal((html.match(/data-code-copy(?=[\s>])/g) || []).length, 1)
})

test('unsupported and malformed code annotations fail with file context', () => {
  assertRenderFailure('```kotlin\nvalue\n```', 'unsupported fenced code language "kotlin"')
  assertRenderFailure('Use `{Kotlin} value`.', 'unsupported inline code language "Kotlin"')
  assertRenderFailure('Use `{ts}`.', 'invalid inline code language annotation')
  assertRenderFailure('Use `{ts} `.', 'invalid inline code language annotation')
  assertRenderFailure('Use `{ts}  value`.', 'invalid inline code language annotation')
  assertRenderFailure('```ts title="x"\nvalue\n```', 'code fence info must contain exactly one language identifier')
})

test('valid Mermaid flowchart and graph fences emit source-first inert DOM', () => {
  for (const type of ['flowchart LR', 'graph TD']) {
    const source = `${type}\n  accTitle: Build < deploy\n  Build --> Deploy`
    const { html } = render(`\`\`\`mermaid\n${source}\n\`\`\``)
    assert.ok(html.includes('<figure class="mermaid-diagram" data-mermaid-diagram>'))
    assert.ok(html.includes('<div class="mermaid-diagram__canvas" hidden></div>'))
    assert.ok(html.includes('<p class="mermaid-diagram__error" role="status" hidden>流程图渲染失败。下面保留原始 Mermaid 源码。</p>'))
    assert.ok(html.includes('<pre class="mermaid-diagram__source"><code>'))
    assert.ok(html.includes('Build &lt; deploy'))
    assert.ok(!html.includes('<svg'))
    assert.ok(!/<figure[^>]*hidden/.test(html))
    assert.ok(!/<pre class="mermaid-diagram__source"[^>]*hidden/.test(html))
    assert.ok(!html.includes('data-code-block'))
    assert.ok(!html.includes('data-code-copy'))
  }
})

test('Mermaid policy rejects inaccessible, unsupported, and configurable input', () => {
  assertRenderFailure('```mermaid\nflowchart LR\nA --> B\n```', 'Mermaid flowchart requires a non-empty accTitle')
  assertRenderFailure('```mermaid\nflowchart LR\naccTitle:\nA --> B\n```', 'Mermaid flowchart requires a non-empty accTitle')
  assertRenderFailure('```mermaid\nflowchart LR\naccTitle: One\naccTitle: Two\nA --> B\n```', 'Mermaid flowchart must contain exactly one accTitle')
  assertRenderFailure('```mermaid\nsequenceDiagram\naccTitle: Sequence\nA ->> B: hi\n```', 'Mermaid only supports flowchart or graph diagrams')
  assertRenderFailure('```mermaid\n---\ntitle: Override\n---\nflowchart LR\naccTitle: Title\nA --> B\n```', 'Mermaid front matter is not allowed')
  assertRenderFailure('```mermaid\n%%{init: {"theme": "dark"}}%%\nflowchart LR\naccTitle: Title\nA --> B\n```', 'Mermaid initialization directives are not allowed')
  assertRenderFailure('```mermaid\n\n```', 'Mermaid source must not be empty')
})

test('article body rejects h1 headings reserved for the template title', () => {
  assertRenderFailure(
    '# Duplicate article title',
    'Markdown h1 headings are not allowed; use front matter title for the article title and ## for top-level sections',
  )
})

test('heading IDs deduplicate per render and renderer state resets between articles', () => {
  const first = render('## Same\n\n### Same')
  assert.deepEqual(first.headings.map(({ id }) => id), ['section-same', 'section-same-2'])
  assert.ok(first.html.includes('<h2 id="section-same">'))
  assert.ok(first.html.includes('<h3 id="section-same-2">'))

  const second = render('## Same')
  assert.deepEqual(second.headings.map(({ id }) => id), ['section-same'])
})
