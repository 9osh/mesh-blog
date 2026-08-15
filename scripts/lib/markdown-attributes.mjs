const attributeName = /^[a-z][a-z0-9-]*/
const positiveInteger = /^[1-9]\d*$/
const explicitScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/
const unsafeUrlCharacter = /[\u0000-\u0020\u007f\\]/

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseQuotedAttributes(source, component) {
  const input = source.trim()
  if (!input.startsWith('{') || !input.endsWith('}')) {
    throw new Error(`${component} attributes must be enclosed in braces`)
  }

  const values = Object.create(null)
  let index = 1
  const end = input.length - 1
  while (index < end) {
    while (index < end && /\s/.test(input[index])) index += 1
    if (index >= end) break

    const match = input.slice(index, end).match(attributeName)
    if (!match) throw new Error(`${component} attributes contain an invalid attribute name`)
    const name = match[0]
    index += name.length
    while (index < end && /\s/.test(input[index])) index += 1
    if (input[index] !== '=') throw new Error(`${component} attribute "${name}" must use = followed by a double-quoted value`)
    index += 1
    while (index < end && /\s/.test(input[index])) index += 1
    if (input[index] !== '"') throw new Error(`${component} attribute "${name}" must use a double-quoted value`)
    index += 1

    let value = ''
    let closed = false
    while (index < end) {
      const character = input[index]
      if (character === '"') {
        index += 1
        closed = true
        break
      }
      if (character === '\\') {
        const escaped = input[index + 1]
        if (escaped !== '"' && escaped !== '\\') {
          throw new Error(`${component} attribute "${name}" contains an invalid escape sequence`)
        }
        value += escaped
        index += 2
        continue
      }
      value += character
      index += 1
    }
    if (!closed) throw new Error(`${component} attributes contain an unclosed quoted value`)
    if (index < end && !/\s/.test(input[index])) throw new Error(`${component} attributes must be separated by whitespace`)
    if (Object.hasOwn(values, name)) throw new Error(`${component} attribute "${name}" is duplicated`)
    values[name] = value
  }

  return values
}

function validateUrl(value, component, name) {
  if (!value || value !== value.trim() || unsafeUrlCharacter.test(value) || value.startsWith('//')) {
    throw new Error(`${component} "${name}" must use a relative, root-relative, http, or https URL`)
  }
  if (explicitScheme.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error(`${component} "${name}" must use a relative, root-relative, http, or https URL`)
  }
  if (/^https?:\/\//i.test(value)) {
    let parsed
    try {
      parsed = new URL(value)
    } catch {
      throw new Error(`${component} "${name}" must use a valid http or https URL`)
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`${component} "${name}" must use a relative, root-relative, http, or https URL`)
    }
  }
}

function validateSrcset(value, component) {
  const candidates = value.split(',').map((candidate) => candidate.trim())
  if (!value || candidates.some((candidate) => !candidate)) throw new Error(`${component} "srcset" must contain valid image candidates`)
  for (const candidate of candidates) {
    const match = candidate.match(/^(\S+)(?:\s+(\d+w|(?:\d+(?:\.\d+)?|\.\d+)x))?$/)
    if (!match) throw new Error(`${component} "srcset" must contain valid image candidates`)
    try {
      validateUrl(match[1], component, 'srcset')
    } catch {
      throw new Error(`${component} "srcset" contains a URL that must use a relative, root-relative, http, or https URL`)
    }
  }
}

export function parseMarkdownAttributes(source, options) {
  const {
    component,
    allowed,
    required = [],
    nonEmpty = [],
    positiveIntegers = [],
    enums = {},
    urls = [],
    srcset = false,
    defaults = {},
  } = options
  const values = parseQuotedAttributes(source, component)

  for (const name of Object.keys(values)) {
    if (!allowed.includes(name)) throw new Error(`${component} attribute "${name}" is not allowed`)
  }
  for (const name of required) {
    if (!Object.hasOwn(values, name)) throw new Error(`${component} requires "${name}"`)
  }
  for (const name of nonEmpty) {
    if (Object.hasOwn(values, name) && !values[name].trim()) throw new Error(`${component} "${name}" must not be empty`)
  }
  for (const name of positiveIntegers) {
    if (Object.hasOwn(values, name) && !positiveInteger.test(values[name])) {
      throw new Error(`${component} "${name}" must be a positive integer`)
    }
  }
  for (const [name, choices] of Object.entries(enums)) {
    if (Object.hasOwn(values, name) && !choices.includes(values[name])) {
      throw new Error(`${component} "${name}" must be one of: ${choices.join(', ')}`)
    }
  }
  for (const name of urls) {
    if (Object.hasOwn(values, name)) validateUrl(values[name], component, name)
  }
  if (srcset && Object.hasOwn(values, 'srcset')) validateSrcset(values.srcset, component)

  return { ...defaults, ...values }
}

export function serializeHtmlAttributes(values, names) {
  return names
    .filter((name) => Object.hasOwn(values, name))
    .map((name) => `${name}="${escapeAttribute(values[name])}"`)
    .join(' ')
}

export function escapeHtmlText(value) {
  return escapeAttribute(value)
}
