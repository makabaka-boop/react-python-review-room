async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `请求失败（HTTP ${res.status}）`)
  }
  return data
}

export const api = {
  getMeta: () => request('/meta'),
  getMaterials: () => request('/materials'),
  getMaterial: (id) => request(`/materials/${id}`),
  createMaterial: (body) =>
    request('/materials', { method: 'POST', body: JSON.stringify(body) }),
  createVersion: (materialId, body) =>
    request(`/materials/${materialId}/versions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createComment: (versionId, body) =>
    request(`/versions/${versionId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateComment: (commentId, body) =>
    request(`/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  getTimeline: (materialId) => request(`/materials/${materialId}/timeline`),
  getAudit: (materialId) => request(`/audit?material_id=${materialId}`),
  getRiskSummary: (materialId) =>
    request(`/risk-summary${materialId ? `?material_id=${materialId}` : ''}`),
}

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical']
export const RISK_LABELS = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重',
}
export const COMMENT_STATUSES = ['open', 'accepted', 'rejected', 'resolved']
export const STATUS_LABELS = {
  open: '待处理',
  accepted: '已采纳',
  rejected: '已驳回',
  resolved: '已解决',
}
export const ACTION_LABELS = {
  submit: '提交评论',
  accept: '采纳意见',
  reject: '驳回意见',
  resolve: '标记解决',
  reopen: '重新打开',
  status_change: '状态变更',
}
export const EVENT_LABELS = {
  material_created: '材料创建',
  version_created: '版本新增',
  comment_created: '评论提交',
  comment_status_changed: '评论状态变更',
}

export function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
