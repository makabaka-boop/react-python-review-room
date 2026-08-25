import { useState } from 'react'
import { api } from './api'

const ACTIONS = [
  'review_started',
  'review_passed',
  'review_rejected',
  'revision_requested',
  'revision_submitted',
  'comment_resolved',
  'escalated',
  'closed',
  'other',
]

const ACTION_LABELS = {
  review_started: '开始评审',
  review_passed: '评审通过',
  review_rejected: '评审驳回',
  revision_requested: '要求修订',
  revision_submitted: '提交修订',
  comment_resolved: '评论已解决',
  escalated: '升级处理',
  closed: '关闭材料',
  other: '其他',
}

export default function RecordForm({ materialId, comments, onCreated, onClose }) {
  const [form, setForm] = useState({
    action: 'review_started',
    actor: '',
    note: '',
    comment_id: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.actor.trim()) {
      setError('处理人为必填项')
      return
    }
    setLoading(true)
    try {
      const r = await api.createRecord(materialId, {
        action: form.action,
        actor: form.actor,
        note: form.note,
        comment_id: form.comment_id || null,
      })
      onCreated(r)
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
          <h3>添加处理记录</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-msg">{error}</div>}
            <div className="form-row">
              <div className="form-group">
                <label>处理动作</label>
                <select
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value })}
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>处理人 *</label>
                <input
                  value={form.actor}
                  onChange={(e) => setForm({ ...form, actor: e.target.value })}
                  placeholder="您的姓名"
                />
              </div>
            </div>
            {comments.length > 0 && (
              <div className="form-group">
                <label>关联评论（可选）</label>
                <select
                  value={form.comment_id}
                  onChange={(e) => setForm({ ...form, comment_id: e.target.value })}
                >
                  <option value="">不关联特定评论</option>
                  {comments.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.id} - {c.commenter}: {c.content.substring(0, 40)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>处理说明</label>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="处理结论或备注"
                rows={4}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '提交中...' : '添加记录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
