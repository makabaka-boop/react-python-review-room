#!/usr/bin/env python3
"""评审材料协作室 - 后端 API

技术栈：Flask + SQLite
端口：18131
数据库：backend/review.db（首次启动自动建表并写入演示数据）
"""
import json
import os
import sqlite3
from datetime import datetime, timezone

from flask import Flask, g, jsonify, request
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "review.db")

RISK_LEVELS = ["low", "medium", "high", "critical"]
RISK_WEIGHT = {"low": 1, "medium": 2, "high": 3, "critical": 4}
COMMENT_STATUSES = ["open", "accepted", "rejected", "resolved"]
MATERIAL_TYPES = ["需求文档", "设计方案", "技术规范", "测试报告", "合同文本", "其他"]

# 状态 -> 处理动作
STATUS_ACTION = {
    "accepted": "accept",
    "rejected": "reject",
    "resolved": "resolve",
    "open": "reopen",
}

app = Flask(__name__)
CORS(app)


# ---------------------------------------------------------------------------
# 数据库基础
# ---------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def read_text_fields(data, spec):
    """从 JSON body 安全读取文本字段。

    spec: [(字段名, 中文标签), ...]
    返回 (values_dict, error)：字段缺失/为 null 时按空字符串处理；
    字段类型不是文本（数字、布尔、数组、对象等）时返回 400 错误信息，
    避免对非字符串调用 .strip() 触发 500。
    """
    values = {}
    for key, label in spec:
        value = data.get(key)
        if value is None:
            values[key] = ""
        elif isinstance(value, str):
            values[key] = value.strip()
        else:
            return None, f"字段「{label}」必须是文本"
    return values, None


def read_int_arg(name):
    """读取整数型 query 参数。缺失返回 (None, None)；无法解析为整数返回错误。"""
    raw = request.args.get(name)
    if raw is None or raw == "":
        return None, None
    try:
        return int(raw), None
    except (TypeError, ValueError):
        return None, f"查询参数「{name}」必须是整数"


SCHEMA = """
CREATE TABLE IF NOT EXISTS materials (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    source_team   TEXT    NOT NULL,
    material_type TEXT    NOT NULL,
    summary       TEXT    NOT NULL DEFAULT '',
    created_by    TEXT    NOT NULL DEFAULT '匿名',
    status        TEXT    NOT NULL DEFAULT 'in_review',
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS versions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id  INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    version_no   TEXT    NOT NULL,
    change_note  TEXT    NOT NULL DEFAULT '',
    body_summary TEXT    NOT NULL DEFAULT '',
    created_by   TEXT    NOT NULL DEFAULT '匿名',
    created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id   INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    version_id    INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
    reviewer      TEXT    NOT NULL,
    location_desc TEXT    NOT NULL DEFAULT '',
    content       TEXT    NOT NULL,
    risk_level    TEXT    NOT NULL DEFAULT 'medium',
    status        TEXT    NOT NULL DEFAULT 'open',
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS handling_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    comment_id  INTEGER REFERENCES comments(id) ON DELETE SET NULL,
    action      TEXT    NOT NULL,
    from_status TEXT,
    to_status   TEXT    NOT NULL,
    operator    TEXT    NOT NULL DEFAULT '匿名',
    note        TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER REFERENCES materials(id) ON DELETE CASCADE,
    event_type  TEXT    NOT NULL,
    entity_type TEXT    NOT NULL,
    entity_id   INTEGER,
    actor       TEXT    NOT NULL DEFAULT '系统',
    detail      TEXT    NOT NULL DEFAULT '{}',
    created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_versions_material  ON versions(material_id);
CREATE INDEX IF NOT EXISTS idx_comments_version   ON comments(version_id);
CREATE INDEX IF NOT EXISTS idx_comments_material  ON comments(material_id);
CREATE INDEX IF NOT EXISTS idx_handling_material  ON handling_records(material_id);
CREATE INDEX IF NOT EXISTS idx_audit_material     ON audit_events(material_id);
"""


