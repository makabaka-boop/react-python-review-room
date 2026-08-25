import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  RISK_LEVELS,
  RISK_LABELS,
  COMMENT_STATUSES,
  STATUS_LABELS,
  ACTION_LABELS,
  EVENT_LABELS,
  fmtTime,
} from './api.js'

function RiskBadge({ level }) {
  if (!level) return null
  return <span className={`badge risk-${level}`}>{RISK_LABELS[level]}</span>
}

function StatusPill({ status }) {
  return <span className={`pill status-${status}`}>{STATUS_LABELS[status]}</span>
}

function VersionForm({ materialId, onDone, onCancel }) {
  const [form, setForm] = useState({
    version_no: '',
    change_note: '',
    body_summary: '',
    created_by: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const v = await api.createVersion(materialId, form)
      onDone(v)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="version-form" onSubmit={submit}>
      <h4>新增版本</h4>
      <input value={form.version_no} onChange={set('version_no')} placeholder="版本号（留空自动编号，如 v2.0）" />
      <input value={form.change_note} onChange={set('change_note')} placeholder="变更说明（本版改了什么）" />
      <textarea rows={4} value={form.body_summary} onChange={set('body_summary')} placeholder="正文摘要 *" />
      <input value={form.created_by} onChange={set('created_by')} placeholder="提交人" />
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '提交中…' : '保存版本'}
        </button>
      </div>
    </form>
  )
}

function CommentForm({ versionId, onDone, onCancel }) {
  const [form, setForm] = useState({
    reviewer: '',
    location_desc: '',
    risk_level: 'medium',
    content: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.createComment(versionId, form)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="comment-form" onSubmit={submit}>
      <h4>发表评论</h4>
      <div className="form-row-2">
        <input value={form.reviewer} onChange={set('reviewer')} placeholder="评论人 *" />
        <input value={form.location_desc} onChange={set('location_desc')} placeholder="位置描述（如 第3章 服务拆分）" />
      </div>
      <div className="form-row-2">
        <select value={form.risk_level} onChange={set('risk_level')}>
          {RISK_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              风险级别：{RISK_LABELS[lvl]}
            </option>
          ))}
        </select>
      </div>
      <textarea rows={3} value={form.content} onChange={set('content')} placeholder="评论内容 *（问题描述、依据与建议）" />
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '提交中…' : '提交评论'}
        </button>
      </div>
    </form>
  )
}

const STATUS_ACTIONS = {
  open: [
    { to: 'accepted', label: '采纳', cls: 'btn-success' },
    { to: 'rejected', label: '驳回', cls: 'btn-danger' },
    { to: 'resolved', label: '直接解决', cls: '' },
  ],
  accepted: [
    { to: 'resolved', label: '标记解决', cls: 'btn-success' },
    { to: 'open', label: '重新讨论', cls: '' },
  ],
  rejected: [
    { to: 'open', label: '重新讨论', cls: '' },
    { to: 'resolved', label: '标记解决', cls: 'btn-success' },
  ],
  resolved: [{ to: 'open', label: '重新打开', cls: '' }],
}

