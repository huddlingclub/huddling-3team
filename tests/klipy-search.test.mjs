import test from 'node:test'
import assert from 'node:assert/strict'
import { searchKlipy } from '../server/klipy-search.js'
import handler from '../api/gifs.js'

const key = 'unit-test-private-secret'
const customer = '12345678-1234-1234-1234-123456789abc'
const gif = 'https://static.klipy.com/test/original.gif'
const webp = 'https://static.klipy.com/test/preview.webp'
const entry = { slug: 'applause', title: '박수', type: 'gif', file: { hd: { gif: { url: gif } }, sm: { webp: { url: webp } } } }
const response = data => ({ ok: true, status: 200, json: async () => ({ result: true, data: { data } }) })

test('forwards Korean search and returns only safe GIF fields', async () => {
  let called
  const result = await searchKlipy('박수', customer, { key, fetcher: async (url, options) => {
    called = url
    assert.equal(options.redirect, 'error')
    return response([{ ...entry, internalSecret: key }])
  } })
  assert.equal(called.origin, 'https://api.klipy.com')
  assert.equal(called.pathname, `/api/v1/${key}/gifs/search`)
  assert.equal(called.searchParams.get('q'), '박수')
  assert.equal(called.searchParams.get('customer_id'), customer)
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.items, [{ id: 'applause', description: '박수', gifUrl: gif, previewUrl: webp }])
  assert.ok(!JSON.stringify(result).includes(key))
})

test('empty query uses trending and genuine empty results stay empty', async () => {
  const result = await searchKlipy('', customer, { key, fetcher: async url => {
    assert.ok(url.pathname.endsWith('/trending'))
    return response([])
  } })
  assert.deepEqual(result, { status: 200, body: { items: [] } })
})

test('missing server key reports setup failure without calling upstream', async () => {
  const result = await searchKlipy('cat', customer, { key: '', fetcher: async () => assert.fail('No upstream call expected') })
  assert.equal(result.status, 503)
})

test('upstream errors, authentication, timeouts and malformed data never expose secrets', async () => {
  for (const fetcher of [
    async () => ({ ok: false, status: 401, json: async () => ({ key }) }),
    async () => { throw new Error(`Failed request to https://api.klipy.com/${key}`) },
    async () => ({ ok: true, status: 200, json: async () => ({ error: key }) }),
  ]) {
    const result = await searchKlipy('cat', customer, { key, fetcher })
    assert.equal(result.status, 502)
    assert.ok(!JSON.stringify(result).includes(key))
  }
  assert.equal((await searchKlipy('cat', customer, { key, fetcher: async () => ({ status: 429 }) })).status, 429)
})

test('allowlists media hosts, strips provider metadata, redacts echoed secret and deduplicates', async () => {
  const entries = [entry, entry,
    { ...entry, slug: 'bad-host', file: { hd: { gif: { url: 'https://attacker.example/image.gif' } } } },
    { ...entry, slug: 'bad-url', file: { hd: { gif: { url: 'invalid' } } } },
    { ...entry, slug: 'echo', title: key, file: { hd: { gif: { url: gif } } } },
    { ...entry, slug: 'secret-url', file: { hd: { gif: { url: `${gif}?key=${key}` } } } },
  ]
  const result = await searchKlipy('cat', customer, { key, fetcher: async () => response(entries) })
  assert.equal(result.body.items.length, 2)
  assert.ok(!JSON.stringify(result).includes(key))
})

async function call(method, url, headers = {}) {
  const result = { headers: {} }
  const res = {
    setHeader: (name, value) => { result.headers[name] = value },
    status: status => { result.status = status; return res },
    json: body => { result.body = body; return result },
  }
  await handler({ method, url, headers }, res)
  return result
}

test('route rejects invalid input, methods and cross-site requests before external calls', async () => {
  assert.equal((await call('POST', '/api/gifs')).status, 405)
  assert.equal((await call('GET', '/api/gifs')).status, 400)
  assert.equal((await call('GET', `/api/gifs?q=${'a'.repeat(101)}&customer_id=${customer}`)).status, 400)
  assert.equal((await call('GET', `/api/gifs?q=a&q=b&customer_id=${customer}`)).status, 400)
  assert.equal((await call('GET', `/api/gifs?q=cat&customer_id=${customer}`, { 'sec-fetch-site': 'cross-site' })).status, 403)
})

test('route uses only the server environment key and does not cache responses', async t => {
  const previous = process.env.KLIPY_API_KEY
  process.env.KLIPY_API_KEY = key
  t.after(() => {
    if (previous === undefined) delete process.env.KLIPY_API_KEY
    else process.env.KLIPY_API_KEY = previous
  })
  t.mock.method(globalThis, 'fetch', async () => response([entry]))
  const result = await call('GET', `/api/gifs?q=cat&customer_id=${customer}`)
  assert.equal(result.status, 200)
  assert.equal(result.headers['Cache-Control'], 'no-store')
  assert.equal(result.body.items.length, 1)
  assert.ok(!JSON.stringify(result).includes(key))
})
