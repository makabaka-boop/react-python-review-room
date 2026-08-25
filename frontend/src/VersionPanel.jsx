const RISK_LABELS = { low: '低', medium: '中', high: '高', critical: '严重' }
const STATUS_LABELS = { open: '待处理', accepted: '已采纳', rejected: '已驳回', resolved: '已解决' }

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function VersionPanel({ versions, onAddVersion, showAddButton = true }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>
          版本列表（{versions.length}）
        </h3>
        {showAddButton && (
          <button className="btn btn-primary btn-sm" onClick={onAddVersion}>+ 新增版本</button>
        )}
      </div>
      {versions.length === 0 ? (
        <div className="empty-state">
          <div>暂无版本，点击"新增版本"添加</div>
        </div>
      ) : (
        versions.map((v) => (
          <div key={v.id} className="version-item">
            <div className="version-header">
              <span className="version-number">{v.version_number}</span>
              <span className="version-time">{formatTime(v.created_at)}</span>
            </div>
            {v.change_note && (
              <div className="change-note"><strong>变更说明：</strong>{v.change_note}</div>
            )}
            {v.content_summary && (
              <div className="content-summary">{v.content_summary}</div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

export { RISK_LABELS, STATUS_LABELS, formatTime }
