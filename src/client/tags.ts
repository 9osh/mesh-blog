export {}

type TagArticle = {
  title: string
  href: string
  publishedAt: string
  displayDate: string
}

type TagNode = {
  name: string
  articles: TagArticle[]
  relatedCount: number
  articleCount: number
  latestPublishedAt: string
}

type TagEdge = {
  source: string
  target: string
  weight: number
}

type TagGraph = {
  nodes: TagNode[]
  edges: TagEdge[]
}

type TagsView = 'index' | 'relations'

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

const page = document.querySelector<HTMLElement>('#tagsPage')!
const list = document.querySelector<HTMLElement>('#tagsList')!
const search = document.querySelector<HTMLInputElement>('#tagsSearch')!
const visibleCount = document.querySelector<HTMLElement>('#tagsVisibleCount')!
const emptyState = document.querySelector<HTMLElement>('#tagsEmpty')!
const exploreButton = document.querySelector<HTMLButtonElement>('#exploreRelations')!
const returnButton = document.querySelector<HTMLButtonElement>('#returnToIndex')!
const map = document.querySelector<HTMLElement>('#relationMap')!
const mapTitle = document.querySelector<HTMLElement>('#relationTitle')!
const mapStage = document.querySelector<HTMLElement>('#tagsMapStage')!
const detailTitle = document.querySelector<HTMLElement>('#detailTagTitle')!
const detailArticleCount = document.querySelector<HTMLElement>('#detailArticleCount')!
const detailNotes = document.querySelector<HTMLElement>('#detailNotes')!
const detailRelations = document.querySelector<HTMLElement>('#detailRelations')!
const detailRecentArticles = document.querySelector<HTMLOListElement>('#detailRecentArticles')!
const viewTagArticles = document.querySelector<HTMLAnchorElement>('#viewTagArticles')!
const menuButton = document.querySelector<HTMLButtonElement>('#tagsMenuButton')!
const mobileNav = document.querySelector<HTMLElement>('#tagsMobileNav')!
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const transitionDocument = document as ViewTransitionDocument

const MAP_WIDTH = 1100
const MAP_HEIGHT = 760
const graph = readTagGraph()
const nodesByName = new Map(graph.nodes.map((node) => [node.name, node]))
let selectedTag = resolveRequestedTag() || graph.nodes[0]?.name || ''
let currentView: TagsView = new URLSearchParams(window.location.search).get('view') === 'relations' ? 'relations' : 'index'
let mapPositions = new Map<string, { x: number; y: number; size: number }>()
let mapView = { x: 0, y: 0, scale: 1, pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0, moved: false, pressedTag: '' }
let resizeObserver: ResizeObserver | undefined

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
}

function readTagGraph(): TagGraph {
  const element = document.querySelector<HTMLScriptElement>('#tagGraph')
  if (!element?.textContent) return { nodes: [], edges: [] }
  try {
    const value = JSON.parse(element.textContent) as Partial<TagGraph>
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return { nodes: [], edges: [] }
    return { nodes: value.nodes, edges: value.edges }
  } catch {
    return { nodes: [], edges: [] }
  }
}

function resolveRequestedTag(): string {
  const requested = new URLSearchParams(window.location.search).get('tag')
  return requested && nodesByName.has(requested) ? requested : ''
}

function articleListHref(tag: string): string {
  const url = new URL('/', window.location.origin)
  url.searchParams.set('tag', tag)
  url.hash = 'journal'
  return `${url.pathname}${url.search}${url.hash}`
}

function syncUrl(): void {
  const url = new URL(window.location.href)
  if (selectedTag) url.searchParams.set('tag', selectedTag)
  else url.searchParams.delete('tag')
  if (currentView === 'relations') url.searchParams.set('view', 'relations')
  else url.searchParams.delete('view')
  window.history.replaceState(null, '', url)
}

