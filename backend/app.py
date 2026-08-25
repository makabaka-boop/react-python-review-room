import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from db import init_db, get_db, now_iso, row_to_dict, rows_to_list

app = Flask(__name__)
CORS(app)

VALID_COMMENT_STATUS = {"open", "accepted", "rejected", "resolved"}
VALID_RISK_LEVELS = {"low", "medium", "high", "critical"}


def log_audit(conn, entity_type, entity_id, action, actor="", detail="", material_id=None):
    conn.execute(
        "INSERT INTO audit_events (material_id, entity_type, entity_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (material_id, entity_type, entity_id, action, actor, detail, now_iso()),
    )


# -------------------- Materials --------------------

@app.get("/api/materials")
def list_materials():
    search = request.args.get("search", "").strip()
    risk = request.args.get("risk", "").strip()
    conn = get_db()

    sql = "SELECT DISTINCT m.* FROM materials m"
    params = []
    if risk:
        sql += " LEFT JOIN comments c ON c.material_id = m.id"
    sql += " WHERE 1=1"
    if search:
        sql += " AND (m.title LIKE ? OR m.source_team LIKE ? OR m.material_type LIKE ?)"
        kw = f"%{search}%"
        params.extend([kw, kw, kw])
    if risk:
        sql += " AND c.risk_level = ?"
        params.append(risk)
    sql += " ORDER BY m.updated_at DESC"

    rows = conn.execute(sql, params).fetchall()
    materials = rows_to_list(rows)
    for m in materials:
        ver_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM versions WHERE material_id = ?", (m["id"],)
        ).fetchone()["cnt"]
        open_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM comments WHERE material_id = ? AND status = 'open'",
            (m["id"],),
        ).fetchone()["cnt"]
        m["version_count"] = ver_count
        m["open_comment_count"] = open_count
    conn.close()
    return jsonify(materials)


@app.post("/api/materials")
def create_material():
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    source_team = (data.get("source_team") or "").strip()
    material_type = (data.get("material_type") or "").strip()
    summary = (data.get("summary") or "").strip()
    if not title or not source_team or not material_type:
        return jsonify({"error": "title, source_team, material_type are required"}), 400

    conn = get_db()
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO materials (title, source_team, material_type, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (title, source_team, material_type, summary, ts, ts),
    )
    mid = cur.lastrowid
    log_audit(conn, "material", mid, "create", data.get("actor", ""), f"Created material: {title}", material_id=mid)
    conn.commit()
    row = conn.execute("SELECT * FROM materials WHERE id = ?", (mid,)).fetchone()
    conn.close()
    return jsonify(row_to_dict(row)), 201


@app.get("/api/materials/<int:mid>")
def get_material(mid):
    conn = get_db()
    m = conn.execute("SELECT * FROM materials WHERE id = ?", (mid,)).fetchone()
    if not m:
        conn.close()
        return jsonify({"error": "not found"}), 404
    versions = conn.execute(
        "SELECT * FROM versions WHERE material_id = ? ORDER BY id DESC", (mid,)
    ).fetchall()
    comments = conn.execute(
        "SELECT * FROM comments WHERE material_id = ? ORDER BY id DESC", (mid,)
    ).fetchall()
    records = conn.execute(
        "SELECT * FROM processing_records WHERE material_id = ? ORDER BY id DESC", (mid,)
    ).fetchall()
    conn.close()
    return jsonify(
        {
            "material": row_to_dict(m),
            "versions": rows_to_list(versions),
            "comments": rows_to_list(comments),
            "processing_records": rows_to_list(records),
        }
    )


