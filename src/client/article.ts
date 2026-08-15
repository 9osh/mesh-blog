import type { Mermaid } from 'mermaid'

export {}

const progress = document.querySelector<HTMLElement>('#readingProgress')
const copyLink = document.querySelector<HTMLButtonElement>('#copyLink')
const article = document.querySelector<HTMLElement>('.article-prose')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const tocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.article-toc a'))
const observedSections = tocLinks
  .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
  .filter((section): section is HTMLElement => section !== null)
const codeCopyResetTimers = new WeakMap<HTMLButtonElement, number>()
const lightbox = document.querySelector<HTMLDialogElement>('[data-image-lightbox]')
const lightboxImage = lightbox?.querySelector<HTMLImageElement>('[data-lightbox-image]') ?? null
const lightboxCaption = lightbox?.querySelector<HTMLElement>('[data-lightbox-caption]') ?? null

let activeLightboxTrigger: HTMLButtonElement | null = null
let lockedScrollPosition: { x: number, y: number } | null = null
let savedBodyStyle: string | null = null

let scrollFrame = 0
let activeTocIndex = -1

function updateReadingProgress(): void {
  if (!progress || !article) return
  const bounds = article.getBoundingClientRect()
  const readableDistance = Math.max(1, article.offsetHeight - window.innerHeight * 0.55)
  const amount = Math.min(1, Math.max(0, -bounds.top / readableDistance))
  progress.style.transform = `scaleX(${amount.toFixed(4)})`
}

function updateActiveToc(): void {
  const activationLine = Math.max(112, window.innerHeight * 0.22)
  let nextIndex = -1

  for (let index = 0; index < observedSections.length; index += 1) {
    if (observedSections[index].getBoundingClientRect().top > activationLine) break
    nextIndex = index
  }

  if (nextIndex === activeTocIndex) return
  activeTocIndex = nextIndex
  tocLinks.forEach((link, index) => {
    const active = index === activeTocIndex
    link.classList.toggle('active', active)
    if (active) link.setAttribute('aria-current', 'location')
    else link.removeAttribute('aria-current')
  })
}

function updateScrollState(): void {
  scrollFrame = 0
  updateReadingProgress()
  updateActiveToc()
}

function scheduleScrollState(): void {
  if (scrollFrame) return
  scrollFrame = window.requestAnimationFrame(updateScrollState)
}

window.addEventListener('scroll', scheduleScrollState, { passive: true })
window.addEventListener('resize', scheduleScrollState)
updateScrollState()
type CodeCopyState = 'idle' | 'success' | 'error'

function updateCodeCopyState(button: HTMLButtonElement, state: CodeCopyState): void {
  const feedback = button.querySelector<HTMLElement>('[data-code-copy-feedback]')
  const status = button.querySelector<HTMLElement>('[data-code-copy-status]')
  const message = state === 'success' ? '已复制' : state === 'error' ? '复制失败' : ''

  button.dataset.copyState = state
  button.setAttribute('aria-label', message || '复制代码')
  if (feedback) feedback.textContent = state === 'success' ? '✓' : message
  if (status) status.textContent = message
}

function scheduleCodeCopyReset(button: HTMLButtonElement): void {
  const activeTimer = codeCopyResetTimers.get(button)
  if (activeTimer !== undefined) window.clearTimeout(activeTimer)

  const timer = window.setTimeout(() => {
    updateCodeCopyState(button, 'idle')
    codeCopyResetTimers.delete(button)
  }, 2000)
  codeCopyResetTimers.set(button, timer)
}

article?.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return
  const button = event.target.closest<HTMLButtonElement>('[data-code-copy]')
  if (!button) return

  const codeBlock = button.closest<HTMLElement>('[data-code-block]')
  const source = codeBlock?.querySelector<HTMLElement>(':scope > pre > code')
  try {
    if (!source || !navigator.clipboard?.writeText) throw new Error('Code copy is unavailable')
    await navigator.clipboard.writeText(source.textContent ?? '')
    updateCodeCopyState(button, 'success')
  } catch {
    updateCodeCopyState(button, 'error')
  }
  scheduleCodeCopyReset(button)
})

function lockPageScroll(): void {
  if (lockedScrollPosition) return
  const body = document.body
  lockedScrollPosition = { x: window.scrollX, y: window.scrollY }
  savedBodyStyle = body.getAttribute('style')
  body.style.position = 'fixed'
  body.style.inset = `${-lockedScrollPosition.y}px auto auto ${-lockedScrollPosition.x}px`
  body.style.width = '100%'
  body.style.overflow = 'hidden'
}

function unlockPageScroll(): void {
  if (!lockedScrollPosition) return
  const { x, y } = lockedScrollPosition
  const body = document.body
  if (savedBodyStyle === null) body.removeAttribute('style')
  else body.setAttribute('style', savedBodyStyle)
  lockedScrollPosition = null
  savedBodyStyle = null

  const previousScrollBehavior = document.documentElement.style.scrollBehavior
  document.documentElement.style.scrollBehavior = 'auto'
  window.scrollTo(x, y)
  document.documentElement.style.scrollBehavior = previousScrollBehavior
}

