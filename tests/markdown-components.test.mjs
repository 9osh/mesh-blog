import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createMarkdownRenderer } from '../scripts/lib/markdown-renderer.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fixture = path.join(root, 'content', 'posts', 'fixture.md')
const renderMarkdown = await createMarkdownRenderer(root)

function render(markdown) {
  return renderMarkdown(markdown, fixture).html
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

test('Shiki diff notation marks changed lines without changing the code block shell', () => {
  const html = render(`\`\`\`js
console.log('old') // [!code --]
console.log('new') // [!code ++]
console.log('same')
\`\`\``)

  assert.match(html, /class="line diff remove"/)
  assert.match(html, /class="line diff add"/)
  assert.match(html, /class="shiki shiki-block has-diff"/)
  assert.ok(!html.includes('[!code --]'))
  assert.ok(!html.includes('[!code ++]'))
  assert.equal((html.match(/data-code-block/g) || []).length, 1)
  assert.equal((html.match(/data-code-copy(?=[\s>])/g) || []).length, 1)
  assert.equal((html.match(/code-block__language-label/g) || []).length, 1)
  assert.match(html, /console/)
  assert.match(html, /old/)
  assert.match(html, /new/)
})

test('ordinary highlighted code retains the existing wrapper without diff classes', () => {
  const html = render('```js\nconst value = 1\n```')

  assert.match(html, /class="shiki shiki-block" data-language="javascript"/)
  assert.ok(!html.includes('has-diff'))
  assert.ok(!html.includes('line diff'))
  assert.equal((html.match(/data-code-block/g) || []).length, 1)
  assert.equal((html.match(/data-code-copy(?=[\s>])/g) || []).length, 1)
})

test('GFM tables keep semantic markup inside one wide scrolling region', () => {
  const html = render(`| Model | Context | Rate | Duration | Code |
| :--- | ---: | ---: | ---: | :--- |
| Model 2 | 128K | 12.5% | 40 ms | \`v2\` |
| v2 | 256 | Ready | 2 s | \`const\` |`)

  assert.match(html, /^<div class="markdown-table-region markdown-width-wide">\n<table>/)
  assert.match(html, /<\/table>\n<\/div>\n$/)
  assert.equal((html.match(/<table>/g) || []).length, 1)
  assert.equal((html.match(/<th scope="col"/g) || []).length, 5)
  assert.match(html, /<td style="text-align:right" class="is-numeric">128K<\/td>/)
  assert.match(html, /<td style="text-align:right" class="is-numeric">12\.5%<\/td>/)
  assert.match(html, /<td style="text-align:right" class="is-numeric">40 ms<\/td>/)
  assert.match(html, /<td style="text-align:right" class="is-numeric">256<\/td>/)
  assert.match(html, /<td style="text-align:right" class="is-numeric">2 s<\/td>/)
  assert.match(html, /<td style="text-align:left">Model 2<\/td>/)
  assert.match(html, /<td style="text-align:left">v2<\/td>/)
  assert.match(html, /<code>v2<\/code>/)
  assert.ok(!/<td[^>]*class="is-numeric"[^>]*>Model 2<\/td>/.test(html))
  assert.ok(!/<td[^>]*class="is-numeric"[^>]*>v2<\/td>/.test(html))
})

test('all five GitHub alert types render as MESH callouts', () => {
  const labels = {
    NOTE: 'Note',
    TIP: 'Tip',
    IMPORTANT: 'Important',
    WARNING: 'Warning',
    CAUTION: 'Caution',
  }

  for (const [type, label] of Object.entries(labels)) {
    const html = render(`> [!${type}]\n> ${type} body.`)
    assert.match(html, new RegExp(`<aside class="markdown-alert markdown-alert--${type.toLowerCase()}">`))
    assert.match(html, new RegExp(`<p class="markdown-alert__label">${label}</p>`))
    assert.match(html, /<div class="markdown-alert__body">/)
    assert.ok(!html.includes(`[!${type}]`))
    assert.ok(!html.includes('<blockquote'))
  }
})

test('alerts retain complete block Markdown', () => {
  const html = render(`> [!NOTE]
> Additional **context** with [details](/details) and \`state\`.
>
> - First item
> - Second item
>
> \`\`\`js
> const ready = true
> \`\`\``)

  assert.match(html, /<strong>context<\/strong>/)
  assert.match(html, /<a href="\/details">details<\/a>/)
  assert.match(html, /<code>state<\/code>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<li>First item<\/li>/)
  assert.match(html, /data-code-block/)
  assert.match(html, /const/)
  assert.ok(!html.includes('[!NOTE]'))
})

test('alert recognition is exact and only applies to the first blockquote content', () => {
  for (const marker of ['note', 'INFO', 'NOTE ']) {
    const html = render(`> [!${marker}]\n> Ordinary quote.`)
    assert.match(html, /<blockquote class="markdown-blockquote">/)
    assert.ok(!html.includes('markdown-alert'))
  }

  const lateMarker = render('> Intro first.\n>\n> [!NOTE]\n> Still a quote.')
  assert.match(lateMarker, /<blockquote class="markdown-blockquote">/)
  assert.ok(!lateMarker.includes('markdown-alert'))
})

test('nested alerts fail with source context', () => {
  assertRenderFailure(`> [!NOTE]
> Outer
>
> > [!TIP]
> > Nested`, 'alerts must not be nested')
})

test('ordinary blockquotes stay distinct and support an explicit final attribution', () => {
  const plain = render('> Systems should expose *failure domains* explicitly.')
  assert.match(plain, /^<blockquote class="markdown-blockquote">/)
  assert.match(plain, /<em>failure domains<\/em>/)
  assert.ok(!plain.includes('markdown-alert'))
  assert.ok(!plain.includes('<footer'))

  const attributed = render('> Systems should expose **failure domains** explicitly.\n>\n> — Engineering *Notes*')
  assert.match(attributed, /<blockquote class="markdown-blockquote">/)
  assert.match(attributed, /<strong>failure domains<\/strong>/)
  assert.match(attributed, /<footer class="markdown-blockquote__attribution">Engineering <em>Notes<\/em><\/footer>/)
  assert.ok(!attributed.includes('— Engineering'))
})

test('single figures render all layouts as complete responsive HTML', () => {
  for (const layout of ['normal', 'wide', 'full']) {
    const html = render(`::: figure {src="/images/runtime.webp" alt="Runtime architecture" caption="Runtime Architecture" layout="${layout}" width="1600" height="900" loading="eager"}
:::`)

    assert.match(html, new RegExp(`<figure class="markdown-figure markdown-figure--${layout}">`))
    assert.match(html, /<button type="button" class="markdown-figure__trigger" data-lightbox-trigger/)
    assert.match(html, /<img src="\/images\/runtime\.webp" alt="Runtime architecture" width="1600" height="900" loading="eager"/)
    assert.match(html, /<span class="markdown-figure__number">FIGURE 01<\/span>/)
    assert.match(html, /<span class="markdown-figure__caption">Runtime Architecture<\/span>/)
  }
})

test('FigurePair has exactly two labelled direct figures and one number', () => {
  const html = render(`::: figure-pair {caption="Runtime migration"}
::: figure {src="/images/before.webp" alt="Shared workspace" label="Before" width="1200" height="800"}
:::

::: figure {src="/images/after.webp" alt="Isolated workspace" label="After" width="1200" height="800"}
:::
:::`)

  assert.match(html, /^<figure class="markdown-figure-pair markdown-figure-pair--wide">/)
  assert.equal((html.match(/class="markdown-figure markdown-figure--pair-item"/g) || []).length, 2)
  assert.equal((html.match(/markdown-figure__number/g) || []).length, 1)
  assert.match(html, /<span class="markdown-figure__label">Before<\/span>/)
  assert.match(html, /<span class="markdown-figure__label">After<\/span>/)
  assert.match(html, /<span class="markdown-figure__caption">Runtime migration<\/span>/)
})

test('figure numbering resets for each article render and pair children do not consume it', () => {
  const pair = `::: figure-pair {caption="Migration"}
::: figure {src="/before.webp" alt="Before state" label="Before" width="1200" height="800"}
:::
::: figure {src="/after.webp" alt="After state" label="After" width="1200" height="800"}
:::
:::`
  const single = `::: figure {src="/result.webp" alt="Result state" caption="Result" layout="normal" width="1200" height="800"}
:::`
  const first = render(`${pair}\n\n${single}`)
  const second = render(single)

  assert.deepEqual([...first.matchAll(/FIGURE (\d{2})/g)].map((match) => match[1]), ['01', '02'])
  assert.deepEqual([...second.matchAll(/FIGURE (\d{2})/g)].map((match) => match[1]), ['01'])
})

test('figure attributes reject missing, malformed, duplicate, and unknown values', () => {
  const valid = 'src="/image.webp" alt="Useful image" caption="Caption" layout="normal" width="1200" height="800"'
  for (const [attributes, message] of [
    [valid.replace('src="/image.webp" ', ''), 'figure requires "src"'],
    [valid.replace('alt="Useful image" ', ''), 'figure requires "alt"'],
    [valid.replace('alt="Useful image"', 'alt=""'), 'figure "alt" must not be empty'],
    [valid.replace('caption="Caption" ', ''), 'figure requires "caption"'],
    [valid.replace('layout="normal"', 'layout="large"'), 'figure "layout" must be one of'],
    [valid.replace('width="1200"', 'width="0"'), 'figure "width" must be a positive integer'],
    [valid.replace('height="800"', 'height="8.5"'), 'figure "height" must be a positive integer'],
    [`${valid} src="/duplicate.webp"`, 'figure attribute "src" is duplicated'],
    [`${valid} onclick="alert(1)"`, 'figure attribute "onclick" is not allowed'],
    ['src="/image.webp" alt="Useful image" layout="normal" width="1200" height="800" caption="Unclosed', 'figure attributes contain an unclosed quoted value'],
  ]) {
    assertRenderFailure(`::: figure {${attributes}}\n:::`, message)
  }
})

test('figure output escapes quoted attributes and restricts image URL schemes', () => {
  const escaped = render(`::: figure {src="/image.webp?x=&quot;" alt="A & \\"quoted\\" image" caption="A <caption>" layout="normal" width="1200" height="800"}
:::`)
  assert.match(escaped, /src="\/image\.webp\?x=&amp;quot;"/)
  assert.match(escaped, /alt="A &amp; &quot;quoted&quot; image"/)
  assert.match(escaped, /A &lt;caption&gt;/)
  assert.ok(!escaped.includes('<caption>'))

  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,evil', 'ftp://example.com/image.webp', '//example.com/image.webp']) {
    assertRenderFailure(`::: figure {src="${value}" alt="Image" caption="Caption" layout="normal" width="1200" height="800"}\n:::`, 'figure "src" must use')
  }
})

