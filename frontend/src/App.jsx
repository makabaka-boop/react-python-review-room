import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

const RISK_LEVELS = ["low", "medium", "high", "critical"];
const STATUSES = ["open", "accepted", "rejected", "resolved"];

const RISK_LABEL = { low: "低", medium: "中", high: "高", critical: "严重" };
const STATUS_LABEL = {
  open: "待处理",
  accepted: "已接受",
  rejected: "已拒绝",
  resolved: "已解决",
};

export default function App() {
  const [materials, setMaterials] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const reloadMaterials = useCallback(() => {
    api
      .listMaterials()
      .then(setMaterials)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(reloadMaterials, [reloadMaterials, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const openMaterial = (id) => {
    setError("");
    api
      .getMaterial(id)
      .then((m) => {
        setSelectedMaterial(m);
        setSelectedVersion(null);
      })
      .catch((e) => setError(e.message));
  };

  const openVersion = (id) => {
    setError("");
    api
      .getVersion(id)
      .then(setSelectedVersion)
      .catch((e) => setError(e.message));
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>材料评审室</h1>
        <p>材料 · 版本 · 评论 · 处理记录 · 审计</p>
      </header>
      {error && (
        <div className="error-banner" onClick={() => setError("")}>
          {error}（点击关闭）
        </div>
      )}
      <main className="layout">
        <section className="panel">
          <MaterialList
            materials={materials}
            selectedId={selectedMaterial?.id}
            onSelect={openMaterial}
          />
          <CreateMaterialForm
            onCreated={(m) => {
              refresh();
              openMaterial(m.id);
            }}
            onError={setError}
          />
        </section>

        <section className="panel">
          {selectedMaterial ? (
            <MaterialDetail
              material={selectedMaterial}
              selectedVersionId={selectedVersion?.id}
              onSelectVersion={openVersion}
              onVersionCreated={(v) => {
                openMaterial(selectedMaterial.id);
                openVersion(v.id);
              }}
              onError={setError}
            />
          ) : (
            <Empty text="请选择左侧材料查看版本详情" />
          )}
        </section>

        <section className="panel">
          {selectedVersion ? (
            <CommentsPanel
              version={selectedVersion}
              onChanged={() => {
                openVersion(selectedVersion.id);
                refresh();
              }}
              onError={setError}
            />
          ) : (
            <Empty text="请选择版本查看评论" />
          )}
        </section>

        <section className="panel">
          {selectedMaterial ? (
            <>
              <RiskSummary materialId={selectedMaterial.id} refreshKey={refreshKey} />
              <DispositionTimeline
                materialId={selectedMaterial.id}
                refreshKey={refreshKey}
              />
            </>
          ) : (
            <Empty text="选择材料后显示风险摘要与处理记录时间线" />
          )}
        </section>
      </main>
    </div>
  );
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

/* ---------- 材料列表与创建 ---------- */

function MaterialList({ materials, selectedId, onSelect }) {
  return (
    <div>
      <h2>材料列表</h2>
      {materials.length === 0 && <Empty text="暂无材料，请在下方创建" />}
      <ul className="item-list">
        {materials.map((m) => (
          <li
            key={m.id}
            className={m.id === selectedId ? "item selected" : "item"}
            onClick={() => onSelect(m.id)}
          >
            <div className="item-title">{m.title}</div>
            <div className="item-meta">
              {m.source_team} · {m.material_type} · 版本 {m.version_count} · 评论{" "}
              {m.comment_count}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateMaterialForm({ onCreated, onError }) {
  const [form, setForm] = useState({
    title: "",
    source_team: "",
    material_type: "",
    summary: "",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    api
      .createMaterial(form)
      .then((m) => {
        setForm({ title: "", source_team: "", material_type: "", summary: "" });
        onCreated(m);
      })
      .catch((err) => onError(err.message));
  };

  return (
    <form className="form" onSubmit={submit}>
      <h2>创建材料</h2>
      <input placeholder="标题 *" value={form.title} onChange={set("title")} required />
      <input
        placeholder="来源团队 *"
        value={form.source_team}
        onChange={set("source_team")}
        required
      />
      <input
        placeholder="材料类型（如 需求文档 / 设计稿 / 代码包）*"
        value={form.material_type}
        onChange={set("material_type")}
        required
      />
      <textarea
        placeholder="摘要"
        value={form.summary}
        onChange={set("summary")}
        rows={3}
      />
      <button type="submit">创建材料</button>
    </form>
  );
}

/* ---------- 版本详情 ---------- */

function MaterialDetail({ material, selectedVersionId, onSelectVersion, onVersionCreated, onError }) {
  return (
    <div>
      <h2>版本详情 · {material.title}</h2>
      <p className="desc">{material.summary || "（无摘要）"}</p>
      {material.versions.length === 0 && <Empty text="暂无版本，请在下方新增" />}
      <ul className="item-list">
        {material.versions.map((v) => (
          <li
            key={v.id}
            className={v.id === selectedVersionId ? "item selected" : "item"}
            onClick={() => onSelectVersion(v.id)}
          >
            <div className="item-title">版本 {v.version_no}</div>
            <div className="item-meta">{v.change_note || "（无变更说明）"}</div>
            <div className="item-meta">{v.created_at}</div>
          </li>
        ))}
      </ul>
      <CreateVersionForm
        materialId={material.id}
        onCreated={onVersionCreated}
        onError={onError}
      />
    </div>
  );
}

function CreateVersionForm({ materialId, onCreated, onError }) {
  const [form, setForm] = useState({
    version_no: "",
    change_note: "",
    content_summary: "",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    api
      .createVersion(materialId, form)
      .then((v) => {
        setForm({ version_no: "", change_note: "", content_summary: "" });
        onCreated(v);
      })
      .catch((err) => onError(err.message));
  };

  return (
    <form className="form" onSubmit={submit}>
      <h3>新增版本</h3>
      <input
        placeholder="版本号（如 v1.0）*"
        value={form.version_no}
        onChange={set("version_no")}
        required
      />
      <input
        placeholder="变更说明"
        value={form.change_note}
        onChange={set("change_note")}
      />
      <textarea
        placeholder="正文摘要"
        value={form.content_summary}
        onChange={set("content_summary")}
        rows={3}
      />
      <button type="submit">新增版本</button>
    </form>
  );
}

/* ---------- 评论面板 ---------- */

function CommentsPanel({ version, onChanged, onError }) {
  const [riskFilter, setRiskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [comments, setComments] = useState([]);

  useEffect(() => {
    api
      .listComments({
        version_id: version.id,
        risk_level: riskFilter,
        status: statusFilter,
      })
      .then(setComments)
      .catch((e) => onError(e.message));
  }, [version.id, riskFilter, statusFilter, version, onError]);

  const changeStatus = (comment, toStatus) => {
    const note = window.prompt(
      `将评论 #${comment.id} 从 ${STATUS_LABEL[comment.status]} 改为 ${STATUS_LABEL[toStatus]}，处理意见（可留空）：`
    );
    if (note === null) return;
    api
      .updateCommentStatus(comment.id, {
        status: toStatus,
        actor: comment.reviewer,
        note,
      })
      .then(onChanged)
      .catch((e) => onError(e.message));
  };

  return (
    <div>
      <h2>评论面板 · 版本 {version.version_no}</h2>
      <p className="desc">{version.content_summary || "（无正文摘要）"}</p>
      <div className="filters">
        <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
          <option value="">全部风险级别</option>
          {RISK_LEVELS.map((r) => (
            <option key={r} value={r}>
              {RISK_LABEL[r]}（{r}）
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">全部状态</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}（{s}）
            </option>
          ))}
        </select>
      </div>
      {comments.length === 0 && <Empty text="当前筛选条件下暂无评论" />}
      <ul className="item-list">
        {comments.map((c) => (
          <li key={c.id} className="item comment">
            <div className="item-title">
              <span className={`badge risk-${c.risk_level}`}>
                {RISK_LABEL[c.risk_level]}
              </span>
              <span className={`badge status-${c.status}`}>
                {STATUS_LABEL[c.status]}
              </span>{" "}
              {c.reviewer}
              {c.location && <span className="item-meta"> @ {c.location}</span>}
            </div>
            <div className="comment-content">{c.content}</div>
            <div className="item-meta">{c.created_at}</div>
            {c.status !== "resolved" && (
              <div className="actions">
                {STATUSES.filter((s) => s !== c.status).map((s) => (
                  <button key={s} onClick={() => changeStatus(c, s)}>
                    标记为{STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <CreateCommentForm versionId={version.id} onCreated={onChanged} onError={onError} />
    </div>
  );
}

function CreateCommentForm({ versionId, onCreated, onError }) {
  const [form, setForm] = useState({
    reviewer: "",
    location: "",
    content: "",
    risk_level: "low",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    api
      .createComment(versionId, form)
      .then(() => {
        setForm({ reviewer: "", location: "", content: "", risk_level: "low" });
        onCreated();
      })
      .catch((err) => onError(err.message));
  };

  return (
    <form className="form" onSubmit={submit}>
      <h3>新增评论</h3>
      <input
        placeholder="评论人 *"
        value={form.reviewer}
        onChange={set("reviewer")}
        required
      />
      <input
        placeholder="位置描述（如 第3章 / 接口A）"
        value={form.location}
        onChange={set("location")}
      />
      <textarea
        placeholder="评论内容 *"
        value={form.content}
        onChange={set("content")}
        rows={3}
        required
      />
      <select value={form.risk_level} onChange={set("risk_level")}>
        {RISK_LEVELS.map((r) => (
          <option key={r} value={r}>
            风险级别：{RISK_LABEL[r]}（{r}）
          </option>
        ))}
      </select>
      <button type="submit">提交评论</button>
    </form>
  );
}

/* ---------- 风险摘要 ---------- */

function RiskSummary({ materialId, refreshKey }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    api
      .riskSummary(materialId)
      .then(setSummary)
      .catch((e) => {
        setSummary(null);
        setError(e.message);
      });
  }, [materialId, refreshKey]);

  if (error) {
    return (
      <div>
        <h2>风险摘要</h2>
        <div className="inline-error">风险摘要加载失败：{error}</div>
      </div>
    );
  }
  if (!summary) return null;

  return (
    <div>
      <h2>风险摘要</h2>
      <table className="summary-table">
        <thead>
          <tr>
            <th>风险</th>
            {STATUSES.map((s) => (
              <th key={s}>{STATUS_LABEL[s]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RISK_LEVELS.map((r) => (
            <tr key={r}>
              <td>
                <span className={`badge risk-${r}`}>{RISK_LABEL[r]}</span>
              </td>
              {STATUSES.map((s) => (
                <td key={s}>{summary.by_risk_level[r][s]}</td>
              ))}
            </tr>
          ))}
          <tr className="total-row">
            <td>合计</td>
            {STATUSES.map((s) => (
              <td key={s}>{summary.totals[s]}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 处理记录时间线 ---------- */

function DispositionTimeline({ materialId, refreshKey }) {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    api
      .listDispositions({ material_id: materialId })
      .then(setRecords)
      .catch(() => {});
  }, [materialId, refreshKey]);

  return (
    <div>
      <h2>处理记录时间线</h2>
      {records.length === 0 && <Empty text="暂无处理记录" />}
      <ul className="timeline">
        {records.map((d) => (
          <li key={d.id} className="timeline-item">
            <div className="timeline-time">{d.created_at}</div>
            <div>
              <strong>{d.actor}</strong> 将评论 #{d.comment_id}（版本{" "}
              {d.version_no}）从{" "}
              <span className={`badge status-${d.from_status}`}>
                {STATUS_LABEL[d.from_status] || d.from_status}
              </span>{" "}
              改为{" "}
              <span className={`badge status-${d.to_status}`}>
                {STATUS_LABEL[d.to_status] || d.to_status}
              </span>
            </div>
            {d.note && <div className="item-meta">处理意见：{d.note}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