function synchronizeLightboxImage(source: HTMLImageElement): void {
  if (!lightboxImage) return
  for (const name of ['src', 'srcset', 'sizes', 'width', 'height'] as const) {
    const value = source.getAttribute(name)
    if (value === null) lightboxImage.removeAttribute(name)
    else lightboxImage.setAttribute(name, value)
  }
  lightboxImage.alt = source.alt
}

function openLightbox(trigger: HTMLButtonElement): void {
  if (!lightbox || !lightboxImage || lightbox.open || typeof lightbox.showModal !== 'function') return
  const source = trigger.querySelector<HTMLImageElement>('img')
  const figure = trigger.closest<HTMLElement>('.markdown-figure')
  const caption = figure?.querySelector<HTMLElement>(':scope > figcaption')
  if (!source || !caption) return

  activeLightboxTrigger = trigger
  synchronizeLightboxImage(source)
  if (lightboxCaption) lightboxCaption.textContent = caption.textContent?.trim() ?? ''
  lockPageScroll()
  try {
    lightbox.showModal()
  } catch (error) {
    unlockPageScroll()
    activeLightboxTrigger = null
    console.error(error)
  }
}

article?.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return
  const trigger = event.target.closest<HTMLButtonElement>('[data-lightbox-trigger]')
  if (trigger) openLightbox(trigger)
})

lightbox?.querySelector<HTMLButtonElement>('[data-lightbox-close]')?.addEventListener('click', () => {
  lightbox.close()
})

lightbox?.addEventListener('click', (event) => {
  if (event.target !== lightbox) return
  const bounds = lightbox.getBoundingClientRect()
  const outside = event.clientX < bounds.left
    || event.clientX > bounds.right
    || event.clientY < bounds.top
    || event.clientY > bounds.bottom
  if (outside) lightbox.close()
})

lightbox?.addEventListener('close', () => {
  const trigger = activeLightboxTrigger
  activeLightboxTrigger = null
  unlockPageScroll()
  if (trigger?.isConnected) trigger.focus({ preventScroll: true })
})


copyLink?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copyLink.textContent = 'LINK COPIED'
  } catch {
    copyLink.textContent = 'COPY FAILED'
  }
  window.setTimeout(() => { copyLink.textContent = 'COPY LINK' }, reduceMotion ? 500 : 1800)
})

const mermaidThemeVariables = {
  background: '#f1eadf',
  primaryColor: '#e9dfcf',
  primaryTextColor: '#302d29',
  primaryBorderColor: '#b29a83',
  lineColor: '#6f7169',
  secondaryColor: '#d8dfd4',
  tertiaryColor: '#d9e0e5',
  clusterBkg: '#f1eadf',
  clusterBorder: '#cdbb9a',
  edgeLabelBackground: '#f1eadf',
  fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: '14px',
}

function markMermaidFailure(figure: HTMLElement, error: unknown): void {
  const canvas = figure.querySelector<HTMLElement>('.mermaid-diagram__canvas')
  const source = figure.querySelector<HTMLElement>('.mermaid-diagram__source')
  const status = figure.querySelector<HTMLElement>('.mermaid-diagram__error')
  if (canvas) canvas.hidden = true
  if (source) source.hidden = false
  if (status) status.hidden = false
  figure.classList.add('is-error')
  figure.classList.remove('is-rendered')
  console.error(error)
}

async function initializeMermaidDiagrams(): Promise<void> {
  const figures = Array.from(document.querySelectorAll<HTMLElement>('[data-mermaid-diagram]'))
  if (!figures.length) return
  let mermaid: Mermaid
  try {
    // Keep Mermaid out of articles without diagrams; esbuild emits this as a local split chunk.
    const module = await import('mermaid')
    mermaid = module.default
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      flowchart: { htmlLabels: false, useMaxWidth: false },
      themeVariables: mermaidThemeVariables,
    })
  } catch (error) {
    figures.forEach((figure) => markMermaidFailure(figure, error))
    return
  }

  for (const [index, figure] of figures.entries()) {
    try {
      const canvas = figure.querySelector<HTMLElement>('.mermaid-diagram__canvas')
      const sourceContainer = figure.querySelector<HTMLElement>('.mermaid-diagram__source')
      const sourceCode = sourceContainer?.querySelector<HTMLElement>(':scope > code')
      const source = sourceCode?.textContent || ''
      if (!canvas || !sourceContainer || !source.trim()) throw new Error('Mermaid diagram is missing its source DOM')

      const { svg, bindFunctions } = await mermaid.render(`mermaid-diagram-${index + 1}`, source)
      canvas.innerHTML = svg
      bindFunctions?.(canvas)
      canvas.hidden = false
      sourceContainer.hidden = true
      figure.querySelector<HTMLElement>('.mermaid-diagram__error')?.setAttribute('hidden', '')
      figure.classList.add('is-rendered')
      figure.classList.remove('is-error')

      const renderedSvg = canvas.querySelector<SVGSVGElement>('svg')
      const naturalWidth = renderedSvg?.viewBox.baseVal.width
      if (naturalWidth && Number.isFinite(naturalWidth) && naturalWidth > 760) {
        canvas.classList.add('is-wide')
        canvas.style.setProperty('--mermaid-natural-width', `${naturalWidth}px`)
      }
    } catch (error) {
      markMermaidFailure(figure, error)
    }
  }
}

void initializeMermaidDiagrams()