function CommentCard({ comment, actor, note, onNote, onAction, busy }) {
  return (
    <div className={`comment-card status-${comment.status}`}>
      <div className="comment-head">
        <div className="comment-id">
          <strong>{comment.reviewer}</strong>
          {comment.location_desc && <span className="comment-loc">📍 {comment.location_desc}</span>}
        </div>
        <div className="comment-badges">
          <RiskBadge level={comment.risk_level} />
          <StatusPill status={comment.status} />
        </div>
      </div>
      <p className="comment-content">{comment.content}</p>
      <div className="comment-foot">
        <span className="comment-time">{fmtTime(comment.created_at)}</span>
        <div className="comment-actions">
          <input
            className="note-input"
            value={note}
            onChange={(e) => onNote(comment.id, e.target.value)}
            placeholder="处理说明（可选，记入处理记录）"
            disabled={comment.status === 'resolved' && false}
          />
          {STATUS_ACTIONS[comment.status]?.map((a) => (
            <button
              key={a.to}
              className={`btn btn-sm ${a.cls}`}
              disabled={busy}
              onClick={() => onAction(comment.id, a.to)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MaterialDetail({ materialId, onBack }) {
  const [detail, setDetail] = useState(null)
  const [summary, setSummary] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [audit, setAudit] = useState([])
  const [tab, setTab] = useState('comments')
  const [selectedVersionId, setSelectedVersionId] = useState(null)
  const [riskFilter, setRiskFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showVersionForm, setShowVersionForm] = useState(false)
  const [showCommentForm, setShowCommentForm] = useState(false)
  const [actor, setActor] = useState(() => localStorage.getItem('review_actor') || '评审负责人')
  const [notes, setNotes] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [d, s, t, a] = await Promise.all([
      api.getMaterial(materialId),
      api.getRiskSummary(materialId),
      api.getTimeline(materialId),
      api.getAudit(materialId),
    ])
    setDetail(d)
    setSummary(s)
    setTimeline(t)
    setAudit(a)
    setSelectedVersionId((cur) =>
      cur === null && d.versions.length ? d.versions[d.versions.length - 1].id : cur,
    )
  }, [materialId])

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [load])

  const versions = detail?.versions || []
  const selectedVersion = versions.find((v) => v.id === selectedVersionId) || null

  const visibleComments = useMemo(() => {
    const list = (detail?.comments || []).filter(
      (c) => c.version_id === selectedVersionId,
    )
    return list.filter(
      (c) =>
        (riskFilter === 'all' || c.risk_level === riskFilter) &&
        (statusFilter === 'all' || c.status === statusFilter),
    )
  }, [detail, selectedVersionId, riskFilter, statusFilter])

  const handleAction = async (commentId, toStatus) => {
    setBusy(true)
    setError('')
    try {
      await api.updateComment(commentId, {
        status: toStatus,
        operator: actor,
        note: notes[commentId] || '',
      })
      setNotes((prev) => ({ ...prev, [commentId]: '' }))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleActorChange = (e) => {
    const v = e.target.value
    setActor(v)
    localStorage.setItem('review_actor', v)
  }

  if (!detail) {
    return (
      <div className="page">
        <div className="container">
          {error ? <div className="alert">{error}</div> : <div className="empty">加载中…</div>}
          <button className="btn" onClick={onBack}>
            ← 返回列表
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <button className="btn-ghost back-btn" onClick={onBack}>
              ← 材料列表
            </button>
            <div>
              <h1>{detail.title}</h1>
              <p>
                <span className="badge type-badge">{detail.material_type}</span>
                <span className="meta-inline">🏷️ {detail.source_team}</span>
                <span className="meta-inline">👤 {detail.created_by}</span>
                <span className="meta-inline">🕒 {fmtTime(detail.created_at)}</span>
              </p>
            </div>
          </div>
          <div className="actor-box">
            <label>
              当前处理人
              <input value={actor} onChange={handleActorChange} />
            </label>
          </div>
        </div>
      </header>

      <main className="container detail-container">
        <p className="material-detail-summary">{detail.summary}</p>

        {summary && (
          <div className="summary-bar">
            <span className="summary-item">
              版本 <strong>{detail.version_count}</strong>
            </span>
            <span className="summary-item">
              评论 <strong>{summary.total_comments}</strong>
            </span>
            <span className="summary-item">
              未关闭 <strong>{summary.unresolved_count}</strong>
            </span>
            {RISK_LEVELS.filter((lvl) => summary.open_by_risk[lvl] > 0).map((lvl) => (
              <span key={lvl} className={`chip risk-${lvl}`}>
                待处理{RISK_LABELS[lvl]} {summary.open_by_risk[lvl]}
              </span>
            ))}
            {summary.total_comments > 0 && summary.unresolved_count === 0 && (
              <span className="chip chip-done">✅ 全部评论已关闭</span>
            )}
          </div>
        )}

        {error && <div className="alert">{error}</div>}

        <nav className="tabs">
          <button className={tab === 'comments' ? 'tab active' : 'tab'} onClick={() => setTab('comments')}>
            版本与评论
          </button>
          <button className={tab === 'timeline' ? 'tab active' : 'tab'} onClick={() => setTab('timeline')}>
            处理记录时间线
            <span className="tab-count">{timeline.length}</span>
          </button>
          <button className={tab === 'audit' ? 'tab active' : 'tab'} onClick={() => setTab('audit')}>
            审计日志
            <span className="tab-count">{audit.length}</span>
          </button>
        </nav>

        {tab === 'comments' && (
          <div className="detail-grid">
            <aside className="version-sidebar">
              <div className="sidebar-head">
                <h3>版本列表</h3>
                <button className="btn btn-sm btn-primary" onClick={() => setShowVersionForm((v) => !v)}>
                  + 新版本
                </button>
              </div>
              {showVersionForm && (
                <VersionForm
                  materialId={materialId}
                  onCancel={() => setShowVersionForm(false)}
                  onDone={async (v) => {
                    setShowVersionForm(false)
                    await load()
                    setSelectedVersionId(v.id)
                  }}
                />
              )}
              <div className="version-list">
                {versions.length === 0 && <div className="empty">暂无版本，请新增第一个版本</div>}
                {versions.map((v, idx) => (
                  <div
                    key={v.id}
                    className={v.id === selectedVersionId ? 'version-item active' : 'version-item'}
                    onClick={() => setSelectedVersionId(v.id)}
                  >
                    <div className="version-item-top">
                      <strong>{v.version_no}</strong>
                      {idx === versions.length - 1 && <span className="badge latest-badge">最新</span>}
                    </div>
                    <div className="version-item-note">{v.change_note || '（无变更说明）'}</div>
                    <div className="version-item-meta">
                      <span>💬 {v.comment_count}</span>
                      {v.open_comment_count > 0 && (
                        <span className="stat-open">待处理 {v.open_comment_count}</span>
                      )}
                      {(v.critical_count > 0 || v.high_count > 0) && (
                        <span className="risk-dots">
                          {v.critical_count > 0 && <i className="dot risk-critical" title={`严重 ${v.critical_count}`} />}
                          {v.high_count > 0 && <i className="dot risk-high" title={`高风险 ${v.high_count}`} />}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <section className="version-main">
              {!selectedVersion ? (
                <div className="empty">请先在左侧新增一个版本</div>
              ) : (
                <>
                  <div className="card version-card">
                    <div className="version-card-head">
                      <h3>
                        版本 {selectedVersion.version_no}
                        <span className="meta-inline">👤 {selectedVersion.created_by}</span>
                        <span className="meta-inline">🕒 {fmtTime(selectedVersion.created_at)}</span>
                      </h3>
                    </div>
                    {selectedVersion.change_note && (
                      <p className="change-note">📋 变更说明：{selectedVersion.change_note}</p>
                    )}
                    <p className="body-summary">{selectedVersion.body_summary}</p>
                  </div>

                  <div className="comment-panel">
                    <div className="panel-head">
                      <h3>
                        评论面板
                        <span className="panel-sub">
                          （绑定 {selectedVersion.version_no}，共 {visibleComments.length} 条显示）
                        </span>
                      </h3>
                      <button className="btn btn-sm btn-primary" onClick={() => setShowCommentForm((v) => !v)}>
                        + 发表评论
                      </button>
                    </div>

                    {showCommentForm && (
                      <CommentForm
                        versionId={selectedVersion.id}
                        onCancel={() => setShowCommentForm(false)}
                        onDone={async () => {
                          setShowCommentForm(false)
                          await load()
                        }}
                      />
                    )}

                    <div className="filter-bar">
                      <span className="filter-label">风险筛选：</span>
                      <button
                        className={riskFilter === 'all' ? 'filter-chip active' : 'filter-chip'}
                        onClick={() => setRiskFilter('all')}
                      >
                        全部
                      </button>
                      {RISK_LEVELS.map((lvl) => (
                        <button
                          key={lvl}
                          className={riskFilter === lvl ? `filter-chip active risk-${lvl}` : `filter-chip risk-${lvl}`}
                          onClick={() => setRiskFilter(lvl)}
                        >
                          {RISK_LABELS[lvl]}
                        </button>
                      ))}
                      <span className="filter-label filter-gap">状态：</span>
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">全部状态</option>
                        {COMMENT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {visibleComments.length === 0 && (
                      <div className="empty">该筛选条件下暂无评论</div>
                    )}
                    {visibleComments.map((c) => (
                      <CommentCard
                        key={c.id}
                        comment={c}
                        actor={actor}
                        note={notes[c.id] || ''}
                        onNote={(id, val) => setNotes((prev) => ({ ...prev, [id]: val }))}
                        onAction={handleAction}
                        busy={busy}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {tab === 'timeline' && (
          <div className="card timeline-card">
            <h3>处理记录时间线</h3>
            {timeline.length === 0 && <div className="empty">暂无处理记录</div>}
            <ul className="timeline">
              {timeline.map((r) => (
                <li key={r.id} className={`timeline-item action-${r.action}`}>
                  <i className="timeline-dot" />
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <strong>{ACTION_LABELS[r.action] || r.action}</strong>
                      <span className="timeline-operator">{r.operator}</span>
                      <span className="timeline-status">
                        {r.from_status ? `${STATUS_LABELS[r.from_status]} → ` : ''}
                        {STATUS_LABELS[r.to_status]}
                      </span>
                      <span className="timeline-time">{fmtTime(r.created_at)}</span>
                    </div>
                    {r.note && <p className="timeline-note">📝 {r.note}</p>}
                    {r.comment_content && (
                      <div className="timeline-context">
                        <div className="timeline-context-meta">
                          <RiskBadge level={r.risk_level} />
                          <span>{r.version_no}</span>
                          <span>{r.comment_reviewer}</span>
                          {r.location_desc && <span>📍 {r.location_desc}</span>}
                        </div>
                        <p>{r.comment_content}</p>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'audit' && (
          <div className="card audit-card">
            <h3>审计日志</h3>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>事件</th>
                  <th>操作人</th>
                  <th>对象</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{fmtTime(e.created_at)}</td>
                    <td>
                      <span className="badge event-badge">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                    </td>
                    <td>{e.actor}</td>
                    <td className="nowrap">
                      {e.entity_type}#{e.entity_id}
                    </td>
                    <td className="audit-detail">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
