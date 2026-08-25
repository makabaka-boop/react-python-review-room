import { formatTime } from './VersionPanel'

const ACTION_LABELS = {
  comment_created: '创建评论',
  comment_updated: '更新评论',
  review_started: '开始评审',
  review_passed: '评审通过',
  review_rejected: '评审驳回',
  revision_requested: '要求修订',
  revision_submitted: '提交修订',
  comment_resolved: '评论已解决',
  escalated: '升级处理',
  closed: '关闭材料',
  other: '其他操作',
}

export default function Timeline({ records, onAddRecord, showAddButton = true }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>
          处理记录时间线（{records.length}）
        </h3>
        {showAddButton && (
          <button className="btn btn-primary btn-sm" onClick={onAddRecord}>+ 添加记录</button>
        )}
      </div>
      {records.length === 0 ? (
        <div className="empty-state">
          <div>暂无处理记录</div>
        </div>
      ) : (
        <div className="timeline">
          {records.map((r) => (
            <div key={r.id} className="timeline-item">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="action">{ACTION_LABELS[r.action] || r.action}</span>
                <span className="time">{formatTime(r.created_at)}</span>
              </div>
              <div className="actor">处理人: {r.actor}</div>
              {r.note && <div className="note">{r.note}</div>}
              {r.comment_id && (
                <div className="actor" style={{ fontSize: 11 }}>关联评论: #{r.comment_id}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
