import { useCallback, useEffect, useState } from 'react'
import {
  api,
  RISK_LABELS,
  fmtTime,
} from './api.js'
import MaterialDetail from './MaterialDetail.jsx'

function RiskBadge({ level }) {
  if (!level) return null
  return <span className={`badge risk-${level}`}>{RISK_LABELS[level]}</span>
}

function GlobalSummary({ summary }) {
  if (!summary) return null
  const chips = ['critical', 'high', 'medium', 'low']
    .filter((lvl) => summary.open_by_risk[lvl] > 0)
    .map((lvl) => (
      <span key={lvl} className={`chip risk-${lvl}`}>
        待处理 {RISK_LABELS[lvl]} {summary.open_by_risk[lvl]}
      </span>
    ))
  return (
    <div className="summary-bar">
      <span className="summary-item">
        评论总数 <strong>{summary.total_comments}</strong>
      </span>
      <span className="summary-item">
        未关闭 <strong>{summary.unresolved_count}</strong>
      </span>
      {chips}
    </div>
  )
}

function CreateMaterialForm({ meta, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '',
    source_team: '',
    material_type: meta?.material_types?.[0] || '设计方案',
    summary: '',
    created_by: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const created = await api.createMaterial(form)
      onCreated(created)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>新建评审材料</h3>
          <button className="btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="form-grid">
          <label>
            标题 <span className="req">*</span>
            <input value={form.title} onChange={set('title')} placeholder="例如：支付系统重构技术方案" />
          </label>
          <label>
            来源团队 <span className="req">*</span>
            <input value={form.source_team} onChange={set('source_team')} placeholder="例如：支付平台组" />
          </label>
          <label>
            材料类型 <span className="req">*</span>
            <select value={form.material_type} onChange={set('material_type')}>
              {(meta?.material_types || []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            创建人
            <input value={form.created_by} onChange={set('created_by')} placeholder="提交材料的同学" />
          </label>
          <label className="full">
            摘要
            <textarea rows={3} value={form.summary} onChange={set('summary')} placeholder="材料背景、范围与核心结论概述" />
          </label>
          {error && <div className="form-error full">{error}</div>}
          <div className="form-actions full">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '提交中…' : '创建材料'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [materials, setMaterials] = useState([])
  const [summary, setSummary] = useState(null)
  const [meta, setMeta] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ms, sum] = await Promise.all([
        api.getMaterials(),
        api.getRiskSummary(),
      ])
      setMaterials(ms)
      setSummary(sum)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    api.getMeta().then(setMeta).catch(() => {})
    load()
  }, [load])

  if (selectedId) {
    return (
      <MaterialDetail
        materialId={selectedId}
        onBack={() => {
          setSelectedId(null)
          load()
        }}
      />
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-logo">📝</span>
            <div>
              <h1>评审材料协作室</h1>
              <p>材料 · 版本 · 评论 · 处理结论 一体化评审</p>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + 新建材料
          </button>
        </div>
      </header>

      <main className="container">
        <GlobalSummary summary={summary} />

        {error && <div className="alert">{error}（请确认后端已在 18131 端口启动）</div>}
        {loading && <div className="empty">加载中…</div>}
        {!loading && !error && materials.length === 0 && (
          <div className="empty">还没有评审材料，点击右上角「新建材料」开始。</div>
        )}

        <div className="material-grid">
          {materials.map((m) => (
            <div
              key={m.id}
              className="card material-card"
              onClick={() => setSelectedId(m.id)}
            >
              <div className="material-card-head">
                <span className="badge type-badge">{m.material_type}</span>
                <RiskBadge level={m.top_risk} />
              </div>
              <h3 className="material-title">{m.title}</h3>
              <p className="material-summary">{m.summary || '（暂无摘要）'}</p>
              <div className="material-meta">
                <span>🏷️ {m.source_team}</span>
                <span>👤 {m.created_by}</span>
                <span>🕒 {fmtTime(m.updated_at)}</span>
              </div>
              <div className="material-stats">
                <span className="stat">
          版本 <strong>{m.version_count}</strong>
                </span>
                <span className="stat">
          评论 <strong>{m.comment_count}</strong>
                </span>
                <span className={`stat ${m.open_comment_count > 0 ? 'stat-open' : ''}`}>
          待处理 <strong>{m.open_comment_count}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {showCreate && (
        <CreateMaterialForm
          meta={meta}
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setShowCreate(false)
            setSelectedId(created.id)
          }}
        />
      )}
    </div>
  )
}
