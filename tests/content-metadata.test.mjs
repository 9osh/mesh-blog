import assert from 'node:assert/strict'
import test from 'node:test'
import { formatArticleIndex, parsePublishedAt, preparePublishedPosts } from '../scripts/lib/content-metadata.mjs'

function post(source, publishedAt, draft = false) {
  return { source, draft, ...parsePublishedAt(publishedAt) }
}

test('publishedAt accepts canonical timestamps with Z and explicit offsets', () => {
  assert.deepEqual(parsePublishedAt('2026-08-14T04:00:00Z'), {
    publishedAt: '2026-08-14T04:00:00Z',
    publishedAtMs: Date.parse('2026-08-14T04:00:00Z'),
    publishedDate: '2026-08-14',
  })
  assert.equal(
    parsePublishedAt('2026-08-14T12:00:00+08:00').publishedAtMs,
    Date.parse('2026-08-14T04:00:00Z'),
  )
  assert.equal(parsePublishedAt('2026-08-13T23:30:00-02:00').publishedDate, '2026-08-13')
})

test('publishedAt rejects missing time zones and non-canonical forms', () => {
  for (const value of ['2026-08-14', '2026-08-14T12:00:00', '2026-08-14T12:00Z', '2026-08-14T12:00:00+0800']) {
    assert.throws(() => parsePublishedAt(value), /publishedAt must use/)
  }
})

test('publishedAt rejects invalid calendar dates, times, and offsets', () => {
  assert.throws(() => parsePublishedAt('2026-02-30T12:00:00+08:00'), /valid calendar date/)
  assert.throws(() => parsePublishedAt('2026-08-14T24:00:00+08:00'), /valid time/)
  assert.throws(() => parsePublishedAt('2026-08-14T12:60:00+08:00'), /valid time/)
  assert.throws(() => parsePublishedAt('2026-08-14T12:00:60+08:00'), /valid time/)
  assert.throws(() => parsePublishedAt('2026-08-14T12:00:00+24:00'), /valid UTC offset/)
})

test('published posts are numbered oldest-first and returned newest-first', () => {
  const posts = preparePublishedPosts([
    post('middle.md', '2026-08-13T12:00:00+08:00'),
    post('oldest.md', '2026-08-12T12:00:00+08:00'),
    post('newest.md', '2026-08-14T12:00:00+08:00'),
  ])

  assert.deepEqual(posts.map(({ source, index }) => ({ source, index })), [
    { source: 'newest.md', index: '003' },
    { source: 'middle.md', index: '002' },
    { source: 'oldest.md', index: '001' },
  ])
})

test('drafts neither take an index nor conflict with published posts', () => {
  const posts = preparePublishedPosts([
    post('published.md', '2026-08-14T12:00:00+08:00'),
    post('draft.md', '2026-08-14T04:00:00Z', true),
  ])
  assert.deepEqual(posts.map(({ source, index }) => ({ source, index })), [
    { source: 'published.md', index: '001' },
  ])
})

test('publishedAt collisions compare real instants rather than source strings', () => {
  assert.throws(
    () => preparePublishedPosts([
      post('offset.md', '2026-08-14T12:00:00+08:00'),
      post('utc.md', '2026-08-14T04:00:00Z'),
    ]),
    /offset\.md and utc\.md|utc\.md and offset\.md/,
  )
})

test('article indexes are at least three digits without truncation', () => {
  assert.equal(formatArticleIndex(1), '001')
  assert.equal(formatArticleIndex(999), '999')
  assert.equal(formatArticleIndex(1000), '1000')
})