function renderSelection(): void {
  const node = nodesByName.get(selectedTag)
  if (!node) return
  list.querySelectorAll<HTMLElement>('[data-tag-row]').forEach((row) => {
    const selected = row.dataset.tagRow === selectedTag
    row.classList.toggle('is-selected', selected)
    row.setAttribute('aria-current', String(selected))
  })
  detailTitle.textContent = node.name
  mapTitle.textContent = node.name
  detailArticleCount.textContent = String(node.articleCount).padStart(2, '0')
  detailNotes.textContent = String(node.articleCount).padStart(2, '0')
  detailRelations.textContent = String(node.relatedCount).padStart(2, '0')
  detailRecentArticles.innerHTML = node.articles.slice(0, 3).map((article) => `<li><a href="${escapeHtml(article.href)}"><span>${escapeHtml(article.displayDate)}</span><strong>${escapeHtml(article.title)}</strong></a></li>`).join('')
  viewTagArticles.href = articleListHref(node.name)
  updateMapSelection()
  syncUrl()
}

function selectTag(tag: string): void {
  if (!nodesByName.has(tag)) return
  selectedTag = tag
  renderSelection()
}

function applySearch(): void {
  const needle = search.value.trim().toLocaleLowerCase()
  let count = 0
  list.querySelectorAll<HTMLElement>('[data-tag-row]').forEach((row) => {
    const matches = (row.dataset.tagRow || '').toLocaleLowerCase().includes(needle)
    row.hidden = !matches
    if (matches) count += 1
  })
  visibleCount.textContent = String(count).padStart(2, '0')
  emptyState.hidden = count !== 0
}

function setView(nextView: TagsView, focus = true): void {
  if (currentView === nextView && page.dataset.tagsView === nextView) return
  const update = (): void => {
    currentView = nextView
    page.dataset.tagsView = nextView
    map.setAttribute('aria-hidden', String(nextView !== 'relations'))
    syncUrl()
    if (nextView === 'relations') window.requestAnimationFrame(resetMapView)
  }
  const focusTarget = (): void => {
    if (!focus) return
    if (nextView === 'relations') mapTitle.focus({ preventScroll: true })
    else exploreButton.focus({ preventScroll: true })
  }
  if (reduceMotion || !transitionDocument.startViewTransition) {
    update()
    focusTarget()
    return
  }
  transitionDocument.startViewTransition(update).finished.then(focusTarget, focusTarget)
}

function createMapPositions(): Map<string, { x: number; y: number; size: number }> {
  const positions = new Map<string, { x: number; y: number; size: number }>()
  const maximumCount = Math.max(1, ...graph.nodes.map((node) => node.articleCount))
  const outerNodes = graph.nodes.slice(1)
  graph.nodes.forEach((node, index) => {
    const size = 82 + (node.articleCount / maximumCount) * 38
    if (index === 0) {
      positions.set(node.name, { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, size })
      return
    }
    const angle = -Math.PI / 2 + ((index - 1) / Math.max(1, outerNodes.length)) * Math.PI * 2
    const ring = index % 2 === 0 ? 250 : 315
    positions.set(node.name, {
      x: MAP_WIDTH / 2 + Math.cos(angle) * ring,
      y: MAP_HEIGHT / 2 + Math.sin(angle) * ring * 0.76,
      size,
    })
  })
  return positions
}