def add_audit(db, material_id, event_type, entity_type, entity_id, actor, detail):
    """写入审计事件。detail 为 dict，统一 json.dumps 转义，特殊字符不会破坏 JSON。"""
    db.execute(
        """INSERT INTO audit_events
           (material_id, event_type, entity_type, entity_id, actor, detail, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (material_id, event_type, entity_type, entity_id, actor or "系统",
         json.dumps(detail or {}, ensure_ascii=False), now_iso()),
    )


def add_handling(db, material_id, comment_id, action, from_status, to_status,
                 operator, note):
    cur = db.execute(
        """INSERT INTO handling_records
           (material_id, comment_id, action, from_status, to_status, operator, note, created_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (material_id, comment_id, action, from_status, to_status,
         operator or "匿名", note or "", now_iso()),
    )
    return cur.lastrowid


def row_to_dict(row):
    return dict(row) if row is not None else None


# ---------------------------------------------------------------------------
# 序列化
# ---------------------------------------------------------------------------
def material_stats(db, material_id):
    row = db.execute(
        """SELECT
             (SELECT COUNT(*) FROM versions v WHERE v.material_id = m.id) AS version_count,
             (SELECT COUNT(*) FROM comments c WHERE c.material_id = m.id) AS comment_count,
             (SELECT COUNT(*) FROM comments c
                WHERE c.material_id = m.id AND c.status = 'open') AS open_comment_count,
             (SELECT MAX(CASE c.risk_level
                           WHEN 'critical' THEN 4 WHEN 'high' THEN 3
                           WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END)
                FROM comments c
                WHERE c.material_id = m.id AND c.status IN ('open','accepted','rejected'))
               AS top_risk_weight
           FROM materials m WHERE m.id = ?""",
        (material_id,),
    ).fetchone()
    stats = row_to_dict(row)
    weight = stats.pop("top_risk_weight", 0) or 0
    stats["top_risk"] = next(
        (lvl for lvl, w in RISK_WEIGHT.items() if w == weight), None)
    return stats


def serialize_version(db, row):
    d = row_to_dict(row)
    counts = db.execute(
        """SELECT
             COUNT(*) AS comment_count,
             SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open_count,
             SUM(CASE WHEN risk_level='critical' AND status!='resolved' THEN 1 ELSE 0 END) AS critical_count,
             SUM(CASE WHEN risk_level='high' AND status!='resolved' THEN 1 ELSE 0 END) AS high_count
           FROM comments WHERE version_id = ?""",
        (d["id"],),
    ).fetchone()
    d["comment_count"] = counts["comment_count"] or 0
    d["open_comment_count"] = counts["open_count"] or 0
    d["critical_count"] = counts["critical_count"] or 0
    d["high_count"] = counts["high_count"] or 0
    return d


def serialize_comment(row):
    return row_to_dict(row)


# ---------------------------------------------------------------------------
# 接口
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "review-room-backend", "time": now_iso()})


@app.get("/api/materials")
def list_materials():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM materials ORDER BY updated_at DESC, id DESC").fetchall()
    result = []
    for r in rows:
        d = row_to_dict(r)
        d.update(material_stats(db, d["id"]))
        result.append(d)
    return jsonify(result)


