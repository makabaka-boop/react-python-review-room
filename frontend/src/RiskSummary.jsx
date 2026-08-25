import { RISK_LABELS } from './VersionPanel'

export default function RiskSummary({ summary }) {
  if (!summary) return null
  const { by_risk, total_open, total_all } = summary

  return (
    <div>
      <div className="risk-summary">
        {Object.entries(by_risk).map(([level, data]) => (
          <div key={level} className={`risk-card ${level}`}>
            <div className="label">{RISK_LABELS[level]}风险</div>
            <div className="count">{data.total}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              待处理 {data.open}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#4b5563', marginBottom: 4 }}>
        <span>总评论数: <strong>{total_all}</strong></span>
        <span>待处理: <strong style={{ color: '#c53030' }}>{total_open}</strong></span>
        <span>已处理: <strong style={{ color: '#22543d' }}>{total_all - total_open}</strong></span>
      </div>
    </div>
  )
}
