/* 评审材料协作室 —— React 前端应用（通过 Babel 在浏览器内编译）。
 * 后端 API 默认地址 http://127.0.0.1:18131/api
 */
const { useState, useEffect, useCallback, useRef } = React;

const API = "http://127.0.0.1:18131/api";

const RISK_LEVELS = ["low", "medium", "high", "critical"];
const RISK_LABELS = { low: "低", medium: "中", high: "高", critical: "严重" };
const STATUSES = ["open", "accepted", "rejected", "resolved"];
const STATUS_LABELS = { open: "待处理", accepted: "已采纳", rejected: "已驳回", resolved: "已解决" };

/* ---------- API helper ---------- */
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || ("请求失败: " + res.status));
  return data;
}

/* ---------- small presentational bits ---------- */
function Pill({ kind, value }) {
  const cls = kind === "risk" ? "risk-" + value : "st-" + value;
  const label = kind === "risk" ? RISK_LABELS[value] : STATUS_LABELS[value];
  return <span className={"pill " + cls}>{label}</span>;
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/* ---------- Create material form ---------- */
function MaterialForm({ onCreated, notify }) {
  const [f, setF] = useState({ title: "", source_team: "", material_type: "设计文档", summary: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim() || !f.source_team.trim()) {
      notify("标题和来源团队为必填项", true);
      return;
    }
    setBusy(true);
    try {
      const m = await api("/materials", { method: "POST", body: f });
      setF({ title: "", source_team: "", material_type: "设计文档", summary: "" });
      notify("材料已创建：" + m.title);
      onCreated(m);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="mini-form" onSubmit={submit}>
      <Field label="标题 *">
        <input value={f.title} onChange={set("title")} placeholder="如：数据平台上线方案" />
      </Field>
      <div className="row-flex">
        <Field label="来源团队 *">
          <input value={f.source_team} onChange={set("source_team")} placeholder="如：数据组" />
        </Field>
        <Field label="材料类型">
          <select value={f.material_type} onChange={set("material_type")}>
            <option>设计文档</option>
            <option>需求文档</option>
            <option>技术方案</option>
            <option>测试报告</option>
            <option>合规材料</option>
            <option>其他</option>
          </select>
        </Field>
      </div>
      <Field label="摘要">
        <textarea value={f.summary} onChange={set("summary")} placeholder="一句话概括材料内容" />
      </Field>
      <button className="primary" disabled={busy}>{busy ? "创建中..." : "创建材料"}</button>
    </form>
  );
}

/* ---------- Material list (left column) ---------- */
function MaterialList({ materials, activeId, onSelect, onCreated, notify }) {
  const [showForm, setShowForm] = useState(false);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>材料列表</h2>
        <span className="count">{materials.length} 份</span>
        <div style={{ flex: 1 }} />
        <button className="small" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "收起" : "+ 新建"}
        </button>
      </div>
      <div className="panel-body scroll">
        {showForm && (
          <MaterialForm
            notify={notify}
            onCreated={(m) => { setShowForm(false); onCreated(m); }}
          />
        )}
        {materials.length === 0 && <div className="empty">暂无材料，点击“新建”创建第一份材料。</div>}
        {materials.map((m) => (
          <div
            key={m.id}
            className={"material-item" + (m.id === activeId ? " active" : "")}
            onClick={() => onSelect(m.id)}
          >
            <div className="title">{m.title}</div>
            <div className="meta">
              <span>来源：{m.source_team}</span>
              <span>类型：{m.material_type}</span>
            </div>
            <div className="chips">
              <span className="chip">{m.version_count} 个版本</span>
              {m.open_comment_count > 0 && (
                <span className="chip warn">{m.open_comment_count} 条待处理</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Comment ---------- */
function Comment({ c, onUpdate }) {
  return (
    <div className={"comment border-" + c.risk_level}>
      <div className="crow">
        <span className="who">{c.reviewer}</span>
        {c.location && <span className="loc">@ {c.location}</span>}
        <div style={{ flex: 1 }} />
        <Pill kind="risk" value={c.risk_level} />
        <Pill kind="status" value={c.status} />
      </div>
      <div className="content">{c.content}</div>
      <div className="actions">
        {STATUSES.filter((s) => s !== c.status).map((s) => (
          <button key={s} className="small" onClick={() => onUpdate(c.id, { status: s })}>
            标记为{STATUS_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Comment form for a version ---------- */
function CommentForm({ versionId, onAdded, notify }) {
  const [f, setF] = useState({ reviewer: "", location: "", content: "", risk_level: "low" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.reviewer.trim() || !f.content.trim()) {
      notify("评论人和内容为必填项", true);
      return;
    }
    setBusy(true);
    try {
      await api("/versions/" + versionId + "/comments", { method: "POST", body: f });
      setF({ reviewer: f.reviewer, location: "", content: "", risk_level: "low" });
      notify("评论已提交");
      onAdded();
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="mini-form" onSubmit={submit}>
      <div className="row-flex">
        <Field label="评论人 *">
          <input value={f.reviewer} onChange={set("reviewer")} placeholder="你的名字" />
        </Field>
        <Field label="位置描述">
          <input value={f.location} onChange={set("location")} placeholder="如：第3章 / 图2" />
        </Field>
        <Field label="风险级别">
          <select value={f.risk_level} onChange={set("risk_level")}>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{RISK_LABELS[r]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="内容 *">
        <textarea value={f.content} onChange={set("content")} placeholder="填写评审意见" />
      </Field>
      <button className="primary" disabled={busy}>{busy ? "提交中..." : "提交评论"}</button>
    </form>
  );
}

/* ---------- Version card ---------- */
function VersionCard({ version, filter, onUpdateComment, onAddComment, notify }) {
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  let comments = version.comments || [];
  if (filter.risk) comments = comments.filter((c) => c.risk_level === filter.risk);
  if (filter.status) comments = comments.filter((c) => c.status === filter.status);
  return (
    <div className="version-card">
      <div className="vhead" onClick={() => setOpen((o) => !o)}>
        <span className="vno">{version.version_no}</span>
        <span className="loc" style={{ color: "var(--muted)", fontSize: 12 }}>
          {version.change_note || "无变更说明"}
        </span>
        <div style={{ flex: 1 }} />
        <span className="chip">{(version.comments || []).length} 条评论</span>
        <span>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="vbody">
          <div className="label">正文摘要</div>
          <div className="text">{version.body_summary || "（空）"}</div>
          <div className="divider" />
          <div style={{ display: "flex", alignItems: "center" }}>
            <div className="section-title" style={{ margin: 0 }}>评论 ({comments.length})</div>
            <div style={{ flex: 1 }} />
            <button className="small" onClick={() => setShowForm((s) => !s)}>
              {showForm ? "收起" : "+ 新增评论"}
            </button>
          </div>
          {showForm && (
            <CommentForm
              versionId={version.id}
              notify={notify}
              onAdded={() => { setShowForm(false); onAddComment(); }}
            />
          )}
          <div style={{ marginTop: 10 }}>
            {comments.length === 0 && <div className="empty">没有符合条件的评论。</div>}
            {comments.map((c) => (
              <Comment key={c.id} c={c} onUpdate={onUpdateComment} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Add version form ---------- */
function VersionForm({ materialId, onAdded, notify }) {
  const [f, setF] = useState({ version_no: "", change_note: "", body_summary: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.version_no.trim()) { notify("版本号为必填项", true); return; }
    setBusy(true);
    try {
      await api("/materials/" + materialId + "/versions", { method: "POST", body: f });
      setF({ version_no: "", change_note: "", body_summary: "" });
      notify("版本已新增");
      onAdded();
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="mini-form" onSubmit={submit}>
      <div className="row-flex">
        <Field label="版本号 *">
          <input value={f.version_no} onChange={set("version_no")} placeholder="如：v1.0 / v2.1" />
        </Field>
        <Field label="变更说明">
          <input value={f.change_note} onChange={set("change_note")} placeholder="本次改动概述" />
        </Field>
      </div>
      <Field label="正文摘要">
        <textarea value={f.body_summary} onChange={set("body_summary")} placeholder="版本正文的关键内容摘要" />
      </Field>
      <button className="primary" disabled={busy}>{busy ? "提交中..." : "新增版本"}</button>
    </form>
  );
}

/* ---------- Center: material detail ---------- */
function MaterialDetail({ material, filter, setFilter, reload, notify }) {
  const [showVForm, setShowVForm] = useState(false);
  if (!material) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>版本与评论</h2></div>
        <div className="panel-body"><div className="empty">请选择左侧的一份材料查看详情。</div></div>
      </div>
    );
  }
  const rs = material.risk_summary || { by_risk: {}, by_status: {} };
  const maxScore = 40;
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{material.title}</h2>
        <span className="count">{material.source_team} · {material.material_type}</span>
        <div style={{ flex: 1 }} />
        <button className="small" onClick={() => setShowVForm((s) => !s)}>
          {showVForm ? "收起" : "+ 新增版本"}
        </button>
      </div>
      <div className="panel-body scroll">
        {material.summary && (
          <>
            <div className="label" style={{ color: "var(--muted)", fontSize: 12 }}>材料摘要</div>
            <div style={{ marginBottom: 12 }}>{material.summary}</div>
          </>
        )}

        {/* 风险摘要 */}
        <div className="summary-grid">
          {RISK_LEVELS.map((r) => (
            <div className="summary-cell" key={r}>
              <div className="n" style={{ color: "var(--" + r + ")" }}>{rs.by_risk[r] || 0}</div>
              <div className="l">{RISK_LABELS[r]}风险</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <span className="l" style={{ color: "var(--muted)", fontSize: 12 }}>
            风险指数 {rs.risk_score || 0} · 待处理 {rs.open_comments || 0} 条
          </span>
        </div>
        <div className="score-bar">
          <div style={{ width: Math.min(100, ((rs.risk_score || 0) / maxScore) * 100) + "%" }} />
        </div>

        {showVForm && (
          <VersionForm
            materialId={material.id}
            notify={notify}
            onAdded={() => { setShowVForm(false); reload(); }}
          />
        )}

        {/* 风险 / 状态筛选 */}
        <div className="divider" />
        <div className="filter-bar">
          <div className="fitem">
            <span style={{ color: "var(--muted)", fontSize: 12 }}>风险</span>
            <select value={filter.risk} onChange={(e) => setFilter({ ...filter, risk: e.target.value })}>
              <option value="">全部</option>
              {RISK_LEVELS.map((r) => <option key={r} value={r}>{RISK_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="fitem">
            <span style={{ color: "var(--muted)", fontSize: 12 }}>状态</span>
            <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              <option value="">全部</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          {(filter.risk || filter.status) && (
            <button className="small" onClick={() => setFilter({ risk: "", status: "" })}>清除筛选</button>
          )}
        </div>

        {/* 版本列表 */}
        {(material.versions || []).length === 0 && (
          <div className="empty">该材料还没有版本，点击右上角“新增版本”。</div>
        )}
        {(material.versions || []).map((v) => (
          <VersionCard
            key={v.id}
            version={v}
            filter={filter}
            notify={notify}
            onUpdateComment={async (cid, body) => {
              try {
                await api("/comments/" + cid, { method: "PATCH", body });
                notify("评论状态已更新");
                reload();
              } catch (err) { notify(err.message, true); }
            }}
            onAddComment={reload}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- Right: disposition timeline + audit ---------- */
function RightPanel({ material, reload, notify }) {
  const [tab, setTab] = useState("timeline");
  const [dispositions, setDispositions] = useState([]);
  const [audit, setAudit] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ actor: "", action: "退回修改", note: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!material) { setDispositions([]); setAudit([]); return; }
    try {
      const d = await api("/materials/" + material.id + "/dispositions");
      setDispositions(d.items);
      const a = await api("/materials/" + material.id + "/audit");
      setAudit(a.items);
    } catch (err) { notify(err.message, true); }
  }, [material, notify]);

  useEffect(() => { load(); }, [load, material]);

  const submit = async (e) => {
    e.preventDefault();
    if (!f.actor.trim()) { notify("处理人为必填项", true); return; }
    setBusy(true);
    try {
      await api("/materials/" + material.id + "/dispositions", { method: "POST", body: f });
      setF({ actor: f.actor, action: "退回修改", note: "" });
      notify("处理记录已添加");
      setShowForm(false);
      load();
      reload();
    } catch (err) { notify(err.message, true); }
    finally { setBusy(false); }
  };

  if (!material) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>处理记录</h2></div>
        <div className="panel-body"><div className="empty">选择材料后显示处理时间线。</div></div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>处理与审计</h2>
        <div style={{ flex: 1 }} />
        {tab === "timeline" && (
          <button className="small" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "收起" : "+ 处理"}
          </button>
        )}
      </div>
      <div className="panel-body scroll">
        <div className="subtabs">
          <button className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>处理记录</button>
          <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>审计事件</button>
        </div>

        {tab === "timeline" && (
          <>
            {showForm && (
              <form className="mini-form" onSubmit={submit}>
                <div className="row-flex">
                  <Field label="处理人 *">
                    <input value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })} placeholder="如：张三" />
                  </Field>
                  <Field label="动作">
                    <select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>
                      <option>退回修改</option>
                      <option>通过评审</option>
                      <option>有条件通过</option>
                      <option>驳回</option>
                      <option>转交他人</option>
                      <option>关闭</option>
                    </select>
                  </Field>
                </div>
                <Field label="结论说明">
                  <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="处理结论 / 后续要求" />
                </Field>
                <button className="primary" disabled={busy}>{busy ? "提交中..." : "添加处理记录"}</button>
              </form>
            )}
            <ul className="timeline" style={{ marginTop: 12 }}>
              {dispositions.length === 0 && <div className="empty">暂无处理记录。</div>}
              {dispositions.map((d) => (
                <li key={d.id}>
                  <span className="dot" />
                  <div className="act">{d.action}</div>
                  <div className="who">{d.actor} · <span className="time">{fmt(d.created_at)}</span></div>
                  {d.note && <div className="note">{d.note}</div>}
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === "audit" && (
          <ul className="timeline">
            {audit.length === 0 && <div className="empty">暂无审计事件。</div>}
            {audit.map((a) => (
              <li key={a.id}>
                <span className="dot" style={{ background: "var(--accent-2)" }} />
                <div className="act">{ENTITY_LABELS[a.entity_type] || a.entity_type} · {a.action}</div>
                <div className="note">{a.detail}</div>
                <div className="time">{fmt(a.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const ENTITY_LABELS = { material: "材料", version: "版本", comment: "评论", disposition: "处理" };

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- App root ---------- */
function App() {
  const [materials, setMaterials] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState({ risk: "", status: "" });
  const [apiOk, setApiOk] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((msg, isError) => {
    setToast({ msg, isError });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const loadMaterials = useCallback(async () => {
    try {
      const d = await api("/materials");
      setMaterials(d.items);
      setApiOk(true);
      return d.items;
    } catch (err) {
      setApiOk(false);
      notify("无法连接后端 API（端口 18131）：" + err.message, true);
      return [];
    }
  }, [notify]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try {
      const d = await api("/materials/" + id);
      setDetail(d);
    } catch (err) { notify(err.message, true); }
  }, [notify]);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);
  useEffect(() => { loadDetail(activeId); }, [activeId, loadDetail]);

  const reloadAll = useCallback(async () => {
    await loadMaterials();
    await loadDetail(activeId);
  }, [loadMaterials, loadDetail, activeId]);

  return (
    <>
      <header className="app-header">
        <h1>评审材料协作室</h1>
        <span className="sub">材料 · 版本 · 评论 · 处理结论 一体化内部评审</span>
        <div className="spacer" />
        <span className={"badge-api" + (apiOk ? " ok" : "")}>
          <span className="dot" />{apiOk ? "后端已连接 :18131" : "后端未连接"}
        </span>
      </header>
      <div className="layout">
        <MaterialList
          materials={materials}
          activeId={activeId}
          onSelect={setActiveId}
          notify={notify}
          onCreated={async (m) => { await loadMaterials(); setActiveId(m.id); }}
        />
        <MaterialDetail
          material={detail}
          filter={filter}
          setFilter={setFilter}
          reload={reloadAll}
          notify={notify}
        />
        <RightPanel material={detail} reload={reloadAll} notify={notify} />
      </div>
      {toast && (
        <div className={"toast" + (toast.isError ? " error" : "")}>{toast.msg}</div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
