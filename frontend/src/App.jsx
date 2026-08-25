import { useState, useEffect, useCallback } from 'react'
import { api } from './api'
import CreateMaterialForm from './CreateMaterialForm'
import MaterialDetail from './MaterialDetail'
import { RISK_LABELS, formatTime } from './VersionPanel'

export default function App() {
  const [materials, setMaterials] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listMaterials(search, riskFilter)
      setMaterials(data)
    } catch (err) {
      console.error('Failed to load materials:', err)
    } finally {
      setLoading(false)
    }
  }, [search, riskFilter])

  useEffect(() => {
    load()
  }, [load])

  const handleCreated = (m) => {
    setShowCreate(false)
    setSelectedId(m.id)
    load()
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>评审材料协作室</h1>
          <div className="subtitle">材料管理 · 版本控制 · 评论协作 · 风险跟踪</div>
        </div>
        <div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + 创建材料
          </button>
        </div>
      </header>

      <div className="container">
        {selectedId ? (
          <MaterialDetail
            materialId={selectedId}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="layout">
            <div className="card">
              <div className="card-header">
                <h2>材料列表</h2>
                <span style={{ fontSize: 13, color: '#6b7280' }}>
                  共 {materials.length} 份
                </span>
              </div>
              <div className="card-body">
                <div className="search-bar">
                  <input
                    placeholder="搜索标题、团队或类型..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="filter-bar">
                  <select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                  >
                    <option value="">全部风险</option>
                    <option value="low">含低风险评论</option>
                    <option value="medium">含中风险评论</option>
                    <option value="high">含高风险评论</option>
                    <option value="critical">含严重风险评论</option>
                  </select>
                  {(search || riskFilter) && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setSearch(''); setRiskFilter('') }}
                    >
                      清除筛选
                    </button>
                  )}
                </div>
              </div>
              <div className="material-list">
                {loading ? (
                  <div className="empty-state">加载中...</div>
                ) : materials.length === 0 ? (
                  <div className="empty-state">
                    <div className="icon">📋</div>
                    <div>暂无材料</div>
                    <div style={{ fontSize: 13, marginTop: 8 }}>
                      点击右上角"创建材料"开始
                    </div>
                  </div>
                ) : (
                  materials.map((m) => (
                    <div
                      key={m.id}
                      className="material-item"
                      onClick={() => setSelectedId(m.id)}
                    >
                      <div className="title">{m.title}</div>
                      <div className="meta">
                        <span>👥 {m.source_team}</span>
                        <span>📄 {m.material_type}</span>
                        <span>🔖 v{m.version_count}</span>
                        {m.open_comment_count > 0 && (
                          <span style={{ color: '#c53030' }}>
                            💬 {m.open_comment_count} 待处理
                          </span>
                        )}
                      </div>
                      {m.summary && (
                        <div className="summary">{m.summary}</div>
                      )}
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                        更新于 {formatTime(m.updated_at)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>评审概览</h2>
              </div>
              <div className="card-body">
                <div style={{ marginBottom: 20 }}>
                  <h3 className="section-title" style={{ marginTop: 0 }}>使用流程</h3>
                  <div style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.8 }}>
                    <div>1️⃣ <strong>创建材料</strong>：填写标题、来源团队、类型和摘要</div>
                    <div>2️⃣ <strong>新增版本</strong>：为材料添加版本号、变更说明和正文摘要</div>
                    <div>3️⃣ <strong>提交评论</strong>：评论可绑定到特定版本，标注风险级别</div>
                    <div>4️⃣ <strong>处理评论</strong>：将评论状态从 open 更新为 accepted/rejected/resolved</div>
                    <div>5️⃣ <strong>记录处理</strong>：在时间线中记录评审动作和结论</div>
                    <div>6️⃣ <strong>审计追溯</strong>：所有操作均记录在审计事件中</div>
                  </div>
                </div>
                <div>
                  <h3 className="section-title">风险级别说明</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(RISK_LABELS).map(([key, label]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`badge badge-risk-${key}`}>{label}</span>
                        <span style={{ fontSize: 13, color: '#6b7280' }}>
                          {key === 'low' && '建议性意见，不影响核心内容'}
                          {key === 'medium' && '需要关注的问题，建议修订'}
                          {key === 'high' && '重要问题，可能影响评审结论'}
                          {key === 'critical' && '阻断性问题，必须解决'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 20 }}>
                  <h3 className="section-title">评论状态说明</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#4b5563' }}>
                    <div><span className="badge badge-status-open">待处理</span> 新提交的评论，等待响应</div>
                    <div><span className="badge badge-status-accepted">已采纳</span> 评论意见被接受，将进行修订</div>
                    <div><span className="badge badge-status-rejected">已驳回</span> 评论意见不予采纳</div>
                    <div><span className="badge badge-status-resolved">已解决</span> 问题已处理完成</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateMaterialForm
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
