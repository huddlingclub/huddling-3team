import { searchKlipy } from '../server/klipy-search.js'

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: '지원하지 않는 요청이에요.' })
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') {
    return response.status(403).json({ error: '짤깍 웹에서 검색해 주세요.' })
  }
  const params = new URL(request.url, 'https://huddling-3team.vercel.app').searchParams
  const query = (params.get('q') ?? '').trim()
  const customerId = params.get('customer_id') ?? ''
  if (query.length > 100 || /[\u0000-\u001f]/.test(query) || !/^[a-f\d-]{36}$/i.test(customerId) ||
      params.getAll('q').length > 1 || params.getAll('customer_id').length !== 1) {
    return response.status(400).json({ error: '검색어를 확인해 주세요.' })
  }
  const result = await searchKlipy(query, customerId, { key: process.env.KLIPY_API_KEY })
  return response.status(result.status).json(result.body)
}