@app.put("/api/materials/<int:mid>")
def update_material(mid):
    data = request.get_json(force=True)
    conn = get_db()
    m = conn.execute("SELECT * FROM materials WHERE id = ?", (mid,)).fetchone()
    if not m:
        conn.close()
        return jsonify({"error": "not found"}), 404

    fields = []
    params = []
    for key in ("title", "source_team", "material_type", "summary"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(data[key])
    if not fields:
        conn.close()
        return jsonify({"error": "no fields to update"}), 400

    fields.append("updated_at = ?")
    params.append(now_iso())
    params.append(mid)
    conn.execute(f"UPDATE materials SET {', '.join(fields)} WHERE id = ?", params)
    log_audit(conn, "material", mid, "update", data.get("actor", ""), "Updated material fields", material_id=mid)
    conn.commit()
    row = conn.execute("SELECT * FROM materials WHERE id = ?", (mid,)).fetchone()
    conn.close()
    return jsonify(row_to_dict(row))


# -------------------- Versions --------------------

@app.get("/api/materials/<int:mid>/versions")
def list_versions(mid):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM versions WHERE material_id = ? ORDER BY id DESC", (mid,)
    ).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))


@app.post("/api/materials/<int:mid>/versions")
def create_version(mid):
    data = request.get_json(force=True)
    version_number = (data.get("version_number") or "").strip()
    change_note = (data.get("change_note") or "").strip()
    content_summary = (data.get("content_summary") or "").strip()
    if not version_number:
        return jsonify({"error": "version_number is required"}), 400

    conn = get_db()
    m = conn.execute("SELECT id FROM materials WHERE id = ?", (mid,)).fetchone()
    if not m:
        conn.close()
        return jsonify({"error": "material not found"}), 404

    cur = conn.execute(
        "INSERT INTO versions (material_id, version_number, change_note, content_summary, created_at) VALUES (?, ?, ?, ?, ?)",
        (mid, version_number, change_note, content_summary, now_iso()),
    )
    vid = cur.lastrowid
    conn.execute("UPDATE materials SET updated_at = ? WHERE id = ?", (now_iso(), mid))
    log_audit(conn, "version", vid, "create", data.get("actor", ""), f"Added version {version_number}", material_id=mid)
    conn.commit()
    row = conn.execute("SELECT * FROM versions WHERE id = ?", (vid,)).fetchone()
    conn.close()
    return jsonify(row_to_dict(row)), 201


@app.get("/api/versions/<int:vid>")
def get_version(vid):
    conn = get_db()
    v = conn.execute("SELECT * FROM versions WHERE id = ?", (vid,)).fetchone()
    if not v:
        conn.close()
        return jsonify({"error": "not found"}), 404
    comments = conn.execute(
        "SELECT * FROM comments WHERE version_id = ? ORDER BY id DESC", (vid,)
    ).fetchall()
    conn.close()
    return jsonify({"version": row_to_dict(v), "comments": rows_to_list(comments)})


# -------------------- Comments --------------------

@app.get("/api/comments")
def list_comments():
    material_id = request.args.get("material_id", type=int)
    version_id = request.args.get("version_id", type=int)
    status = request.args.get("status", "").strip()
    risk = request.args.get("risk_level", "").strip()

    sql = "SELECT * FROM comments WHERE 1=1"
    params = []
    if material_id:
        sql += " AND material_id = ?"
        params.append(material_id)
    if version_id:
        sql += " AND version_id = ?"
        params.append(version_id)
    if status:
        sql += " AND status = ?"
        params.append(status)
    if risk:
        sql += " AND risk_level = ?"
        params.append(risk)
    sql += " ORDER BY id DESC"

    conn = get_db()
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))


