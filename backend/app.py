"""评审室后端 API：材料 / 版本 / 评论 / 处理记录 / 审计 / 风险摘要"""
import os
import sqlite3
from datetime import datetime

from flask import Flask, g, jsonify, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "review_room.db")

RISK_LEVELS = ("low", "medium", "high", "critical")
COMMENT_STATUS = ("open", "accepted", "rejected", "resolved")

app = Flask(__name__)


# ---------- 数据库 ----------

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


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            source_team TEXT NOT NULL,
            material_type TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
            version_no TEXT NOT NULL,
            change_note TEXT NOT NULL DEFAULT '',
            content_summary TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE (material_id, version_no)
        );
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
            reviewer TEXT NOT NULL,
            location TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL,
            risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','resolved')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dispositions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
            from_status TEXT,
            to_status TEXT NOT NULL,
            actor TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL DEFAULT '',
            detail TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        """
    )
    db.commit()
    db.close()


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def audit(db, entity_type, entity_id, action, actor="", detail=""):
    db.execute(
        "INSERT INTO audit_events (entity_type, entity_id, action, actor, detail, created_at)"
        " VALUES (?,?,?,?,?,?)",
        (entity_type, entity_id, action, actor, detail, now()),
    )


def row_to_dict(row):
    return {k: row[k] for k in row.keys()}


# ---------- CORS ----------

@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,OPTIONS"
    return resp


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def options(_path):
    return "", 204


def bad_request(msg):
    return jsonify({"error": msg}), 400


def not_found(msg="资源不存在"):
    return jsonify({"error": msg}), 404


def json_body():
    """解析请求体，必须是 JSON 对象，否则抛 ValueError。"""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValueError("请求体必须是 JSON 对象")
    return data


def str_field(data, key, required=False):
    """取字符串字段并去除首尾空白；类型不符时抛 ValueError。"""
    value = data.get(key)
    if value is None:
        if required:
            raise ValueError(f"{key} 为必填")
        return ""
    if not isinstance(value, str):
        raise ValueError(f"{key} 必须是字符串类型")
    value = value.strip()
    if required and not value:
        raise ValueError(f"{key} 为必填")
    return value


# ---------- 材料 ----------

@app.get("/api/materials")
def list_materials():
    db = get_db()
    rows = db.execute(
        """
        SELECT m.*,
               (SELECT COUNT(*) FROM versions v WHERE v.material_id = m.id) AS version_count,
               (SELECT COUNT(*) FROM comments c
                  JOIN versions v ON c.version_id = v.id
                  WHERE v.material_id = m.id) AS comment_count
        FROM materials m ORDER BY m.id DESC
        """
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.post("/api/materials")
def create_material():
    try:
        data = json_body()
        title = str_field(data, "title", required=True)
        source_team = str_field(data, "source_team", required=True)
        material_type = str_field(data, "material_type", required=True)
        summary = str_field(data, "summary")
        actor = str_field(data, "actor")
    except ValueError as e:
        return bad_request(str(e))
    db = get_db()
    cur = db.execute(
        "INSERT INTO materials (title, source_team, material_type, summary, created_at)"
        " VALUES (?,?,?,?,?)",
        (title, source_team, material_type, summary, now()),
    )
    mid = cur.lastrowid
    audit(db, "material", mid, "create", actor, f"创建材料《{title}》")
    db.commit()
    row = db.execute("SELECT * FROM materials WHERE id=?", (mid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.get("/api/materials/<int:mid>")
def get_material(mid):
    db = get_db()
    m = db.execute("SELECT * FROM materials WHERE id=?", (mid,)).fetchone()
    if not m:
        return not_found("材料不存在")
    versions = db.execute(
        "SELECT * FROM versions WHERE material_id=? ORDER BY id DESC", (mid,)
    ).fetchall()
    result = row_to_dict(m)
    result["versions"] = [row_to_dict(v) for v in versions]
    return jsonify(result)


# ---------- 版本 ----------

@app.post("/api/materials/<int:mid>/versions")
def create_version(mid):
    db = get_db()
    if not db.execute("SELECT 1 FROM materials WHERE id=?", (mid,)).fetchone():
        return not_found("材料不存在")
    try:
        data = json_body()
        version_no = str_field(data, "version_no", required=True)
        change_note = str_field(data, "change_note")
        content_summary = str_field(data, "content_summary")
        actor = str_field(data, "actor")
    except ValueError as e:
        return bad_request(str(e))
    try:
        cur = db.execute(
            "INSERT INTO versions (material_id, version_no, change_note, content_summary, created_at)"
            " VALUES (?,?,?,?,?)",
            (mid, version_no, change_note, content_summary, now()),
        )
    except sqlite3.IntegrityError:
        return bad_request(f"版本号 {version_no} 已存在")
    vid = cur.lastrowid
    audit(db, "version", vid, "create", actor, f"材料 #{mid} 新增版本 {version_no}")
    db.commit()
    row = db.execute("SELECT * FROM versions WHERE id=?", (vid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.get("/api/versions/<int:vid>")
def get_version(vid):
    db = get_db()
    v = db.execute("SELECT * FROM versions WHERE id=?", (vid,)).fetchone()
    if not v:
        return not_found("版本不存在")
    comments = db.execute(
        "SELECT * FROM comments WHERE version_id=? ORDER BY id DESC", (vid,)
    ).fetchall()
    result = row_to_dict(v)
    result["comments"] = [row_to_dict(c) for c in comments]
    return jsonify(result)


# ---------- 评论 ----------

@app.get("/api/comments")
def list_comments():
    db = get_db()
    sql = (
        "SELECT c.*, v.version_no, v.material_id FROM comments c"
        " JOIN versions v ON c.version_id = v.id WHERE 1=1"
    )
    args = []
    if request.args.get("version_id"):
        sql += " AND c.version_id=?"
        args.append(request.args["version_id"])
    if request.args.get("material_id"):
        sql += " AND v.material_id=?"
        args.append(request.args["material_id"])
    if request.args.get("risk_level"):
        sql += " AND c.risk_level=?"
        args.append(request.args["risk_level"])
    if request.args.get("status"):
        sql += " AND c.status=?"
        args.append(request.args["status"])
    sql += " ORDER BY c.id DESC"
    rows = db.execute(sql, args).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.post("/api/versions/<int:vid>/comments")
def create_comment(vid):
    db = get_db()
    if not db.execute("SELECT 1 FROM versions WHERE id=?", (vid,)).fetchone():
        return not_found("版本不存在")
    try:
        data = json_body()
        reviewer = str_field(data, "reviewer", required=True)
        content = str_field(data, "content", required=True)
        risk_level = str_field(data, "risk_level", required=True)
        location = str_field(data, "location")
    except ValueError as e:
        return bad_request(str(e))
    if risk_level not in RISK_LEVELS:
        return bad_request(f"risk_level 必须是 {RISK_LEVELS} 之一")
    ts = now()
    cur = db.execute(
        "INSERT INTO comments (version_id, reviewer, location, content, risk_level, status, created_at, updated_at)"
        " VALUES (?,?,?,?,?,'open',?,?)",
        (vid, reviewer, location, content, risk_level, ts, ts),
    )
    cid = cur.lastrowid
    audit(db, "comment", cid, "create", reviewer, f"版本 #{vid} 新增 {risk_level} 风险评论")
    db.commit()
    row = db.execute("SELECT * FROM comments WHERE id=?", (cid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.patch("/api/comments/<int:cid>/status")
def update_comment_status(cid):
    db = get_db()
    comment = db.execute("SELECT * FROM comments WHERE id=?", (cid,)).fetchone()
    if not comment:
        return not_found("评论不存在")
    try:
        data = json_body()
        to_status = str_field(data, "status", required=True)
        actor = str_field(data, "actor") or comment["reviewer"]
        note = str_field(data, "note")
    except ValueError as e:
        return bad_request(str(e))
    if to_status not in COMMENT_STATUS:
        return bad_request(f"status 必须是 {COMMENT_STATUS} 之一")
    from_status = comment["status"]
    if to_status == from_status:
        return bad_request("状态未变化")
    db.execute(
        "UPDATE comments SET status=?, updated_at=? WHERE id=?",
        (to_status, now(), cid),
    )
    cur = db.execute(
        "INSERT INTO dispositions (comment_id, from_status, to_status, actor, note, created_at)"
        " VALUES (?,?,?,?,?,?)",
        (cid, from_status, to_status, actor, note, now()),
    )
    audit(
        db, "comment", cid, "status_change", actor,
        f"评论状态 {from_status} -> {to_status}" + (f"：{note}" if note else ""),
    )
    db.commit()
    row = db.execute("SELECT * FROM comments WHERE id=?", (cid,)).fetchone()
    result = row_to_dict(row)
    result["disposition_id"] = cur.lastrowid
    return jsonify(result)


# ---------- 处理记录 ----------

@app.get("/api/dispositions")
def list_dispositions():
    db = get_db()
    sql = (
        "SELECT d.*, c.reviewer, c.risk_level, c.content AS comment_content,"
        " v.version_no, v.material_id, m.title AS material_title"
        " FROM dispositions d"
        " JOIN comments c ON d.comment_id = c.id"
        " JOIN versions v ON c.version_id = v.id"
        " JOIN materials m ON v.material_id = m.id WHERE 1=1"
    )
    args = []
    if request.args.get("material_id"):
        sql += " AND v.material_id=?"
        args.append(request.args["material_id"])
    if request.args.get("comment_id"):
        sql += " AND d.comment_id=?"
        args.append(request.args["comment_id"])
    sql += " ORDER BY d.id DESC"
    rows = db.execute(sql, args).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


# ---------- 审计 ----------

@app.get("/api/audits")
def list_audits():
    db = get_db()
    sql = "SELECT * FROM audit_events WHERE 1=1"
    args = []
    if request.args.get("entity_type"):
        sql += " AND entity_type=?"
        args.append(request.args["entity_type"])
    if request.args.get("entity_id"):
        sql += " AND entity_id=?"
        args.append(request.args["entity_id"])
    sql += " ORDER BY id DESC LIMIT 200"
    rows = db.execute(sql, args).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


# ---------- 风险摘要 ----------

@app.get("/api/risk-summary")
def risk_summary():
    db = get_db()
    where = ""
    args = []
    if request.args.get("material_id"):
        where = "WHERE v.material_id=?"
        args.append(request.args["material_id"])
    rows = db.execute(
        f"""
        SELECT c.risk_level, c.status, COUNT(*) AS cnt
        FROM comments c JOIN versions v ON c.version_id = v.id
        {where}
        GROUP BY c.risk_level, c.status
        """,
        args,
    ).fetchall()
    summary = {
        level: {status: 0 for status in COMMENT_STATUS} for level in RISK_LEVELS
    }
    totals = {status: 0 for status in COMMENT_STATUS}
    for r in rows:
        summary[r["risk_level"]][r["status"]] = r["cnt"]
        totals[r["status"]] += r["cnt"]
    return jsonify({"by_risk_level": summary, "totals": totals})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=18131)
