const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  listMaterials: (search = '', risk = '') => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (risk) params.set('risk', risk)
    const qs = params.toString()
    return request(`/materials${qs ? `?${qs}` : ''}`)
  },
  getMaterial: (id) => request(`/materials/${id}`),
  createMaterial: (data) =>
    request('/materials', { method: 'POST', body: JSON.stringify(data) }),
  updateMaterial: (id, data) =>
    request(`/materials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  listVersions: (mid) => request(`/materials/${mid}/versions`),
  createVersion: (mid, data) =>
    request(`/materials/${mid}/versions`, { method: 'POST', body: JSON.stringify(data) }),
  getVersion: (vid) => request(`/versions/${vid}`),

  listComments: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/comments${qs ? `?${qs}` : ''}`)
  },
  createComment: (data) =>
    request('/comments', { method: 'POST', body: JSON.stringify(data) }),
  updateComment: (id, data) =>
    request(`/comments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  listRecords: (mid) => request(`/materials/${mid}/records`),
  createRecord: (mid, data) =>
    request(`/materials/${mid}/records`, { method: 'POST', body: JSON.stringify(data) }),

  listAudit: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/audit${qs ? `?${qs}` : ''}`)
  },

  riskSummary: (materialId) => {
    const qs = materialId ? `?material_id=${materialId}` : ''
    return request(`/risk-summary${qs}`)
  },
}