function renderMap(): void {
  if (!graph.nodes.length) {
    mapStage.innerHTML = '<p class="tags-map-empty">No published topics are available.</p>'
    return
  }
  mapPositions = createMapPositions()
  const maximumWeight = Math.max(1, ...graph.edges.map((edge) => edge.weight))
  const lines = graph.edges.map((edge) => {
    const source = mapPositions.get(edge.source)!
    const target = mapPositions.get(edge.target)!
    const width = 1 + (edge.weight / maximumWeight) * 3
    return `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" style="--edge-width:${width}" data-edge-source="${escapeHtml(edge.source)}" data-edge-target="${escapeHtml(edge.target)}" />`
  }).join('')
  const nodes = graph.nodes.map((node) => {
    const position = mapPositions.get(node.name)!
    return `<button class="tags-map-node" type="button" style="left:${position.x}px;top:${position.y}px;--node-size:${position.size}px" data-map-tag="${escapeHtml(node.name)}" aria-label="选择标签 ${escapeHtml(node.name)}"><span>${String(node.articleCount).padStart(2, '0')}</span><strong>${escapeHtml(node.name)}</strong><small>${node.relatedCount} LINKS</small></button>`
  }).join('')
  mapStage.innerHTML = `<div class="tags-map-toolbar" role="group" aria-label="关系图缩放"><button type="button" data-map-action="out" aria-label="缩小">−</button><output id="mapScale">100%</output><button type="button" data-map-action="in" aria-label="放大">＋</button><button type="button" data-map-action="fit">Fit</button></div><div class="tags-map-viewport" id="tagsMapViewport" tabindex="0" aria-label="可拖动和缩放的标签关系图"><div class="tags-map-canvas" id="tagsMapCanvas"><svg viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" aria-hidden="true">${lines}</svg>${nodes}</div></div><p class="tags-map-hint">Drag to pan · Wheel / ± to zoom · Arrow keys to move</p>`
  installMapInteractions()
  updateMapSelection()
}

function updateMapTransform(): void {
  const canvas = document.querySelector<HTMLElement>('#tagsMapCanvas')
  const output = document.querySelector<HTMLOutputElement>('#mapScale')
  if (!canvas || !output) return
  canvas.style.transform = `translate3d(${mapView.x}px, ${mapView.y}px, 0) scale(${mapView.scale})`
  output.value = `${Math.round(mapView.scale * 100)}%`
  output.textContent = output.value
}

function resetMapView(): void {
  const viewport = document.querySelector<HTMLElement>('#tagsMapViewport')
  if (!viewport || viewport.clientWidth === 0 || viewport.clientHeight === 0) return
  const fittedScale = Math.min(1, (viewport.clientWidth - 32) / MAP_WIDTH, (viewport.clientHeight - 32) / MAP_HEIGHT)
  mapView.scale = Math.max(0.28, fittedScale)
  mapView.x = (viewport.clientWidth - MAP_WIDTH * mapView.scale) / 2
  mapView.y = (viewport.clientHeight - MAP_HEIGHT * mapView.scale) / 2
  updateMapTransform()
}

function zoomMap(nextScale: number, clientX: number, clientY: number): void {
  const viewport = document.querySelector<HTMLElement>('#tagsMapViewport')
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()
  const pointX = clientX - rect.left
  const pointY = clientY - rect.top
  const scale = Math.min(1.8, Math.max(0.28, nextScale))
  const worldX = (pointX - mapView.x) / mapView.scale
  const worldY = (pointY - mapView.y) / mapView.scale
  mapView.x = pointX - worldX * scale
  mapView.y = pointY - worldY * scale
  mapView.scale = scale
  updateMapTransform()
}

function updateMapSelection(): void {
  mapStage.querySelectorAll<HTMLElement>('[data-map-tag]').forEach((node) => {
    const selected = node.dataset.mapTag === selectedTag
    node.classList.toggle('is-selected', selected)
    node.setAttribute('aria-pressed', String(selected))
  })
  mapStage.querySelectorAll<SVGLineElement>('[data-edge-source]').forEach((edge) => {
    const connected = edge.dataset.edgeSource === selectedTag || edge.dataset.edgeTarget === selectedTag
    edge.classList.toggle('is-connected', connected)
  })
}

