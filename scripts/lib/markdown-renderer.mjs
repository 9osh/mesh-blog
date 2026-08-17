import path from 'node:path'
import MarkdownIt from 'markdown-it'
import markdownItContainer from 'markdown-it-container'
import { createHighlighter } from 'shiki'
import { createCssVariablesTheme } from 'shiki/core'
import { transformerNotationDiff } from '@shikijs/transformers'
import { escapeHtmlText, parseMarkdownAttributes, serializeHtmlAttributes } from './markdown-attributes.mjs'

const languageAliases = new Map([
  ['js', 'javascript'],
  ['javascript', 'javascript'],
  ['jsx', 'jsx'],
  ['ts', 'typescript'],
  ['typescript', 'typescript'],
  ['tsx', 'tsx'],
  ['json', 'json'],
  ['html', 'html'],
  ['css', 'css'],
  ['bash', 'bash'],
  ['sh', 'bash'],
  ['shell', 'bash'],
  ['yaml', 'yaml'],
  ['yml', 'yaml'],
  ['md', 'markdown'],
  ['markdown', 'markdown'],
  ['python', 'python'],
  ['py', 'python'],
  ['go', 'go'],
  ['c', 'c'],
  ['cpp', 'cpp'],
  ['c++', 'cpp'],
  ['php', 'php'],
  ['rust', 'rust'],
  ['rs', 'rust'],
  ['sql', 'sql'],
  ['dockerfile', 'dockerfile'],
])
const canonicalLanguages = [...new Set(languageAliases.values())]
const plainTextLanguages = new Set(['text', 'txt', 'plain', 'plaintext'])
const languageDisplayNames = new Map([
  ['javascript', 'JavaScript'],
  ['jsx', 'JSX'],
  ['typescript', 'TypeScript'],
  ['tsx', 'TSX'],
  ['json', 'JSON'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['bash', 'Bash'],
  ['yaml', 'YAML'],
  ['markdown', 'Markdown'],
  ['python', 'Python'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['php', 'PHP'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['sql', 'SQL'],
  ['dockerfile', 'Dockerfile'],
])
const languageIdentifier = /^[A-Za-z][A-Za-z0-9_-]*(?:\+\+)?$/
const inlineAnnotation = /^\{([^}]*)\}(.*)$/s
const alertLabels = new Map([
  ['NOTE', 'Note'],
  ['TIP', 'Tip'],
  ['IMPORTANT', 'Important'],
  ['WARNING', 'Warning'],
  ['CAUTION', 'Caution'],
])
const numericTableCell = /^[+-]?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?(?:\s?(?:%|[KMGT]B?|ms|s|px|rem|em))?$/i

function findBlockquoteClose(tokens, openIndex) {
  let depth = 0
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].type === 'blockquote_open') depth += 1
    if (tokens[index].type === 'blockquote_close') depth -= 1
    if (depth === 0) return index
  }
  return -1
}

function alertTypeAt(tokens, openIndex) {
  const paragraph = tokens[openIndex + 1]
  const inline = tokens[openIndex + 2]
  if (paragraph?.type !== 'paragraph_open' || inline?.type !== 'inline') return null
  const match = inline.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\n|$)/)
  return match?.[1] || null
}

function stripLeadingText(inline, prefix) {
  inline.content = inline.content.slice(prefix.length)
  const first = inline.children?.[0]
  if (first?.type !== 'text' || !first.content.startsWith(prefix)) return
  first.content = first.content.slice(prefix.length)
  if (!first.content) inline.children.shift()
}

