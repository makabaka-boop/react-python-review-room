import { useState } from 'react'
import { api } from './api'

const RISK_LEVELS = ['low', 'medium', 'high', 'critical']
const RISK_LABELS = { low: '低', medium: '中', high: '高', critical: '严重' }

export default function CommentForm({ materialId, versions, onCreated, onClose }) {
  const [form, setForm] = useState({
    version_id: versions.length > 0 ? versions[0].id : '',
    commenter: '',
    location_desc: '',
    content: '',
    risk_level: 'low',
    status: 'open',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.commenter.trim()) {
      setError('评论人为必填项')
      return
    }
    if (!form.content.trim()) {
      setError('评论内容为必填项')
      return
    }
    setLoading(true)
    try {
      const c = await api.createComment({
        material_id: materialId,
        version_id: form.version_id || null,
        commenter: form.commenter,
        location_desc: form.location_desc,
        content: form.content,
        risk_level: form.risk_level,
        status: form.status,
        actor: form.commenter,
      })
      onCreated(c)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>添加评论</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-msg">{error}</div>}
            <div className="form-row">
              <div className="form-group">
                <label>绑定版本</label>
                <select
                  value={form.version_id}
                  onChange={(e) => setForm({ ...form, version_id: e.target.value })}
                >
                  <option value="">不绑定特定版本</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>{v.version_number}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>风险级别</label>
                <select
                  value={form.risk_level}
                  onChange={(e) => setForm({ ...form, risk_level: e.target.value })}
                >
                  {RISK_LEVELS.map((r) => (
                    <option key={r} value={r}>{RISK_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>评论人 *</label>
              <input
                value={form.commenter}
                onChange={(e) => setForm({ ...form, commenter: e.target.value })}
                placeholder="您的姓名"
              />
            </div>
            <div className="form-group">
              <label>位置描述</label>
              <input
                value={form.location_desc}
                onChange={(e) => setForm({ ...form, location_desc: e.target.value })}
                placeholder="例如：第3章第2节、第15页表格"
              />
            </div>
            <div className="form-group">
              <label>评论内容 *</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="请输入您的评审意见"
                rows={5}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '提交中...' : '提交评论'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
