import { useState } from 'react'
import { api } from './api'

export default function VersionForm({ materialId, onCreated, onClose }) {
  const [form, setForm] = useState({
    version_number: '',
    change_note: '',
    content_summary: '',
    actor: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.version_number.trim()) {
      setError('版本号为必填项')
      return
    }
    setLoading(true)
    try {
      const v = await api.createVersion(materialId, form)
      onCreated(v)
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
          <h3>新增版本</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-msg">{error}</div>}
            <div className="form-group">
              <label>版本号 *</label>
              <input
                value={form.version_number}
                onChange={(e) => setForm({ ...form, version_number: e.target.value })}
                placeholder="例如：v1.0、v2.1"
              />
            </div>
            <div className="form-group">
              <label>变更说明</label>
              <textarea
                value={form.change_note}
                onChange={(e) => setForm({ ...form, change_note: e.target.value })}
                placeholder="本次版本的主要变更"
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>正文摘要</label>
              <textarea
                value={form.content_summary}
                onChange={(e) => setForm({ ...form, content_summary: e.target.value })}
                placeholder="版本正文内容摘要"
                rows={5}
              />
            </div>
            <div className="form-group">
              <label>提交人</label>
              <input
                value={form.actor}
                onChange={(e) => setForm({ ...form, actor: e.target.value })}
                placeholder="您的姓名"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '提交中...' : '提交版本'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
