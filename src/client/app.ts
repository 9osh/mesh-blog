export {}

type Article = {
  slug: string
  href: string
  publishedAt: string
  displayDate: string
  title: string
  description: string
  tags: string[]
  readingTime: string
  index: string
}

const heroWords = ['BUILD.', 'BREAK.', 'ORCHESTRATE.', 'LEARN.']
let articles: Article[] = []
let tags = ['All']
let activeTag = 'All'
let query = ''

const timeline = document.querySelector<HTMLElement>('#timeline')!
const tagList = document.querySelector<HTMLElement>('#tagList')!
const searchInput = document.querySelector<HTMLInputElement>('#searchInput')!
const clearSearch = document.querySelector<HTMLButtonElement>('#clearSearch')!
const entryCount = document.querySelector<HTMLElement>('#entryCount')!
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
}

function renderTags(): void {
  tagList.innerHTML = tags.map((tag) => `<button class="tag${activeTag === tag ? ' active' : ''}" data-tag="${escapeHtml(tag)}" aria-pressed="${activeTag === tag}">${escapeHtml(tag)}</button>`).join('')
  tagList.querySelectorAll<HTMLButtonElement>('.tag').forEach((button) => {
    button.addEventListener('click', () => {
      activeTag = button.dataset.tag || 'All'
      renderTags()
      renderTimeline()
      syncFilterUrl()
    })
  })
}

function renderTimeline(): void {
  const needle = query.trim().toLowerCase()
  const filtered = articles.filter((article) => {
    const matchesTag = activeTag === 'All' || article.tags.includes(activeTag)
    const haystack = `${article.title} ${article.description} ${article.tags.join(' ')}`.toLowerCase()
    return matchesTag && (!needle || haystack.includes(needle))
  })
  entryCount.textContent = `${String(filtered.length).padStart(2, '0')} entries`

  if (!filtered.length) {
    timeline.innerHTML = `<div class="empty-state"><p>No notes match this filter.</p><button id="resetFilters">Reset filters</button></div>`
    document.querySelector<HTMLButtonElement>('#resetFilters')?.addEventListener('click', () => {
      activeTag = 'All'
      query = ''
      searchInput.value = ''
      clearSearch.hidden = true
      renderTags()
      renderTimeline()
      syncFilterUrl()
    })
    setupTimelineMotion()
    return
  }

  timeline.innerHTML = filtered.map((article) => `
    <article class="timeline-entry">
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
    </article>`).join('')
  setupTimelineMotion()
}

let motionEntries: HTMLElement[] = []
let motionFrame = 0
let pendingMotionAnimation = true
let motionListenersInstalled = false
const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))

function scheduleTimelineMotion(animateTransitions = true): void {
  pendingMotionAnimation = pendingMotionAnimation && animateTransitions
  if (motionFrame) return
  motionFrame = window.requestAnimationFrame(() => {
    const shouldAnimate = pendingMotionAnimation
    motionFrame = 0
    pendingMotionAnimation = true
    updateTimelineMotion(shouldAnimate)
  })
}