function installMapInteractions(): void {
  const viewport = document.querySelector<HTMLElement>('#tagsMapViewport')!
  const toolbar = mapStage.querySelector<HTMLElement>('.tags-map-toolbar')!
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(resetMapView)
  resizeObserver.observe(viewport)

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    mapView.pointerId = event.pointerId
    mapView.startX = event.clientX
    mapView.startY = event.clientY
    mapView.originX = mapView.x
    mapView.originY = mapView.y
    mapView.moved = false
    mapView.pressedTag = (event.target as HTMLElement).closest<HTMLElement>('[data-map-tag]')?.dataset.mapTag || ''
    viewport.setPointerCapture(event.pointerId)
    viewport.classList.add('is-dragging')
  })
  viewport.addEventListener('pointermove', (event) => {
    if (event.pointerId !== mapView.pointerId) return
    const deltaX = event.clientX - mapView.startX
    const deltaY = event.clientY - mapView.startY
    mapView.moved ||= Math.hypot(deltaX, deltaY) > 4
    mapView.x = mapView.originX + deltaX
    mapView.y = mapView.originY + deltaY
    updateMapTransform()
  })
  const finishPointer = (event: PointerEvent, selectPressed = true): void => {
    if (event.pointerId !== mapView.pointerId) return
    if (selectPressed && !mapView.moved && mapView.pressedTag) selectTag(mapView.pressedTag)
    mapView.pointerId = -1
    mapView.pressedTag = ''
    mapView.moved = false
    viewport.classList.remove('is-dragging')
  }
  viewport.addEventListener('pointerup', finishPointer)
  viewport.addEventListener('pointercancel', (event) => finishPointer(event, false))
  viewport.addEventListener('wheel', (event) => {
    event.preventDefault()
    zoomMap(mapView.scale * Math.exp(-event.deltaY * 0.001), event.clientX, event.clientY)
  }, { passive: false })
  viewport.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 90 : 36
    const rect = viewport.getBoundingClientRect()
    if (event.key === 'ArrowLeft') mapView.x += step
    else if (event.key === 'ArrowRight') mapView.x -= step
    else if (event.key === 'ArrowUp') mapView.y += step
    else if (event.key === 'ArrowDown') mapView.y -= step
    else if (event.key === '+' || event.key === '=') zoomMap(mapView.scale * 1.15, rect.left + rect.width / 2, rect.top + rect.height / 2)
    else if (event.key === '-') zoomMap(mapView.scale / 1.15, rect.left + rect.width / 2, rect.top + rect.height / 2)
    else return
    event.preventDefault()
    updateMapTransform()
  })
  toolbar.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-map-action]')?.dataset.mapAction
    const rect = viewport.getBoundingClientRect()
    if (action === 'in') zoomMap(mapView.scale * 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2)
    else if (action === 'out') zoomMap(mapView.scale / 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2)
    else if (action === 'fit') resetMapView()
  })
}

list.addEventListener('click', (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-tag-row]')
  if (!row) return
  event.preventDefault()
  selectTag(row.dataset.tagRow || '')
})
search.addEventListener('input', applySearch)
exploreButton.addEventListener('click', () => setView('relations'))
returnButton.addEventListener('click', () => setView('index'))
menuButton.addEventListener('click', () => {
  const open = mobileNav.hidden
  mobileNav.hidden = !open
  menuButton.setAttribute('aria-expanded', String(open))
  menuButton.textContent = open ? '×' : '☰'
})
mobileNav.querySelectorAll('a').forEach((anchor) => anchor.addEventListener('click', () => {
  mobileNav.hidden = true
  menuButton.setAttribute('aria-expanded', 'false')
  menuButton.textContent = '☰'
}))
window.addEventListener('popstate', () => {
  selectedTag = resolveRequestedTag() || graph.nodes[0]?.name || ''
  currentView = new URLSearchParams(window.location.search).get('view') === 'relations' ? 'relations' : 'index'
  page.dataset.tagsView = currentView
  map.setAttribute('aria-hidden', String(currentView !== 'relations'))
  renderSelection()
})

renderMap()
renderSelection()
page.dataset.tagsView = currentView
map.setAttribute('aria-hidden', String(currentView !== 'relations'))
if (currentView === 'relations') window.requestAnimationFrame(resetMapView)