@app.post("/api/materials")
def create_material():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "请求体必须是 JSON 对象"}), 400
    fields, err = read_text_fields(data, [
        ("title", "标题"),
        ("source_team", "来源团队"),
        ("material_type", "材料类型"),
        ("summary", "摘要"),
        ("created_by", "创建人"),
    ])
    if err:
        return jsonify({"error": err}), 400

    title = fields["title"]
    source_team = fields["source_team"]
    material_type = fields["material_type"]
    summary = fields["summary"]
    created_by = fields["created_by"] or "匿名"

    if not title:
        return jsonify({"error": "标题不能为空"}), 400
    if not source_team:
        return jsonify({"error": "来源团队不能为空"}), 400
    if material_type not in MATERIAL_TYPES:
        return jsonify({"error": f"材料类型必须是：{', '.join(MATERIAL_TYPES)}"}), 400

    db = get_db()
    ts = now_iso()
    cur = db.execute(
        """INSERT INTO materials
           (title, source_team, material_type, summary, created_by, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (title, source_team, material_type, summary, created_by, "in_review", ts, ts),
    )
    material_id = cur.lastrowid
    add_audit(db, material_id, "material_created", "material", material_id,
              created_by, {"title": title, "material_type": material_type})
    db.commit()
    return jsonify(get_material_detail(material_id)), 201


@app.get("/api/materials/<int:material_id>")
def get_material(material_id):
    detail = get_material_detail(material_id)
    if detail is None:
        return jsonify({"error": "材料不存在"}), 404
    return jsonify(detail)


def get_material_detail(material_id):
    db = get_db()
    m = db.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if m is None:
        return None
    detail = row_to_dict(m)
    detail.update(material_stats(db, material_id))

    versions = [serialize_version(db, r) for r in db.execute(
        "SELECT * FROM versions WHERE material_id = ? ORDER BY id ASC",
        (material_id,)).fetchall()]
    comments = [serialize_comment(r) for r in db.execute(
        "SELECT * FROM comments WHERE material_id = ? ORDER BY id ASC",
        (material_id,)).fetchall()]
    detail["versions"] = versions
    detail["comments"] = comments
    return detail


@app.post("/api/materials/<int:material_id>/versions")
def create_version(material_id):
    db = get_db()
    m = db.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if m is None:
        return jsonify({"error": "材料不存在"}), 404

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "请求体必须是 JSON 对象"}), 400
    fields, err = read_text_fields(data, [
        ("version_no", "版本号"),
        ("change_note", "变更说明"),
        ("body_summary", "正文摘要"),
        ("created_by", "提交人"),
    ])
    if err:
        return jsonify({"error": err}), 400

    version_no = fields["version_no"]
    change_note = fields["change_note"]
    body_summary = fields["body_summary"]
    created_by = fields["created_by"] or "匿名"

    if not body_summary:
        return jsonify({"error": "正文摘要不能为空"}), 400

    if not version_no:
        # 自动编号：从已有版本数量起步，逐个跳过已占用的版本号
        next_index = db.execute(
            "SELECT COUNT(*) AS c FROM versions WHERE material_id = ?",
            (material_id,)).fetchone()["c"] + 1
        while True:
            candidate = f"v{next_index}.0"
            occupied = db.execute(
                "SELECT 1 FROM versions WHERE material_id = ? AND version_no = ?",
                (material_id, candidate)).fetchone()
            if occupied is None:
                version_no = candidate
                break
            next_index += 1
    else:
        occupied = db.execute(
            "SELECT 1 FROM versions WHERE material_id = ? AND version_no = ?",
            (material_id, version_no)).fetchone()
        if occupied is not None:
            return jsonify(
                {"error": f"版本号 {version_no} 在该材料下已存在，请使用新的版本号"}), 400

    ts = now_iso()
    cur = db.execute(
        """INSERT INTO versions
           (material_id, version_no, change_note, body_summary, created_by, created_at)
           VALUES (?,?,?,?,?,?)""",
        (material_id, version_no, change_note, body_summary, created_by, ts),
    )
    version_id = cur.lastrowid
    db.execute("UPDATE materials SET updated_at = ? WHERE id = ?", (ts, material_id))
    add_audit(db, material_id, "version_created", "version", version_id,
              created_by, {"version_no": version_no})
    db.commit()

    row = db.execute("SELECT * FROM versions WHERE id = ?", (version_id,)).fetchone()
    return jsonify(serialize_version(db, row)), 201


@app.post("/api/versions/<int:version_id>/comments")
def create_comment(version_id):
    db = get_db()
    v = db.execute("SELECT * FROM versions WHERE id = ?", (version_id,)).fetchone()
    if v is None:
        return jsonify({"error": "版本不存在"}), 404

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "请求体必须是 JSON 对象"}), 400
    fields, err = read_text_fields(data, [
        ("reviewer", "评论人"),
        ("location_desc", "位置描述"),
        ("content", "评论内容"),
        ("risk_level", "风险级别"),
    ])
    if err:
        return jsonify({"error": err}), 400

    reviewer = fields["reviewer"]
    location_desc = fields["location_desc"]
    content = fields["content"]
    risk_level = fields["risk_level"] or "medium"

    if not reviewer:
        return jsonify({"error": "评论人不能为空"}), 400
    if not content:
        return jsonify({"error": "评论内容不能为空"}), 400
    if risk_level not in RISK_LEVELS:
        return jsonify({"error": f"风险级别必须是：{', '.join(RISK_LEVELS)}"}), 400

    ts = now_iso()
    cur = db.execute(
        """INSERT INTO comments
           (material_id, version_id, reviewer, location_desc, content, risk_level, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,'open',?,?)""",
        (v["material_id"], version_id, reviewer, location_desc, content,
         risk_level, ts, ts),
    )
    comment_id = cur.lastrowid
    db.execute("UPDATE materials SET updated_at = ? WHERE id = ?",
               (ts, v["material_id"]))
    add_handling(db, v["material_id"], comment_id, "submit", None, "open",
                 reviewer, "提交评论")
    add_audit(db, v["material_id"], "comment_created", "comment", comment_id,
              reviewer, {"version_no": v["version_no"], "risk_level": risk_level})
    db.commit()

    row = db.execute("SELECT * FROM comments WHERE id = ?", (comment_id,)).fetchone()
    return jsonify(serialize_comment(row)), 201


@app.patch("/api/comments/<int:comment_id>")
def update_comment_status(comment_id):
    db = get_db()
    c = db.execute("SELECT * FROM comments WHERE id = ?", (comment_id,)).fetchone()
    if c is None:
        return jsonify({"error": "评论不存在"}), 404

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "请求体必须是 JSON 对象"}), 400
    fields, err = read_text_fields(data, [
        ("status", "状态"),
        ("operator", "操作人"),
        ("note", "处理说明"),
    ])
    if err:
        return jsonify({"error": err}), 400

    new_status = fields["status"]
    operator = fields["operator"] or "评审负责人"
    note = fields["note"]

    if new_status not in COMMENT_STATUSES:
        return jsonify({"error": f"状态必须是：{', '.join(COMMENT_STATUSES)}"}), 400
    if new_status == c["status"]:
        return jsonify({"error": f"评论当前已是 {new_status} 状态，无需处理"}), 400

    ts = now_iso()
    db.execute(
        "UPDATE comments SET status = ?, updated_at = ? WHERE id = ?",
        (new_status, ts, comment_id),
    )
    db.execute("UPDATE materials SET updated_at = ? WHERE id = ?",
               (ts, c["material_id"]))
    add_handling(db, c["material_id"], comment_id,
                 STATUS_ACTION.get(new_status, "status_change"),
                 c["status"], new_status, operator, note)
    add_audit(db, c["material_id"], "comment_status_changed", "comment",
              comment_id, operator,
              {"from": c["status"], "to": new_status, "note": note})
    db.commit()

    row = db.execute("SELECT * FROM comments WHERE id = ?", (comment_id,)).fetchone()
    return jsonify(serialize_comment(row))


@app.get("/api/materials/<int:material_id>/timeline")
def material_timeline(material_id):
    """处理记录时间线：评论提交 + 每条处理结论，按时间倒序。"""
    db = get_db()
    m = db.execute("SELECT id FROM materials WHERE id = ?", (material_id,)).fetchone()
    if m is None:
        return jsonify({"error": "材料不存在"}), 404
    rows = db.execute(
        """SELECT h.*, c.reviewer AS comment_reviewer, c.location_desc,
                  c.content AS comment_content, c.risk_level,
                  v.version_no
           FROM handling_records h
           LEFT JOIN comments c ON c.id = h.comment_id
           LEFT JOIN versions v ON v.id = c.version_id
           WHERE h.material_id = ?
           ORDER BY h.created_at DESC, h.id DESC""",
        (material_id,),
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.get("/api/audit")
def query_audit():
    """审计事件查询，支持 material_id / event_type / entity_type 过滤。"""
    db = get_db()
    material_id, err = read_int_arg("material_id")
    if err:
        return jsonify({"error": err}), 400
    limit, err = read_int_arg("limit")
    if err:
        return jsonify({"error": err}), 400
    limit = min(limit or 100, 500)
    event_type = request.args.get("event_type")
    entity_type = request.args.get("entity_type")

    sql = "SELECT * FROM audit_events WHERE 1=1"
    params = []
    if material_id:
        sql += " AND material_id = ?"
        params.append(material_id)
    if event_type:
        sql += " AND event_type = ?"
        params.append(event_type)
    if entity_type:
        sql += " AND entity_type = ?"
        params.append(entity_type)
    sql += " ORDER BY created_at DESC, id DESC LIMIT ?"
    params.append(limit)
    rows = db.execute(sql, params).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.get("/api/risk-summary")
def risk_summary():
    """风险摘要：按风险级别 / 评论状态聚合，可按材料过滤。"""
    db = get_db()
    material_id, err = read_int_arg("material_id")
    if err:
        return jsonify({"error": err}), 400
    where = "WHERE material_id = ?" if material_id else ""
    params = [material_id] if material_id else []

    rows = db.execute(
        f"SELECT risk_level, status, COUNT(*) AS cnt FROM comments {where} GROUP BY risk_level, status",
        params,
    ).fetchall()

    by_risk = {lvl: 0 for lvl in RISK_LEVELS}
    by_status = {s: 0 for s in COMMENT_STATUSES}
    open_by_risk = {lvl: 0 for lvl in RISK_LEVELS}
    for r in rows:
        by_risk[r["risk_level"]] += r["cnt"]
        by_status[r["status"]] += r["cnt"]
        if r["status"] == "open":
            open_by_risk[r["risk_level"]] += r["cnt"]

    unresolved = sum(by_status[s] for s in ("open", "accepted", "rejected"))
    top_weight = max(
        (RISK_WEIGHT[lvl] for lvl in RISK_LEVELS if open_by_risk[lvl] > 0),
        default=0,
    )
    top_risk = next((lvl for lvl, w in RISK_WEIGHT.items() if w == top_weight), None)

    return jsonify({
        "material_id": material_id,
        "total_comments": sum(by_risk.values()),
        "by_risk": by_risk,
        "by_status": by_status,
        "open_by_risk": open_by_risk,
        "unresolved_count": unresolved,
        "top_open_risk": top_risk,
    })


@app.get("/api/meta")
def meta():
    return jsonify({
        "risk_levels": RISK_LEVELS,
        "comment_statuses": COMMENT_STATUSES,
        "material_types": MATERIAL_TYPES,
    })


@app.errorhandler(404)
def handle_404(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "请求的资源或接口不存在"}), 404
    return err


@app.errorhandler(405)
def handle_405(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "请求方法不允许"}), 405
    return err


@app.errorhandler(400)
def handle_400(err):
    if request.path.startswith("/api/"):
        desc = getattr(err, "description", "请求参数有误")
        return jsonify({"error": desc if isinstance(desc, str) else "请求参数有误"}), 400
    return err


@app.errorhandler(500)
def handle_500(err):
    app.logger.exception("服务器内部错误: %s", err)
    return jsonify({"error": "服务器内部错误，请检查服务端日志"}), 500


# ---------------------------------------------------------------------------
# 初始化 & 演示数据
# ---------------------------------------------------------------------------
def seed_demo(db):
    """首次启动写入一套可直接演示的评审数据。"""
    ts = now_iso()
    cur = db.execute(
        """INSERT INTO materials
           (title, source_team, material_type, summary, created_by, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        ("支付系统重构技术方案", "支付平台组", "设计方案",
         "将原单体支付网关拆分为交易、风控、渠道三个服务，引入异步对账与灰度切流机制。",
         "王工", "in_review", ts, ts),
    )
    mid = cur.lastrowid

    v1 = db.execute(
        """INSERT INTO versions (material_id, version_no, change_note, body_summary, created_by, created_at)
           VALUES (?,?,?,?,?,?)""",
        (mid, "v1.0", "初稿，梳理整体拆分边界",
         "交易服务负责下单与状态机；风控服务同步评估；渠道服务适配微信/支付宝/银联。",
         "王工", ts),
    ).lastrowid
    v2 = db.execute(
        """INSERT INTO versions (material_id, version_no, change_note, body_summary, created_by, created_at)
           VALUES (?,?,?,?,?,?)""",
        (mid, "v2.0", "根据评审意见补充对账与灰度方案",
         "新增 T+1 异步对账流程；渠道切流按商户号灰度，支持秒级回滚；风控评估改为异步事件驱动。",
         "王工", ts),
    ).lastrowid

    c1 = db.execute(
        """INSERT INTO comments (material_id, version_id, reviewer, location_desc, content, risk_level, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (mid, v1, "李评审", "第3章 服务拆分",
         "风控同步评估会拖慢下单链路，峰值时可能导致支付超时，建议改为异步事件驱动。",
         "high", "resolved", ts, ts),
    ).lastrowid
    c2 = db.execute(
        """INSERT INTO comments (material_id, version_id, reviewer, location_desc, content, risk_level, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (mid, v1, "赵架构", "第4章 数据一致性",
         "缺少对账机制，渠道掉单后无法自动发现资金差异。",
         "critical", "accepted", ts, ts),
    ).lastrowid
    c3 = db.execute(
        """INSERT INTO comments (material_id, version_id, reviewer, location_desc, content, risk_level, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (mid, v2, "陈测试", "第5章 灰度切流",
         "灰度按商户号切分，但未说明商户号哈希不均时如何处理，建议补充兜底策略。",
         "medium", "open", ts, ts),
    ).lastrowid
    c4 = db.execute(
        """INSERT INTO comments (material_id, version_id, reviewer, location_desc, content, risk_level, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (mid, v2, "孙安全", "第2章 接口鉴权",
         "渠道回调签名校验建议补充重放攻击防护（时间戳+nonce）。",
         "high", "open", ts, ts),
    ).lastrowid

    add_handling(db, mid, c1, "submit", None, "open", "李评审", "提交评论")
    add_handling(db, mid, c1, "accept", "open", "accepted", "王工", "确认问题成立，v2.0 改为异步事件驱动")
    add_handling(db, mid, c1, "resolve", "accepted", "resolved", "王工", "v2.0 已落地改造并补充时序图")
    add_handling(db, mid, c2, "submit", None, "open", "赵架构", "提交评论")
    add_handling(db, mid, c2, "accept", "open", "accepted", "王工", "采纳，v2.0 新增 T+1 对账流程")
    add_handling(db, mid, c3, "submit", None, "open", "陈测试", "提交评论")
    add_handling(db, mid, c4, "submit", None, "open", "孙安全", "提交评论")

    add_audit(db, mid, "material_created", "material", mid, "王工",
              {"title": "支付系统重构技术方案", "material_type": "设计方案"})
    add_audit(db, mid, "version_created", "version", v1, "王工", {"version_no": "v1.0"})
    add_audit(db, mid, "comment_created", "comment", c1, "李评审",
              {"version_no": "v1.0", "risk_level": "high"})
    add_audit(db, mid, "comment_status_changed", "comment", c1, "王工",
              {"from": "open", "to": "accepted", "note": "确认问题成立"})
    add_audit(db, mid, "version_created", "version", v2, "王工", {"version_no": "v2.0"})
    add_audit(db, mid, "comment_status_changed", "comment", c1, "王工",
              {"from": "accepted", "to": "resolved", "note": "v2.0 已落地改造"})
    add_audit(db, mid, "comment_created", "comment", c2, "赵架构",
              {"version_no": "v1.0", "risk_level": "critical"})
    add_audit(db, mid, "comment_status_changed", "comment", c2, "王工",
              {"from": "open", "to": "accepted", "note": "v2.0 新增对账流程"})
    add_audit(db, mid, "comment_created", "comment", c3, "陈测试",
              {"version_no": "v2.0", "risk_level": "medium"})
    add_audit(db, mid, "comment_created", "comment", c4, "孙安全",
              {"version_no": "v2.0", "risk_level": "high"})


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    # 历史数据可能已存在重复版本号，唯一索引创建失败时给出警告而不是中断启动
    try:
        db.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_versions_material_no
                      ON versions(material_id, version_no)""")
    except sqlite3.IntegrityError:
        print("[backend] 警告：检测到重复版本号，唯一索引未生效；"
              "重复版本仍会被接口拦截，建议清理历史数据后重启")
    if db.execute("SELECT COUNT(*) AS c FROM materials").fetchone()["c"] == 0:
        seed_demo(db)
    db.commit()
    db.close()


if __name__ == "__main__":
    init_db()
    print(f"[backend] SQLite 数据库：{DB_PATH}")
    print("[backend] 评审材料协作室 API 启动于 http://localhost:18131")
    app.run(host="0.0.0.0", port=18131, debug=False)