function updateTimelineMotion(animateTransitions: boolean): void {
  if (!motionEntries.length) {
    timeline.style.setProperty('--timeline-progress', '0')
    return
  }

  const viewportHeight = window.innerHeight || 800
  const timelineRect = timeline.getBoundingClientRect()
  const progressRange = Math.max(1, timelineRect.height - viewportHeight * 0.58)
  const progress = clamp((viewportHeight * 0.42 - timelineRect.top) / progressRange)
  const progressEnd = timelineRect.top + timelineRect.height * progress
  timeline.style.setProperty('--timeline-progress', String(progress))

  let activeEntry: HTMLElement | null = null
  let activeDistance = Number.POSITIVE_INFINITY
  motionEntries.forEach((entry) => {
    const dot = entry.querySelector<HTMLElement>('.timeline-dot')
    if (dot) {
      const dotRect = dot.getBoundingClientRect()
      const isComplete = progressEnd >= dotRect.top + dotRect.height * 0.5
      const wasComplete = entry.classList.contains('is-complete')
      if (isComplete !== wasComplete) {
        entry.classList.toggle('is-complete', isComplete)
        entry.classList.remove('is-completing', 'is-uncompleting')
        if (animateTransitions && !reduceMotion) {
          entry.classList.add(isComplete ? 'is-completing' : 'is-uncompleting')
        }
      }
    }

    const card = entry.querySelector<HTMLElement>('.article-card')
    if (!card) return
    const entryRect = entry.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const center = cardRect.top + cardRect.height * 0.5
    const focusLine = viewportHeight * 0.48
    const distance = Math.abs(center - focusLine)
    if (distance < activeDistance && entryRect.bottom > 90 && entryRect.top < viewportHeight - 70) {
      activeDistance = distance
      activeEntry = entry
    }
    if (!reduceMotion) {
      const focus = clamp(1 - distance / (viewportHeight * 0.66))
      card.style.setProperty('--scroll-y', `${((center > focusLine ? 1 : -1) * (1 - focus) * 28).toFixed(1)}px`)
      card.style.setProperty('--scroll-scale', (0.968 + focus * 0.032).toFixed(4))
      card.style.setProperty('--scroll-opacity', (0.56 + focus * 0.44).toFixed(3))
      card.style.setProperty('--scroll-blur', `${((1 - focus) * 0.55).toFixed(2)}px`)
    }
  })
  motionEntries.forEach((entry) => entry.classList.toggle('is-active', entry === activeEntry))
}

function clearTimelineDotAnimation(event: AnimationEvent): void {
  if (!(event.target instanceof Element)) return
  const entry = event.target.closest<HTMLElement>('.timeline-entry')
  if (event.animationName === 'timeline-dot-complete') entry?.classList.remove('is-completing')
  if (event.animationName === 'timeline-dot-uncomplete') entry?.classList.remove('is-uncompleting')
}

function setupCardPointerMotion(card: HTMLElement): void {
  if (reduceMotion || window.matchMedia('(hover: none), (pointer: coarse)').matches) return
  card.addEventListener('pointermove', (event) => {
    const bounds = card.getBoundingClientRect()
    const x = clamp((event.clientX - bounds.left) / bounds.width)
    const y = clamp((event.clientY - bounds.top) / bounds.height)
    card.style.setProperty('--ry', `${((x - 0.5) * 2.2).toFixed(2)}deg`)
    card.style.setProperty('--rx', `${((0.5 - y) * 1.6).toFixed(2)}deg`)
    card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
    card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
  })
  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--rx', '0deg')
    card.style.setProperty('--ry', '0deg')
    card.style.setProperty('--mx', '50%')
    card.style.setProperty('--my', '50%')
  })
}

function setupTimelineMotion(): void {
  if (motionFrame) {
    window.cancelAnimationFrame(motionFrame)
    motionFrame = 0
  }
  pendingMotionAnimation = true
  motionEntries = Array.from(timeline.querySelectorAll<HTMLElement>('.timeline-entry'))
  motionEntries.forEach((entry) => {
    const card = entry.querySelector<HTMLElement>('.article-card')
    if (card) setupCardPointerMotion(card)
  })
  if (!motionListenersInstalled) {
    motionListenersInstalled = true
    window.addEventListener('scroll', () => scheduleTimelineMotion(true), { passive: true })
    window.addEventListener('resize', () => scheduleTimelineMotion(false))
    timeline.addEventListener('animationend', clearTimelineDotAnimation)
    timeline.addEventListener('animationcancel', clearTimelineDotAnimation)
  }
  updateTimelineMotion(false)
}

let queryUrlTimer = 0

function syncFilterUrl(): void {
  const url = new URL(window.location.href)
  if (query.trim()) url.searchParams.set('q', query.trim())
  else url.searchParams.delete('q')
  if (activeTag !== 'All') url.searchParams.set('tag', activeTag)
  else url.searchParams.delete('tag')
  window.history.replaceState(null, '', url)
}