function transformBlockquotes(state) {
  const candidates = []
  for (let index = 0; index < state.tokens.length; index += 1) {
    if (state.tokens[index].type !== 'blockquote_open') continue
    const type = alertTypeAt(state.tokens, index)
    if (!type) continue
    candidates.push({ open: index, close: findBlockquoteClose(state.tokens, index), type })
  }

  for (const outer of candidates) {
    if (candidates.some((inner) => inner.open > outer.open && inner.close < outer.close)) {
      throw new Error('alerts must not be nested')
    }
  }

  const alertOpenIndexes = new Set(candidates.map(({ open }) => open))
  for (const { open, close, type } of candidates) {
    const inline = state.tokens[open + 2]
    stripLeadingText(inline, `[!${type}]`)
    if (inline.children?.[0]?.type === 'softbreak') inline.children.shift()
    inline.content = inline.content.replace(/^\n/, '')
    state.tokens[open].meta = { ...state.tokens[open].meta, alertType: type }
    state.tokens[close].meta = { ...state.tokens[close].meta, alertType: type }
  }

  for (let open = 0; open < state.tokens.length; open += 1) {
    if (state.tokens[open].type !== 'blockquote_open' || alertOpenIndexes.has(open)) continue
    const close = findBlockquoteClose(state.tokens, open)
    state.tokens[open].attrJoin('class', 'markdown-blockquote')
    const paragraphOpen = state.tokens[close - 3]
    const inline = state.tokens[close - 2]
    const paragraphClose = state.tokens[close - 1]
    if (
      paragraphOpen?.type !== 'paragraph_open'
      || inline?.type !== 'inline'
      || paragraphClose?.type !== 'paragraph_close'
      || !/^— \S/.test(inline.content)
      || inline.content.includes('\n')
    ) continue
    stripLeadingText(inline, '— ')
    paragraphOpen.tag = 'footer'
    paragraphOpen.attrJoin('class', 'markdown-blockquote__attribution')
    paragraphClose.tag = 'footer'
  }
}

function classifyTableCells(state) {
  for (let index = 0; index < state.tokens.length; index += 1) {
    const token = state.tokens[index]
    if (token.type === 'th_open') {
      token.attrs = [['scope', 'col'], ...(token.attrs || []).filter(([name]) => name !== 'scope')]
      continue
    }
    if (token.type !== 'td_open') continue
    const inline = state.tokens[index + 1]
    if (inline?.type === 'inline' && numericTableCell.test(inline.content.trim())) {
      token.attrJoin('class', 'is-numeric')
    }
  }
}

function headingSlug(value) {
  return value.toLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '') || 'note'
}

