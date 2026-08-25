import { useState } from 'react'
import { api } from './api'

const MATERIAL_TYPES = ['需求文档', '设计方案', '技术规范', '测试报告', '会议纪要', '其他']

export default function CreateMaterialForm({ onCreated, onClose }) {
  const [form, setForm] = useState({
    title: '',
    source_team: '',
    material_type: MATERIAL_TYPES[0],
    summary: '',
    actor: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.title.trim() || !form.source_team.trim()) {
      setError('标题和来源团队为必填项')
      return
    }
    setLoading(true)
    try {
      const created = await api.createMaterial(form)
      onCreated(created)
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
          <h3>创建新材料</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-msg">{error}</div>}
            <div className="form-group">
              <label>标题 *</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="材料标题"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>来源团队 *</label>
                <input
                  value={form.source_team}
                  onChange={(e) => setForm({ ...form, source_team: e.target.value })}
                  placeholder="团队名称"
                />
              </div>
              <div className="form-group">
                <label>材料类型</label>
                <select
                  value={form.material_type}
                  onChange={(e) => setForm({ ...form, material_type: e.target.value })}
                >
                  {MATERIAL_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>摘要</label>
              <textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="材料内容摘要"
                rows={4}
              />
            </div>
            <div className="form-group">
              <label>创建人</label>
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
              {loading ? '创建中...' : '创建材料'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