function restoreFilterState(): void {
  const parameters = new URLSearchParams(window.location.search)
  query = parameters.get('q') || ''
  const requestedTag = parameters.get('tag')
  activeTag = requestedTag && tags.includes(requestedTag) ? requestedTag : 'All'
  searchInput.value = query
  clearSearch.hidden = !query
}

searchInput.addEventListener('input', () => {
  query = searchInput.value
  clearSearch.hidden = !query
  renderTimeline()
  window.clearTimeout(queryUrlTimer)
  queryUrlTimer = window.setTimeout(syncFilterUrl, 180)
})
clearSearch.addEventListener('click', () => {
  query = ''
  searchInput.value = ''
  clearSearch.hidden = true
  searchInput.focus()
  renderTimeline()
  syncFilterUrl()
})
document.querySelector<HTMLButtonElement>('#exploreButton')!.addEventListener('click', () => {
  document.querySelector('#journal')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })
})

const menuButton = document.querySelector<HTMLButtonElement>('#menuButton')!
const mobileNav = document.querySelector<HTMLElement>('#mobileNav')!
menuButton.addEventListener('click', () => {
  const open = mobileNav.hidden
  mobileNav.hidden = !open
  menuButton.setAttribute('aria-expanded', String(open))
  menuButton.textContent = open ? '×' : '☰'
})
mobileNav.querySelectorAll('a').forEach((anchor) => anchor.addEventListener('click', () => {
  mobileNav.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); menuButton.textContent = '☰'
}))

if (!reduceMotion) {
  let wordIndex = 0
  const heroWord = document.querySelector<HTMLElement>('#heroWord')!
  window.setInterval(() => {
    wordIndex = (wordIndex + 1) % heroWords.length
    heroWord.classList.remove('hero-word-enter')
    void heroWord.offsetWidth
    heroWord.textContent = heroWords[wordIndex]
    heroWord.classList.add('hero-word-enter')
  }, 1600)
}

document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null
  const isEditing = target?.matches('input, textarea, select, [contenteditable="true"]') ?? false
  if (event.key === '/' && !isEditing) {
    event.preventDefault()
    searchInput.focus()
  } else if (event.key === 'Escape' && document.activeElement === searchInput && query) {
    query = ''
    searchInput.value = ''
    clearSearch.hidden = true
    renderTimeline()
    syncFilterUrl()
  }
})

window.addEventListener('popstate', () => {
  if (!articles.length) return
  restoreFilterState()
  renderTags()
  renderTimeline()
})

function readEmbeddedArticles(): Article[] | null {
  const element = document.querySelector<HTMLScriptElement>('#articleIndex')
  if (!element?.textContent) return null
  try {
    const value: unknown = JSON.parse(element.textContent)
    return Array.isArray(value) ? value as Article[] : null
  } catch {
    return null
  }
}

async function loadArticles(): Promise<void> {
  const staticCardsAvailable = timeline.querySelector('.timeline-entry') !== null
  if (staticCardsAvailable) setupTimelineMotion()
  else timeline.innerHTML = '<div class="timeline-loading">Loading field notes…</div>'

  try {
    const embeddedArticles = readEmbeddedArticles()
    if (embeddedArticles) {
      articles = embeddedArticles
    } else {
      const response = await fetch('/articles.json')
      if (!response.ok) throw new Error(`Article index returned ${response.status}`)
      articles = await response.json() as Article[]
    }
    tags = ['All', ...Array.from(new Set(articles.flatMap((article) => article.tags)))]
    restoreFilterState()
    renderTags()
    renderTimeline()
  } catch (error) {
    console.error(error)
    if (staticCardsAvailable) return
    entryCount.textContent = 'Unavailable'
    timeline.innerHTML = '<div class="empty-state"><p>The journal index could not be loaded.</p><button id="retryArticles">Retry</button></div>'
    document.querySelector<HTMLButtonElement>('#retryArticles')?.addEventListener('click', loadArticles)
  }
}

void loadArticles()
