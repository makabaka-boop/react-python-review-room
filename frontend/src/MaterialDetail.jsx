import { useState, useEffect, useCallback } from 'react'
import { api } from './api'
import VersionPanel, { RISK_LABELS, STATUS_LABELS, formatTime } from './VersionPanel'
import CommentPanel from './CommentPanel'
import Timeline from './Timeline'
import RiskSummary from './RiskSummary'
import AuditPanel from './AuditPanel'
import VersionForm from './VersionForm'
import CommentForm from './CommentForm'
import RecordForm from './RecordForm'

const TABS = [
  { key: 'versions', label: '版本详情' },
  { key: 'comments', label: '评论面板' },
  { key: 'timeline', label: '处理记录' },
  { key: 'audit', label: '审计事件' },
]

export default function MaterialDetail({ materialId, onBack }) {
  const [data, setData] = useState(null)
  const [riskSummary, setRiskSummary] = useState(null)
  const [activeTab, setActiveTab] = useState('versions')
  const [showVersionForm, setShowVersionForm] = useState(false)
  const [showCommentForm, setShowCommentForm] = useState(false)
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!materialId) return
    setLoading(true)
    try {
      const [d, rs] = await Promise.all([
        api.getMaterial(materialId),
        api.riskSummary(materialId),
      ])
      setData(d)
      setRiskSummary(rs)
    } finally {
      setLoading(false)
    }
  }, [materialId])

  useEffect(() => {
    load()
  }, [load])

  if (loading || !data) {
    return (
      <div className="card">
        <div className="empty-state">加载中...</div>
      </div>
    )
  }

  const { material, versions, comments, processing_records } = data

  const refreshComments = async () => {
    const d = await api.getMaterial(materialId)
    setData(d)
    const rs = await api.riskSummary(materialId)
    setRiskSummary(rs)
  }

  return (
    <div className="card">
      <div className="detail-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
              ← 返回列表
            </button>
            <h2>{material.title}</h2>
            <div className="meta-row">
              <span>来源团队: <strong>{material.source_team}</strong></span>
              <span>类型: <strong>{material.material_type}</strong></span>
              <span>版本数: <strong>{versions.length}</strong></span>
              <span>评论数: <strong>{comments.length}</strong></span>
              <span>更新时间: {formatTime(material.updated_at)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowVersionForm(true)}>+ 版本</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCommentForm(true)}>+ 评论</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowRecordForm(true)}>+ 处理记录</button>
          </div>
        </div>
        {material.summary && (
          <div className="summary-text">{material.summary}</div>
        )}
      </div>

      {activeTab === 'comments' && riskSummary && (
        <div style={{ padding: '0 20px 16px' }}>
          <RiskSummary summary={riskSummary} />
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <div
            key={t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </div>
        ))}
      </div>

      <div className="card-body">
        {activeTab === 'versions' && (
          <VersionPanel
            versions={versions}
            onAddVersion={() => setShowVersionForm(true)}
          />
        )}
        {activeTab === 'comments' && (
          <CommentPanel
            materialId={materialId}
            comments={comments}
            versions={versions}
            onCommentAdded={refreshComments}
            onCommentUpdated={refreshComments}
          />
        )}
        {activeTab === 'timeline' && (
          <Timeline
            records={processing_records}
            onAddRecord={() => setShowRecordForm(true)}
          />
        )}
        {activeTab === 'audit' && <AuditPanel materialId={materialId} />}
      </div>

      {showVersionForm && (
        <VersionForm
          materialId={materialId}
          onCreated={() => { setShowVersionForm(false); load() }}
          onClose={() => setShowVersionForm(false)}
        />
      )}
      {showCommentForm && (
        <CommentForm
          materialId={materialId}
          versions={versions}
          onCreated={() => { setShowCommentForm(false); refreshComments() }}
          onClose={() => setShowCommentForm(false)}
        />
      )}
      {showRecordForm && (
        <RecordForm
          materialId={materialId}
          comments={comments}
          onCreated={() => { setShowRecordForm(false); load() }}
          onClose={() => setShowRecordForm(false)}
        />
      )}
    </div>
  )
}