function validateMermaid(source) {
  if (!source.trim()) throw new Error('Mermaid source must not be empty')
  if (/^\s*---(?:\s|$)/.test(source)) throw new Error('Mermaid front matter is not allowed')
  if (/%%\{[\s\S]*?\}%%/.test(source)) throw new Error('Mermaid initialization directives are not allowed')

  const lines = source.split(/\r?\n/)
  const firstEffectiveLine = lines.find((line) => line.trim() && !/^\s*%%(?!\{)/.test(line))
  if (!firstEffectiveLine || !/^\s*(?:flowchart|graph)(?:\s|$)/.test(firstEffectiveLine)) {
    throw new Error('Mermaid only supports flowchart or graph diagrams')
  }

  const accessibilityTitles = lines
    .map((line) => line.match(/^\s*accTitle:\s*(.*?)\s*$/))
    .filter(Boolean)
  if (accessibilityTitles.length > 1) throw new Error('Mermaid flowchart must contain exactly one accTitle')
  if (accessibilityTitles.length !== 1 || !accessibilityTitles[0][1].trim()) {
    throw new Error('Mermaid flowchart requires a non-empty accTitle')
  }
}

function renderMermaid(source, escapeHtml) {
  validateMermaid(source)
  return `<figure class="mermaid-diagram" data-mermaid-diagram>\n<div class="mermaid-diagram__canvas" hidden></div>\n<p class="mermaid-diagram__error" role="status" hidden>流程图渲染失败。下面保留原始 Mermaid 源码。</p>\n<pre class="mermaid-diagram__source"><code>${escapeHtml(source)}</code></pre>\n</figure>\n`
}
function renderCodeBlock(preHtml, label) {
  return `<figure class="code-block" data-code-block>\n<figcaption class="code-block__header">\n<span class="code-block__language"><svg class="code-block__language-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="m8 9-3 3 3 3m8-6 3 3-3 3m-2-9-4 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="code-block__language-label">${label}</span></span>\n<button class="code-block__copy" type="button" data-code-copy data-copy-state="idle" aria-label="复制代码">\n<span class="code-block__copy-icon" aria-hidden="true"><svg class="code-block__copy-svg" viewBox="0 0 32 32" width="20" height="20" fill="none" aria-hidden="true" focusable="false"><path d="M9 8V6C9 3.239 11.239 1 14 1H26C28.761 1 31 3.239 31 6V18C31 20.761 28.761 23 26 23H24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="9" width="22" height="22" rx="5" stroke="currentColor" stroke-width="2"/></svg><span class="code-block__copy-feedback" data-code-copy-feedback></span></span>\n<span class="code-block__status" data-code-copy-status role="status" aria-live="polite"></span>\n</button>\n</figcaption>\n${preHtml}</figure>\n`
}

const figureAttributes = ['src', 'alt', 'caption', 'layout', 'width', 'height', 'srcset', 'sizes', 'loading']
const figureChildAttributes = ['src', 'alt', 'label', 'width', 'height', 'srcset', 'sizes', 'loading']
const imageAttributeOrder = ['src', 'alt', 'width', 'height', 'srcset', 'sizes', 'loading']

function parseFigureAttributes(source) {
  return parseMarkdownAttributes(source, {
    component: 'figure',
    allowed: figureAttributes,
    required: ['src', 'alt', 'caption', 'layout', 'width', 'height'],
    nonEmpty: ['src', 'alt', 'caption'],
    positiveIntegers: ['width', 'height'],
    enums: { layout: ['normal', 'wide', 'full'], loading: ['lazy', 'eager'] },
    urls: ['src'],
    srcset: true,
    defaults: { loading: 'lazy' },
  })
}

function parseFigureChildAttributes(source) {
  return parseMarkdownAttributes(source, {
    component: 'FigurePair child',
    allowed: figureChildAttributes,
    required: ['src', 'alt', 'label', 'width', 'height'],
    nonEmpty: ['src', 'alt', 'label'],
    positiveIntegers: ['width', 'height'],
    enums: { loading: ['lazy', 'eager'] },
    urls: ['src'],
    srcset: true,
    defaults: { loading: 'lazy' },
  })
}

function parseFigurePairAttributes(source) {
  return parseMarkdownAttributes(source, {
    component: 'FigurePair',
    allowed: ['caption'],
    required: ['caption'],
    nonEmpty: ['caption'],
  })
}

function containerAttributeSource(info, name) {
  const match = info.trim().match(new RegExp(`^${name}(?:\\s+([\\s\\S]+))?$`))
  if (!match) throw new Error(`invalid ${name} container`)
  return match[1] || ''
}

function nextFigureNumber(env) {
  env.figureCount += 1
  return String(env.figureCount).padStart(2, '0')
}

function renderFigureTrigger(attributes, label) {
  const imageAttributes = serializeHtmlAttributes(attributes, imageAttributeOrder)
  return `<button type="button" class="markdown-figure__trigger" data-lightbox-trigger aria-label="${escapeHtmlText(`放大查看：${label}`)}">\n<img ${imageAttributes} />\n</button>`
}

function renderStandaloneFigure(attributes, number) {
  const caption = escapeHtmlText(attributes.caption)
  return `<figure class="markdown-figure markdown-figure--${attributes.layout}">\n${renderFigureTrigger(attributes, attributes.caption)}\n<figcaption><span class="markdown-figure__number">FIGURE ${number}</span><span aria-hidden="true"> · </span><span class="markdown-figure__caption">${caption}</span></figcaption>\n</figure>\n`
}

function renderFigurePair(attributes, children, number) {
  const figures = children.map((child) => {
    const label = escapeHtmlText(child.label)
    return `<figure class="markdown-figure markdown-figure--pair-item">\n${renderFigureTrigger(child, child.label)}\n<figcaption><span class="markdown-figure__label">${label}</span></figcaption>\n</figure>`
  }).join('\n')
  return `<figure class="markdown-figure-pair markdown-figure-pair--wide">\n<div class="markdown-figure-pair__grid">\n${figures}\n</div>\n<figcaption class="markdown-figure-pair__caption"><span class="markdown-figure__number">FIGURE ${number}</span><span aria-hidden="true"> · </span><span class="markdown-figure__caption">${escapeHtmlText(attributes.caption)}</span></figcaption>\n</figure>\n`
}

function sourceLine(state, line) {
  const start = state.bMarks[line] + state.tShift[line]
  return state.src.slice(start, state.eMarks[line]).trim()
}

function parseColumnAttributes(source) {
  return parseMarkdownAttributes(source, {
    component: 'Column',
    allowed: ['title'],
    required: ['title'],
    nonEmpty: ['title'],
  })
}

function containerOpeningAt(state, line) {
  const start = state.bMarks[line] + state.tShift[line]
  const source = state.src.slice(start, state.eMarks[line])
  return source.match(/^:::\s+([a-z][a-z0-9-]*)(?:\s|$)/)?.[1] || null
}

function containerCloseAt(state, line) {
  const start = state.bMarks[line] + state.tShift[line]
  return /^:::\s*$/.test(state.src.slice(start, state.eMarks[line]))
}

function findColumnClose(state, startLine, endLine) {
  const containers = []
  let fence = null

  for (let line = startLine; line < endLine; line += 1) {
    if (state.sCount[line] - state.blkIndent >= 4) continue
    const start = state.bMarks[line] + state.tShift[line]
    const source = state.src.slice(start, state.eMarks[line])
    const fenceMatch = source.match(/^ {0,3}(`{3,}|~{3,})/)
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence.character && fenceMatch[1].length >= fence.length) fence = null
      continue
    }
    if (fenceMatch) {
      fence = { character: fenceMatch[1][0], length: fenceMatch[1].length }
      continue
    }

    const opening = containerOpeningAt(state, line)
    if (opening) {
      if (opening === 'columns') throw new Error('Columns must not be nested')
      containers.push(opening)
      continue
    }
    if (!containerCloseAt(state, line)) continue
    if (containers.length) containers.pop()
    else return line
  }

  throw new Error('Column container must be closed')
}

function tokenizeColumnBody(state, startLine, endLine) {
  const previousParent = state.parentType
  const previousLineMax = state.lineMax
  state.parentType = 'container'
  state.lineMax = endLine
  state.md.block.tokenize(state, startLine, endLine)
  state.parentType = previousParent
  state.lineMax = previousLineMax
}

function columnsPlugin(md) {
  md.block.ruler.before('container_figure', 'mesh_columns', (state, startLine, endLine, silent) => {
    if (sourceLine(state, startLine) !== '::: columns') return false
    if (silent) return true

    const children = []
    let line = startLine + 1
    while (line < endLine && !sourceLine(state, line)) line += 1

    while (children.length < 2) {
      const opening = line < endLine ? sourceLine(state, line) : ''
      const match = opening.match(/^:::\s+column(?:\s+([\s\S]+))?$/)
      if (!match) throw new Error('Columns must contain exactly two direct Column children')
      const attributes = parseColumnAttributes(match[1] || '')
      const bodyStart = line + 1
      const bodyEnd = findColumnClose(state, bodyStart, endLine)
      children.push({ attributes, bodyStart, bodyEnd })
      line = bodyEnd + 1
      while (line < endLine && !sourceLine(state, line)) line += 1
    }

    if (line >= endLine || !containerCloseAt(state, line)) {
      throw new Error('Columns must contain exactly two direct Column children')
    }

    const outerClose = line
    const tokenOpen = state.push('mesh_columns_open', 'section', 1)
    tokenOpen.block = true
    tokenOpen.map = [startLine, outerClose]
    for (const child of children) {
      const childOpen = state.push('mesh_column_open', 'section', 1)
      childOpen.block = true
      childOpen.meta = { attributes: child.attributes }
      tokenizeColumnBody(state, child.bodyStart, child.bodyEnd)
      const childClose = state.push('mesh_column_close', 'section', -1)
      childClose.block = true
    }
    const tokenClose = state.push('mesh_columns_close', 'section', -1)
    tokenClose.block = true
    state.line = outerClose + 1
    return true
  })

  md.block.ruler.before('fence', 'mesh_isolated_column', (state, startLine) => {
    if (!/^:::\s+column(?:\s|$)/.test(sourceLine(state, startLine))) return false
    throw new Error('Column must be a direct child of Columns')
  })

  md.renderer.rules.mesh_columns_open = () => '<section class="markdown-columns markdown-width-wide" aria-label="内容对比">\n'
  md.renderer.rules.mesh_columns_close = () => '</section>\n'
  md.renderer.rules.mesh_column_open = (tokens, index, _options, env) => {
    env.columnCount += 1
    const id = `column-title-${env.columnCount}`
    const title = escapeHtmlText(tokens[index].meta.attributes.title)
    return `<section class="markdown-column" aria-labelledby="${id}">\n<h3 id="${id}" class="markdown-column__title">${title}</h3>\n<div class="markdown-column__body">\n`
  }
  md.renderer.rules.mesh_column_close = () => '</div>\n</section>\n'
}


function figurePairPlugin(md) {
  md.block.ruler.before('container_figure', 'mesh_figure_pair', (state, startLine, endLine, silent) => {
    const opening = sourceLine(state, startLine)
    const match = opening.match(/^:::\s+figure-pair(?:\s+([\s\S]+))?$/)
    if (!match) return false
    if (silent) return true

    const attributes = parseFigurePairAttributes(match[1] || '')
    const children = []
    let line = startLine + 1
    let closed = false

    while (line < endLine) {
      while (line < endLine && !sourceLine(state, line)) line += 1
      const current = line < endLine ? sourceLine(state, line) : ''
      if (current === ':::') {
        closed = true
        line += 1
        break
      }
      if (/^:::\s+figure-pair(?:\s|$)/.test(current)) throw new Error('FigurePair must not be nested')
      const childMatch = current.match(/^:::\s+figure(?:\s+([\s\S]+))?$/)
      if (!childMatch) throw new Error('FigurePair must contain exactly two direct Figure children')
      const child = parseFigureChildAttributes(childMatch[1] || '')
      line += 1
      while (line < endLine && !sourceLine(state, line)) line += 1
      if (line >= endLine || sourceLine(state, line) !== ':::') throw new Error('FigurePair child Figure must be empty')
      children.push(child)
      line += 1
    }

    if (!closed) throw new Error('FigurePair container must be closed')
    if (children.length !== 2) throw new Error('FigurePair must contain exactly two direct Figure children')

    const token = state.push('mesh_figure_pair', '', 0)
    token.block = true
    token.map = [startLine, line]
    token.meta = { attributes, children }
    state.line = line
    return true
  })

  md.renderer.rules.mesh_figure_pair = (tokens, index, _options, env) => {
    const { attributes, children } = tokens[index].meta
    return renderFigurePair(attributes, children, nextFigureNumber(env))
  }
}

export async function createMarkdownRenderer(root) {
  const theme = createCssVariablesTheme({
    name: 'mesh-code',
    variablePrefix: '--shiki-',
    fontStyle: true,
  })
  const highlighter = await createHighlighter({
    themes: [theme],
    langs: canonicalLanguages,
  })
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  md.use(markdownItContainer, 'figure', {
    validate(params) {
      return /^figure(?:\s|$)/.test(params.trim())
    },
    render(tokens, index, _options, env) {
      if (tokens[index].nesting === -1) return ''
      if (tokens[index + 1]?.type !== 'container_figure_close') throw new Error('figure container must be empty')
      const attributes = parseFigureAttributes(containerAttributeSource(tokens[index].info, 'figure'))
      return renderStandaloneFigure(attributes, nextFigureNumber(env))
    },
  })
  figurePairPlugin(md)
  columnsPlugin(md)
  const defaultHeadingOpen = md.renderer.rules.heading_open || ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))
  const defaultFence = md.renderer.rules.fence
  const defaultCodeInline = md.renderer.rules.code_inline || ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))
  const defaultTableOpen = md.renderer.rules.table_open || ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))
  const defaultTableClose = md.renderer.rules.table_close || ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))
  const defaultBlockquoteOpen = md.renderer.rules.blockquote_open || ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))
  const defaultBlockquoteClose = md.renderer.rules.blockquote_close || ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))

  md.core.ruler.push('mesh-reading-components', (state) => {
    transformBlockquotes(state)
    classifyTableCells(state)
  })

  md.renderer.rules.table_open = (tokens, index, options, env, self) => {
    return `<div class="markdown-table-region markdown-width-wide">\n${defaultTableOpen(tokens, index, options, env, self)}`
  }
  md.renderer.rules.table_close = (tokens, index, options, env, self) => {
    return `${defaultTableClose(tokens, index, options, env, self)}</div>\n`
  }
  md.renderer.rules.blockquote_open = (tokens, index, options, env, self) => {
    const type = tokens[index].meta?.alertType
    if (!type) return defaultBlockquoteOpen(tokens, index, options, env, self)
    return `<aside class="markdown-alert markdown-alert--${type.toLowerCase()}">\n<p class="markdown-alert__label">${alertLabels.get(type)}</p>\n<div class="markdown-alert__body">\n`
  }
  md.renderer.rules.blockquote_close = (tokens, index, options, env, self) => {
    if (!tokens[index].meta?.alertType) return defaultBlockquoteClose(tokens, index, options, env, self)
    return '</div>\n</aside>\n'
  }

  md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    if (tokens[index].tag === 'h1') {
      throw new Error('Markdown h1 headings are not allowed; use front matter title for the article title and ## for top-level sections')
    }
    const inline = tokens[index + 1]
    const label = inline?.content || 'Section'
    const base = headingSlug(label)
    const count = (env.headingOccurrences.get(base) || 0) + 1
    env.headingOccurrences.set(base, count)
    const id = `section-${base}${count > 1 ? `-${count}` : ''}`
    tokens[index].attrSet('id', id)
    env.headings.push({ level: tokens[index].tag, label, id })
    return defaultHeadingOpen(tokens, index, options, env, self)
  }

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index]
    const info = token.info.trim()
    const normalized = info.toLowerCase()

    if (normalized === 'mermaid') return renderMermaid(token.content, md.utils.escapeHtml)
    if (!info || plainTextLanguages.has(normalized)) {
      return renderCodeBlock(defaultFence(tokens, index, options, env, self), info ? 'Plain text' : 'Code')
    }
    if (!languageIdentifier.test(info)) throw new Error('code fence info must contain exactly one language identifier')

    const canonical = languageAliases.get(normalized)
    if (!canonical) throw new Error(`unsupported fenced code language "${info}"`)

    const preHtml = highlighter.codeToHtml(token.content, {
      lang: canonical,
      theme: 'mesh-code',
      transformers: [
        transformerNotationDiff(),
        {
          name: 'mesh-block-wrapper',
          pre(element) {
            const className = Array.isArray(element.properties.className) ? element.properties.className : []
            const legacyClass = Array.isArray(element.properties.class)
              ? element.properties.class
              : typeof element.properties.class === 'string' ? element.properties.class.split(/\s+/) : []
            const preserved = [...className, ...legacyClass].filter((name) => name !== 'shiki' && name !== 'mesh-code')
            element.properties = {
              className: ['shiki', 'shiki-block', ...new Set(preserved)],
              dataLanguage: canonical,
            }
          },
          code(element) {
            const className = Array.isArray(element.properties.className) ? element.properties.className : []
            const legacyClass = Array.isArray(element.properties.class)
              ? element.properties.class
              : typeof element.properties.class === 'string' ? element.properties.class.split(/\s+/) : []
            const preserved = [...className, ...legacyClass].filter((name) => name !== `language-${canonical}`)
            element.properties = {
              className: [`language-${canonical}`, ...new Set(preserved)],
            }
          },
        },
      ],
    })
    return renderCodeBlock(preHtml, languageDisplayNames.get(canonical))
  }

  md.renderer.rules.code_inline = (tokens, index, options, env, self) => {
    const token = tokens[index]
    if (!token.content.startsWith('{')) return defaultCodeInline(tokens, index, options, env, self)

    const match = token.content.match(inlineAnnotation)
    if (!match || !languageIdentifier.test(match[1]) || !match[2].startsWith(' ') || match[2].startsWith('  ') || !match[2].slice(1)) {
      throw new Error('invalid inline code language annotation')
    }

    const original = match[1]
    const canonical = languageAliases.get(original.toLowerCase())
    if (!canonical) throw new Error(`unsupported inline code language "${original}"`)
    const code = match[2].slice(1)

    return highlighter.codeToHtml(code, {
      lang: canonical,
      theme: 'mesh-code',
      transformers: [{
        name: 'mesh-inline-wrapper',
        root(_tree) {
          return {
            type: 'root',
            children: [{
              type: 'element',
              tagName: 'code',
              properties: {
                className: ['shiki-inline', `language-${canonical}`],
                dataLanguage: canonical,
              },
              children: this.code.children,
            }],
          }
        },
      }],
    })
  }

  return function renderMarkdown(markdown, file) {
    const env = { headings: [], headingOccurrences: new Map(), figureCount: 0, columnCount: 0, file }
    try {
      return { html: md.render(markdown, env), headings: env.headings }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${path.relative(root, file)}: ${message}`)
    }
  }
}
