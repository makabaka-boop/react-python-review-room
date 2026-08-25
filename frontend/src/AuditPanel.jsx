import { useState, useEffect } from 'react'
import { api } from './api'
import { formatTime } from './VersionPanel'

const ENTITY_LABELS = {
  material: '材料',
  version: '版本',
  comment: '评论',
  record: '处理记录',
}

const ACTION_LABELS = {
  create: '创建',
  update: '更新',
  delete: '删除',
}

export default function AuditPanel({ materialId }) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    loadAudit()
  }, [materialId])

  const loadAudit = async () => {
    try {
      const data = await api.listAudit({ material_id: materialId, limit: 100 })
      setEvents(data)
    } catch {
      setEvents([])
    }
  }

  return (
    <div>
      <h3 className="section-title" style={{ marginTop: 0 }}>审计事件</h3>
      <div className="audit-list">
        {events.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>暂无审计记录</div>
        ) : (
          events.map((e) => (
            <div key={e.id} className="audit-item">
              <div>
                <span className="audit-action">
                  [{ENTITY_LABELS[e.entity_type] || e.entity_type}] {ACTION_LABELS[e.action] || e.action}
                </span>
                {e.actor && <span style={{ marginLeft: 8, color: '#6b7280' }}>by {e.actor}</span>}
              </div>
              {e.detail && <div style={{ color: '#4b5563' }}>{e.detail}</div>}
              <div className="audit-meta">{formatTime(e.created_at)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