test('FigurePair rejects invalid child counts, missing labels, bodies, and nesting', () => {
  const child = (name, label = ` label="${name}"`) => `::: figure {src="/${name}.webp" alt="${name}"${label} width="1200" height="800"}
:::`
  assertRenderFailure(`::: figure-pair {caption="One"}\n${child('one')}\n:::`, 'FigurePair must contain exactly two direct Figure children')
  assertRenderFailure(`::: figure-pair {caption="Three"}\n${child('one')}\n${child('two')}\n${child('three')}\n:::`, 'FigurePair must contain exactly two direct Figure children')
  assertRenderFailure(`::: figure-pair {caption="Missing label"}\n${child('one', '')}\n${child('two')}\n:::`, 'FigurePair child requires "label"')
  assertRenderFailure(`::: figure-pair {caption="Body"}\n::: figure {src="/one.webp" alt="one" label="One" width="1200" height="800"}\nBody\n:::\n${child('two')}\n:::`, 'FigurePair child Figure must be empty')
  assertRenderFailure(`::: figure-pair {caption="Nested"}\n::: figure-pair {caption="Inner"}\n:::\n:::`, 'FigurePair must not be nested')
})

test('Columns render two semantic, labelled sections with complete block Markdown', () => {
  const markdown = `::: columns
::: column {title="Before"}
Shared **workspace**

- Shared state
- [Implicit merge](/merge)

\`\`\`ts
const mode = 'shared'
\`\`\`
:::

::: column {title="After & safer"}
Isolated workspace

## Durable boundary

Longer content remains independent.
:::
:::`
  const result = renderMarkdown(markdown, fixture)
  const html = result.html

  assert.match(html, /^<section class="markdown-columns markdown-width-wide" aria-label="内容对比">/)
  assert.equal((html.match(/class="markdown-column"/g) || []).length, 2)
  assert.match(html, /<section class="markdown-column" aria-labelledby="column-title-1">/)
  assert.match(html, /<h3 id="column-title-1" class="markdown-column__title">Before<\/h3>/)
  assert.match(html, /<h3 id="column-title-2" class="markdown-column__title">After &amp; safer<\/h3>/)
  assert.match(html, /<strong>workspace<\/strong>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<a href="\/merge">Implicit merge<\/a>/)
  assert.match(html, /data-code-block/)
  assert.deepEqual(result.headings.map(({ label }) => label), ['Durable boundary'])
  assert.ok(!result.headings.some(({ label }) => label === 'Before' || label === 'After & safer'))
})

