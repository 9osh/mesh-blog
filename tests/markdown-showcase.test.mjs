import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createMarkdownRenderer } from '../scripts/lib/markdown-renderer.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fixture = path.join(root, 'tests', 'fixtures', 'markdown-showcase.md')
const renderMarkdown = await createMarkdownRenderer(root)
const rendered = renderMarkdown(await readFile(fixture, 'utf8'), fixture)

test('showcase fixture covers heading anchors and table-of-contents metadata', () => {
  assert.deepEqual(
    rendered.headings.map(({ level, label, id }) => ({ level, label, id })),
    [
      { level: 'h2', label: '标题级别', id: 'section-标题级别' },
      { level: 'h3', label: '二级章节', id: 'section-二级章节' },
      { level: 'h2', label: '⚙️ 符号标题', id: 'section-符号标题' },
      { level: 'h2', label: 'C++ & Rust → 实战', id: 'section-c-rust-实战' },
      { level: 'h2', label: '50% → 100% 迁移', id: 'section-50-100-迁移' },
      { level: 'h2', label: '🚀 Emoji 标题', id: 'section-emoji-标题' },
      { level: 'h3', label: '🧩 组件化', id: 'section-组件化' },
      { level: 'h3', label: '💉 Demo', id: 'section-demo' },
      { level: 'h2', label: '相同章节', id: 'section-相同章节' },
      { level: 'h2', label: '相同章节', id: 'section-相同章节-2' },
      { level: 'h2', label: '相同章节', id: 'section-相同章节-3' },
      { level: 'h4', label: '四级标题', id: 'section-四级标题' },
      { level: 'h5', label: '五级标题', id: 'section-五级标题' },
      { level: 'h6', label: '六级标题', id: 'section-六级标题' },
    ],
  )
  assert.match(rendered.html, /<h4 id="section-四级标题">四级标题<\/h4>/)
  assert.match(rendered.html, /<h5 id="section-五级标题">五级标题<\/h5>/)
  assert.match(rendered.html, /<h6 id="section-六级标题">六级标题<\/h6>/)
})

test('showcase fixture covers highlighted and plain-text code', () => {
  assert.equal((rendered.html.match(/data-code-block/g) || []).length, 7)
  assert.equal((rendered.html.match(/data-code-copy(?=[\s>])/g) || []).length, 7)
  assert.equal((rendered.html.match(/class="code-block__language-icon"/g) || []).length, 7)
  for (const label of ['C', 'C++', 'Go', 'PHP', 'Python', 'Rust', 'Plain text']) {
    assert.ok(rendered.html.includes(`<span class="code-block__language-label">${label}</span>`), label)
  }
  assert.match(rendered.html, /data-language="cpp"/)
  assert.doesNotMatch(rendered.html, /data-language="c\+\+"/)
})

test('showcase fixture covers Mermaid and reading components', () => {
  assert.match(rendered.html, /<figure class="mermaid-diagram" data-mermaid-diagram>/)
  assert.equal((rendered.html.match(/data-lightbox-trigger/g) || []).length, 3)
  assert.equal((rendered.html.match(/class="markdown-figure__number"/g) || []).length, 2)
  assert.match(rendered.html, /class="markdown-columns markdown-width-wide"/)
  assert.equal((rendered.html.match(/class="markdown-column"/g) || []).length, 2)
  assert.match(rendered.html, /<h3 id="column-title-1" class="markdown-column__title">Before<\/h3>/)
  assert.ok(!rendered.headings.some(({ id }) => id.startsWith('column-title-')))
})
