const PUBLISHED_AT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|([+-])(\d{2}):(\d{2}))$/

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function parsePublishedAt(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('publishedAt must be a non-empty string')

  const match = value.match(PUBLISHED_AT_PATTERN)
  if (!match) {
    throw new Error('publishedAt must use YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DDTHH:mm:ss±HH:MM')
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , offsetHourText, offsetMinuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText)
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText)

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error('publishedAt must contain a valid calendar date')
  }
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error('publishedAt must contain a valid time')
  }
  if (offsetHour > 23 || offsetMinute > 59) {
    throw new Error('publishedAt must contain a valid UTC offset')
  }

  const publishedAtMs = Date.parse(value)
  if (!Number.isFinite(publishedAtMs)) throw new Error('publishedAt must represent a valid instant')

  return {
    publishedAt: value,
    publishedAtMs,
    publishedDate: `${yearText}-${monthText}-${dayText}`,
  }
}

export function formatArticleIndex(position) {
  if (!Number.isSafeInteger(position) || position < 1) throw new Error('article index position must be a positive integer')
  return String(position).padStart(3, '0')
}

export function preparePublishedPosts(posts) {
  const publishedPosts = posts.filter((post) => post.draft !== true)
  const postsByInstant = new Map()

  for (const post of publishedPosts) {
    const existing = postsByInstant.get(post.publishedAtMs)
    if (existing) {
      throw new Error(`${post.source} and ${existing.source}: publishedAt values must represent unique instants`)
    }
    postsByInstant.set(post.publishedAtMs, post)
  }

  return publishedPosts
    .slice()
    .sort((left, right) => left.publishedAtMs - right.publishedAtMs)
    .map((post, position) => ({ ...post, index: formatArticleIndex(position + 1) }))
    .reverse()
}