test('Column title IDs are stable, unique, and reset for each article', () => {
  const markdown = `::: columns
::: column {title="Same"}
One
:::
::: column {title="Same"}
Two
:::
:::`
  const first = render(markdown)
  const second = render(markdown)

  assert.deepEqual([...first.matchAll(/id="column-title-(\d+)"/g)].map((match) => match[1]), ['1', '2'])
  assert.deepEqual([...second.matchAll(/id="column-title-(\d+)"/g)].map((match) => match[1]), ['1', '2'])
})

test('Columns reject invalid child counts, titles, nesting, and isolated Column containers', () => {
  const child = (title, body = 'Body') => `::: column {title="${title}"}\n${body}\n:::`
  assertRenderFailure(`::: columns\n${child('Only')}\n:::`, 'Columns must contain exactly two direct Column children')
  assertRenderFailure(`::: columns\n${child('One')}\n${child('Two')}\n${child('Three')}\n:::`, 'Columns must contain exactly two direct Column children')
  assertRenderFailure(`::: columns\n::: column {}\nBody\n:::\n${child('Two')}\n:::`, 'Column requires "title"')
  assertRenderFailure(`::: columns\n::: column {title=""}\nBody\n:::\n${child('Two')}\n:::`, 'Column "title" must not be empty')
  assertRenderFailure(`::: columns\n${child('Outer', `::: columns\n${child('Inner one')}\n${child('Inner two')}\n:::`)}\n${child('Two')}\n:::`, 'Columns must not be nested')
  assertRenderFailure(child('Alone'), 'Column must be a direct child of Columns')
})

test('responsive source attributes survive validation and escaping', () => {
  const html = render(`::: figure {src="https://images.example.com/runtime-1600.webp" alt="Runtime" caption="Runtime" layout="wide" width="1600" height="900" srcset="/runtime-800.webp 800w, https://images.example.com/runtime-1600.webp 1600w" sizes="(max-width: 640px) 100vw, 64rem"}
:::`)

  assert.match(html, /srcset="\/runtime-800\.webp 800w, https:\/\/images\.example\.com\/runtime-1600\.webp 1600w"/)
  assert.match(html, /sizes="\(max-width: 640px\) 100vw, 64rem"/)
  assert.match(html, /loading="lazy"/)
  assertRenderFailure(`::: figure {src="/runtime.webp" alt="Runtime" caption="Runtime" layout="wide" width="1600" height="900" srcset="data:image/png;base64,evil 1x"}
:::`, 'figure "srcset" contains a URL that must use')
})
