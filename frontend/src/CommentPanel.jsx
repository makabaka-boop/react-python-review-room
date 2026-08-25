import { useState } from 'react'
import { api } from './api'
import { RISK_LABELS, STATUS_LABELS, formatTime } from './VersionPanel'

const STATUS_OPTIONS = ['open', 'accepted', 'rejected', 'resolved']

export default function CommentPanel({ materialId, comments, versions, onCommentAdded, onCommentUpdated }) {
  const [filterRisk, setFilterRisk] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const filtered = comments.filter((c) => {
    if (filterRisk && c.risk_level !== filterRisk) return false
    if (filterStatus && c.status !== filterStatus) return false
    return true
  })

  const startEdit = (c) => {
    setEditingId(c.id)
    setEditForm({ status: c.status, risk_level: c.risk_level, actor: '' })
  }

  const saveEdit = async (cid) => {
    try {
      const updated = await api.updateComment(cid, editForm)
      onCommentUpdated(updated)
      setEditingId(null)
    } catch (err) {
      alert(err.message)
    }
  }

  const getVersionNumber = (vid) => {
    if (!vid) return ''
    const v = versions.find((x) => x.id === vid)
    return v ? v.version_number : ''
  }

  return (
    <div>
      <div className="filter-bar">
        <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}>
          <option value="">全部风险级别</option>
          <option value="low">低风险</option>
          <option value="medium">中风险</option>
          <option value="high">高风险</option>
          <option value="critical">严重</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">全部状态</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <span style={{ fontSize: '13px', color: '#6b7280' }}>
          共 {filtered.length} 条
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div>暂无评论</div>
        </div>
      ) : (
        filtered.map((c) => (
          <div key={c.id} className="comment-item">
            <div className="comment-header">
              <div>
                <span className="commenter">{c.commenter}</span>
                {c.version_id && (
                  <span className="comment-location" style={{ marginLeft: 8 }}>
                    版本: {getVersionNumber(c.version_id)}
                  </span>
                )}
              </div>
              <div className="badges">
                <span className={`badge badge-risk-${c.risk_level}`}>{RISK_LABELS[c.risk_level]}</span>
                <span className={`badge badge-status-${c.status}`}>{STATUS_LABELS[c.status]}</span>
              </div>
            </div>
            {c.location_desc && (
              <div className="comment-location">位置: {c.location_desc}</div>
            )}
            <div className="comment-content">{c.content}</div>
            <div className="comment-meta">{formatTime(c.created_at)}</div>

            {editingId === c.id ? (
              <div style={{ background: '#f9fafb', padding: 10, borderRadius: 6, marginTop: 8 }}>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label>状态</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label>风险级别</label>
                    <select
                      value={editForm.risk_level}
                      onChange={(e) => setEditForm({ ...editForm, risk_level: e.target.value })}
                    >
                      {Object.entries(RISK_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>处理人</label>
                  <input
                    value={editForm.actor}
                    onChange={(e) => setEditForm({ ...editForm, actor: e.target.value })}
                    placeholder="您的姓名"
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => saveEdit(c.id)}>保存</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>取消</button>
                </div>
              </div>
            ) : (
              <div className="comment-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => startEdit(c)}>更新状态/风险</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