@app.post("/api/comments")
def create_comment():
    data = request.get_json(force=True)
    material_id = data.get("material_id")
    version_id = data.get("version_id")
    commenter = (data.get("commenter") or "").strip()
    location_desc = (data.get("location_desc") or "").strip()
    content = (data.get("content") or "").strip()
    risk_level = (data.get("risk_level") or "low").strip()
    status = (data.get("status") or "open").strip()

    if not material_id or not commenter:
        return jsonify({"error": "material_id and commenter are required"}), 400
    if not content:
        return jsonify({"error": "content is required and cannot be empty"}), 400
    if risk_level not in VALID_RISK_LEVELS:
        return jsonify({"error": f"risk_level must be one of {sorted(VALID_RISK_LEVELS)}"}), 400
    if status not in VALID_COMMENT_STATUS:
        return jsonify({"error": f"status must be one of {sorted(VALID_COMMENT_STATUS)}"}), 400

    conn = get_db()
    m = conn.execute("SELECT id FROM materials WHERE id = ?", (material_id,)).fetchone()
    if not m:
        conn.close()
        return jsonify({"error": "material not found"}), 404
    if version_id:
        v = conn.execute(
            "SELECT id FROM versions WHERE id = ? AND material_id = ?",
            (version_id, material_id),
        ).fetchone()
        if not v:
            conn.close()
            return jsonify({"error": "version not found for this material"}), 404

    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO comments (material_id, version_id, commenter, location_desc, content, risk_level, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (material_id, version_id, commenter, location_desc, content, risk_level, status, ts, ts),
    )
    cid = cur.lastrowid
    conn.execute("UPDATE materials SET updated_at = ? WHERE id = ?", (ts, material_id))
    conn.execute(
        "INSERT INTO processing_records (material_id, comment_id, action, actor, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (material_id, cid, "comment_created", commenter, f"Risk: {risk_level}, Status: {status}", ts),
    )
    log_audit(conn, "comment", cid, "create", commenter, f"Comment created with risk {risk_level}", material_id=material_id)
    conn.commit()
    row = conn.execute("SELECT * FROM comments WHERE id = ?", (cid,)).fetchone()
    conn.close()
    return jsonify(row_to_dict(row)), 201


@app.put("/api/comments/<int:cid>")
def update_comment(cid):
    data = request.get_json(force=True)
    conn = get_db()
    c = conn.execute("SELECT * FROM comments WHERE id = ?", (cid,)).fetchone()
    if not c:
        conn.close()
        return jsonify({"error": "not found"}), 404

    fields = []
    params = []
    for key in ("version_id", "commenter", "location_desc", "content", "risk_level", "status"):
        if key in data:
            if key == "risk_level" and data[key] not in VALID_RISK_LEVELS:
                conn.close()
                return jsonify({"error": f"risk_level must be one of {sorted(VALID_RISK_LEVELS)}"}), 400
            if key == "status" and data[key] not in VALID_COMMENT_STATUS:
                conn.close()
                return jsonify({"error": f"status must be one of {sorted(VALID_COMMENT_STATUS)}"}), 400
            if key == "content" and not (str(data[key]) or "").strip():
                conn.close()
                return jsonify({"error": "content cannot be empty"}), 400
            if key == "version_id" and data[key]:
                v = conn.execute(
                    "SELECT id FROM versions WHERE id = ? AND material_id = ?",
                    (data[key], c["material_id"]),
                ).fetchone()
                if not v:
                    conn.close()
                    return jsonify({"error": "version does not belong to this material"}), 400
            fields.append(f"{key} = ?")
            params.append(data[key])

    if not fields:
        conn.close()
        return jsonify({"error": "no fields to update"}), 400

    old_status = c["status"]
    new_status = data.get("status", old_status)
    old_risk = c["risk_level"]
    new_risk = data.get("risk_level", old_risk)

    fields.append("updated_at = ?")
    params.append(now_iso())
    params.append(cid)
    conn.execute(f"UPDATE comments SET {', '.join(fields)} WHERE id = ?", params)

    note_parts = []
    if old_status != new_status:
        note_parts.append(f"Status: {old_status} -> {new_status}")
    if old_risk != new_risk:
        note_parts.append(f"Risk: {old_risk} -> {new_risk}")
    if note_parts:
        actor = data.get("actor", c["commenter"])
        ts = now_iso()
        conn.execute(
            "INSERT INTO processing_records (material_id, comment_id, action, actor, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (c["material_id"], cid, "comment_updated", actor, "; ".join(note_parts), ts),
        )
        log_audit(conn, "comment", cid, "update", actor, "; ".join(note_parts), material_id=c["material_id"])

    conn.execute("UPDATE materials SET updated_at = ? WHERE id = ?", (now_iso(), c["material_id"]))
    conn.commit()
    row = conn.execute("SELECT * FROM comments WHERE id = ?", (cid,)).fetchone()
    conn.close()
    return jsonify(row_to_dict(row))


# -------------------- Processing Records --------------------

@app.get("/api/materials/<int:mid>/records")
def list_records(mid):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM processing_records WHERE material_id = ? ORDER BY id DESC", (mid,)
    ).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))


@app.post("/api/materials/<int:mid>/records")
def create_record(mid):
    data = request.get_json(force=True)
    action = (data.get("action") or "").strip()
    actor = (data.get("actor") or "").strip()
    note = (data.get("note") or "").strip()
    comment_id = data.get("comment_id")
    if not action or not actor:
        return jsonify({"error": "action and actor are required"}), 400

    conn = get_db()
    m = conn.execute("SELECT id FROM materials WHERE id = ?", (mid,)).fetchone()
    if not m:
        conn.close()
        return jsonify({"error": "material not found"}), 404

    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO processing_records (material_id, comment_id, action, actor, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (mid, comment_id, action, actor, note, ts),
    )
    rid = cur.lastrowid
    conn.execute("UPDATE materials SET updated_at = ? WHERE id = ?", (ts, mid))
    log_audit(conn, "record", rid, "create", actor, f"Action: {action}", material_id=mid)
    conn.commit()
    row = conn.execute("SELECT * FROM processing_records WHERE id = ?", (rid,)).fetchone()
    conn.close()
    return jsonify(row_to_dict(row)), 201


# -------------------- Audit Events --------------------

@app.get("/api/audit")
def list_audit():
    entity_type = request.args.get("entity_type", "").strip()
    entity_id = request.args.get("entity_id", type=int)
    material_id = request.args.get("material_id", type=int)
    limit = request.args.get("limit", 100, type=int)

    sql = "SELECT * FROM audit_events WHERE 1=1"
    params = []
    if entity_type:
        sql += " AND entity_type = ?"
        params.append(entity_type)
    if entity_id:
        sql += " AND entity_id = ?"
        params.append(entity_id)
    if material_id:
        sql += " AND material_id = ?"
        params.append(material_id)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(limit)

    conn = get_db()
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))


# -------------------- Risk Summary --------------------

@app.get("/api/risk-summary")
def risk_summary():
    material_id = request.args.get("material_id", type=int)
    conn = get_db()

    sql = "SELECT risk_level, status, COUNT(*) as cnt FROM comments"
    params = []
    if material_id:
        sql += " WHERE material_id = ?"
        params.append(material_id)
    sql += " GROUP BY risk_level, status"
    rows = conn.execute(sql, params).fetchall()

    summary = {
        "low": {"open": 0, "accepted": 0, "rejected": 0, "resolved": 0, "total": 0},
        "medium": {"open": 0, "accepted": 0, "rejected": 0, "resolved": 0, "total": 0},
        "high": {"open": 0, "accepted": 0, "rejected": 0, "resolved": 0, "total": 0},
        "critical": {"open": 0, "accepted": 0, "rejected": 0, "resolved": 0, "total": 0},
    }
    total_open = 0
    total_all = 0
    for r in rows:
        rl = r["risk_level"]
        st = r["status"]
        if rl in summary and st in summary[rl]:
            summary[rl][st] = r["cnt"]
            summary[rl]["total"] += r["cnt"]
            total_all += r["cnt"]
            if st == "open":
                total_open += r["cnt"]

    conn.close()
    return jsonify(
        {
            "by_risk": summary,
            "total_open": total_open,
            "total_all": total_all,
        }
    )


if __name__ == "__main__":
    init_db()
    print("Database initialized at:", os.path.abspath("data/review_room.db"))
    app.run(host="0.0.0.0", port=18131, debug=True)
