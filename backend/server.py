#!/usr/bin/env python3
"""评审材料协作室 —— 后端 API 服务。

仅使用 Python 标准库（http.server + sqlite3），无需安装任何第三方依赖。
监听端口 18131，数据保存在 backend/review_room.db。

数据模型：
  - materials       材料（标题、来源团队、材料类型、摘要）
  - versions        版本（版本号、变更说明、正文摘要）
  - comments        评论（评论人、位置描述、内容、风险级别、状态）
  - dispositions    处理记录（处理人、动作、结论说明）
  - audit_events    审计事件（对以上实体的所有写操作留痕）
"""

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HOST = "0.0.0.0"
PORT = 18131
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "review_room.db")

COMMENT_STATUSES = {"open", "accepted", "rejected", "resolved"}
RISK_LEVELS = {"low", "medium", "high", "critical"}

# 使用可重入锁：部分路由（如 /materials/{id}/audit）在持锁状态下会再次调用
# 需要加锁的辅助方法，非重入锁会导致死锁。
_db_lock = threading.RLock()


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS materials (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            title         TEXT NOT NULL,
            source_team   TEXT NOT NULL,
            material_type TEXT NOT NULL,
            summary       TEXT NOT NULL DEFAULT '',
            created_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS versions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            material_id  INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
            version_no   TEXT NOT NULL,
            change_note  TEXT NOT NULL DEFAULT '',
            body_summary TEXT NOT NULL DEFAULT '',
            created_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            version_id  INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
            reviewer    TEXT NOT NULL,
            location    TEXT NOT NULL DEFAULT '',
            content     TEXT NOT NULL,
            risk_level  TEXT NOT NULL DEFAULT 'low',
            status      TEXT NOT NULL DEFAULT 'open',
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dispositions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
            actor       TEXT NOT NULL,
            action      TEXT NOT NULL,
            note        TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id   INTEGER,
            material_id INTEGER,
            action      TEXT NOT NULL,
            detail      TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()


def record_audit(conn, entity_type, entity_id, action, detail="", material_id=None):
    conn.execute(
        "INSERT INTO audit_events (entity_type, entity_id, material_id, action, detail, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (entity_type, entity_id, material_id, action, detail, now_iso()),
    )


# --------------------------------------------------------------------------- #
# HTTP handling helpers
# --------------------------------------------------------------------------- #

class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def row_to_dict(row):
    return {k: row[k] for k in row.keys()}


class Handler(BaseHTTPRequestHandler):
    server_version = "ReviewRoom/1.0"

    def log_message(self, fmt, *args):
        print("[api] %s - %s" % (self.address_string(), fmt % args))

    # -- low level response helpers ----------------------------------------- #
    def _send_json(self, obj, status=200):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "请求体不是合法的 JSON")
        if not isinstance(data, dict):
            raise ApiError(400, "请求体必须是 JSON 对象")
        return data

    # -- dispatch ----------------------------------------------------------- #
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PATCH(self):
        self._dispatch("PATCH")

    def _dispatch(self, method):
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.split("/") if p]
        query = parse_qs(parsed.query)
        try:
            result, status = self.route(method, parts, query)
            self._send_json(result, status)
        except ApiError as e:
            self._send_json({"error": e.message}, e.status)
        except Exception as e:  # pragma: no cover - defensive
            self._send_json({"error": "服务器内部错误: %s" % e}, 500)

    # -- router ------------------------------------------------------------- #
    def route(self, method, parts, query):
        # /api/...
        if not parts or parts[0] != "api":
            raise ApiError(404, "未知路径")
        parts = parts[1:]

        if not parts:
            return {"service": "review-room-api", "status": "ok"}, 200

        head = parts[0]

        if head == "health":
            return {"status": "ok", "time": now_iso()}, 200

        if head == "materials":
            return self.route_materials(method, parts[1:], query)

        if head == "versions":
            return self.route_versions(method, parts[1:], query)

        if head == "comments":
            return self.route_comments(method, parts[1:], query)

        if head == "audit":
            if method == "GET":
                return self.list_audit(query), 200
            raise ApiError(405, "方法不允许")

        raise ApiError(404, "未知路径")

    # -- materials ---------------------------------------------------------- #
    def route_materials(self, method, rest, query):
        with _db_lock:
            conn = get_conn()
            try:
                if not rest:
                    if method == "GET":
                        return self.list_materials(conn, query), 200
                    if method == "POST":
                        return self.create_material(conn, self._read_body()), 201
                    raise ApiError(405, "方法不允许")

                mid = self._int(rest[0], "material id")
                sub = rest[1] if len(rest) > 1 else None

                if sub is None:
                    if method == "GET":
                        return self.get_material(conn, mid), 200
                    raise ApiError(405, "方法不允许")

                if sub == "versions":
                    if method == "GET":
                        return self.list_versions(conn, mid), 200
                    if method == "POST":
                        return self.create_version(conn, mid, self._read_body()), 201
                    raise ApiError(405, "方法不允许")

                if sub == "dispositions":
                    if method == "GET":
                        return self.list_dispositions(conn, mid), 200
                    if method == "POST":
                        return self.create_disposition(conn, mid, self._read_body()), 201
                    raise ApiError(405, "方法不允许")

                if sub == "audit":
                    if method == "GET":
                        self._ensure_material(conn, mid)
                        return self.list_audit(query, material_id=mid), 200
                    raise ApiError(405, "方法不允许")

                if sub == "risk-summary":
                    if method == "GET":
                        return self.risk_summary(conn, mid), 200
                    raise ApiError(405, "方法不允许")

                raise ApiError(404, "未知路径")
            finally:
                conn.close()

    def list_materials(self, conn, query):
        rows = conn.execute(
            "SELECT * FROM materials ORDER BY created_at DESC, id DESC"
        ).fetchall()
        items = []
        for r in rows:
            m = row_to_dict(r)
            m["version_count"] = conn.execute(
                "SELECT COUNT(*) c FROM versions WHERE material_id=?", (r["id"],)
            ).fetchone()["c"]
            m["open_comment_count"] = conn.execute(
                "SELECT COUNT(*) c FROM comments c JOIN versions v ON c.version_id=v.id"
                " WHERE v.material_id=? AND c.status='open'",
                (r["id"],),
            ).fetchone()["c"]
            items.append(m)
        return {"items": items, "total": len(items)}

    def create_material(self, conn, body):
        title = self._require(body, "title")
        source_team = self._require(body, "source_team")
        material_type = self._require(body, "material_type")
        summary = (body.get("summary") or "").strip()
        cur = conn.execute(
            "INSERT INTO materials (title, source_team, material_type, summary, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (title, source_team, material_type, summary, now_iso()),
        )
        mid = cur.lastrowid
        record_audit(conn, "material", mid, "create", "创建材料: %s" % title, material_id=mid)
        conn.commit()
        return self.get_material(conn, mid)

    def get_material(self, conn, mid):
        row = conn.execute("SELECT * FROM materials WHERE id=?", (mid,)).fetchone()
        if not row:
            raise ApiError(404, "材料不存在")
        material = row_to_dict(row)
        material["versions"] = self.list_versions(conn, mid)["items"]
        material["risk_summary"] = self.risk_summary(conn, mid)
        return material

    # -- versions ----------------------------------------------------------- #
    def list_versions(self, conn, mid):
        self._ensure_material(conn, mid)
        rows = conn.execute(
            "SELECT * FROM versions WHERE material_id=? ORDER BY id ASC", (mid,)
        ).fetchall()
        items = []
        for r in rows:
            v = row_to_dict(r)
            crows = conn.execute(
                "SELECT * FROM comments WHERE version_id=? ORDER BY id ASC", (r["id"],)
            ).fetchall()
            v["comments"] = [row_to_dict(cr) for cr in crows]
            v["comment_count"] = len(crows)
            items.append(v)
        return {"items": items, "total": len(items)}

    def create_version(self, conn, mid, body):
        self._ensure_material(conn, mid)
        version_no = self._require(body, "version_no")
        change_note = (body.get("change_note") or "").strip()
        body_summary = (body.get("body_summary") or "").strip()
        cur = conn.execute(
            "INSERT INTO versions (material_id, version_no, change_note, body_summary, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (mid, version_no, change_note, body_summary, now_iso()),
        )
        vid = cur.lastrowid
        record_audit(conn, "version", vid, "create",
                     "新增版本 %s" % version_no, material_id=mid)
        conn.commit()
        row = conn.execute("SELECT * FROM versions WHERE id=?", (vid,)).fetchone()
        return row_to_dict(row)

    def route_versions(self, method, rest, query):
        if not rest:
            raise ApiError(404, "未知路径")
        with _db_lock:
            conn = get_conn()
            try:
                vid = self._int(rest[0], "version id")
                sub = rest[1] if len(rest) > 1 else None
                if sub is None:
                    if method == "GET":
                        return self.get_version(conn, vid), 200
                    raise ApiError(405, "方法不允许")
                if sub == "comments":
                    if method == "GET":
                        return self.list_comments(conn, vid, query), 200
                    if method == "POST":
                        return self.create_comment(conn, vid, self._read_body()), 201
                    raise ApiError(405, "方法不允许")
                raise ApiError(404, "未知路径")
            finally:
                conn.close()

    def get_version(self, conn, vid):
        row = conn.execute("SELECT * FROM versions WHERE id=?", (vid,)).fetchone()
        if not row:
            raise ApiError(404, "版本不存在")
        version = row_to_dict(row)
        version["comments"] = self.list_comments(conn, vid, {})["items"]
        return version

    # -- comments ----------------------------------------------------------- #
    def list_comments(self, conn, vid, query):
        self._ensure_version(conn, vid)
        sql = "SELECT * FROM comments WHERE version_id=?"
        params = [vid]
        risk = query.get("risk_level", [None])[0]
        if risk:
            if risk not in RISK_LEVELS:
                raise ApiError(400, "非法风险级别: %s" % risk)
            sql += " AND risk_level=?"
            params.append(risk)
        status = query.get("status", [None])[0]
        if status:
            if status not in COMMENT_STATUSES:
                raise ApiError(400, "非法状态: %s" % status)
            sql += " AND status=?"
            params.append(status)
        sql += " ORDER BY id ASC"
        rows = conn.execute(sql, params).fetchall()
        return {"items": [row_to_dict(r) for r in rows], "total": len(rows)}

    def create_comment(self, conn, vid, body):
        self._ensure_version(conn, vid)
        reviewer = self._require(body, "reviewer")
        content = self._require(body, "content")
        location = (body.get("location") or "").strip()
        risk_level = self._enum(body, "risk_level", RISK_LEVELS, "low")
        status = self._enum(body, "status", COMMENT_STATUSES, "open")
        ts = now_iso()
        cur = conn.execute(
            "INSERT INTO comments (version_id, reviewer, location, content, risk_level, status,"
            " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (vid, reviewer, location, content, risk_level, status, ts, ts),
        )
        cid = cur.lastrowid
        mid = conn.execute("SELECT material_id FROM versions WHERE id=?", (vid,)).fetchone()[0]
        record_audit(conn, "comment", cid, "create",
                     "%s 提交评论 (风险=%s)" % (reviewer, risk_level), material_id=mid)
        conn.commit()
        row = conn.execute("SELECT * FROM comments WHERE id=?", (cid,)).fetchone()
        return row_to_dict(row)

    def route_comments(self, method, rest, query):
        if not rest:
            raise ApiError(404, "未知路径")
        with _db_lock:
            conn = get_conn()
            try:
                cid = self._int(rest[0], "comment id")
                if len(rest) == 1:
                    if method == "PATCH":
                        return self.update_comment(conn, cid, self._read_body()), 200
                    if method == "GET":
                        row = conn.execute("SELECT * FROM comments WHERE id=?", (cid,)).fetchone()
                        if not row:
                            raise ApiError(404, "评论不存在")
                        return row_to_dict(row), 200
                    raise ApiError(405, "方法不允许")
                raise ApiError(404, "未知路径")
            finally:
                conn.close()

    def update_comment(self, conn, cid, body):
        row = conn.execute("SELECT * FROM comments WHERE id=?", (cid,)).fetchone()
        if not row:
            raise ApiError(404, "评论不存在")
        fields = {}
        if "status" in body and body["status"] is not None:
            if body["status"] not in COMMENT_STATUSES:
                raise ApiError(400, "非法状态: %s" % body["status"])
            fields["status"] = body["status"]
        if "risk_level" in body and body["risk_level"] is not None:
            if body["risk_level"] not in RISK_LEVELS:
                raise ApiError(400, "非法风险级别: %s" % body["risk_level"])
            fields["risk_level"] = body["risk_level"]
        for key in ("content", "location", "reviewer"):
            if key in body and body[key] is not None:
                fields[key] = str(body[key]).strip()
        if not fields:
            raise ApiError(400, "没有可更新的字段")
        fields["updated_at"] = now_iso()
        assignments = ", ".join("%s=?" % k for k in fields)
        conn.execute("UPDATE comments SET %s WHERE id=?" % assignments,
                     list(fields.values()) + [cid])
        mid = conn.execute("SELECT material_id FROM versions WHERE id=?",
                           (row["version_id"],)).fetchone()[0]
        detail = ", ".join("%s->%s" % (k, v) for k, v in fields.items() if k != "updated_at")
        record_audit(conn, "comment", cid, "update", "评论更新: %s" % detail, material_id=mid)
        conn.commit()
        updated = conn.execute("SELECT * FROM comments WHERE id=?", (cid,)).fetchone()
        return row_to_dict(updated)

    # -- dispositions ------------------------------------------------------- #
    def list_dispositions(self, conn, mid):
        self._ensure_material(conn, mid)
        rows = conn.execute(
            "SELECT * FROM dispositions WHERE material_id=? ORDER BY created_at ASC, id ASC",
            (mid,),
        ).fetchall()
        return {"items": [row_to_dict(r) for r in rows], "total": len(rows)}

    def create_disposition(self, conn, mid, body):
        self._ensure_material(conn, mid)
        actor = self._require(body, "actor")
        action = self._require(body, "action")
        note = (body.get("note") or "").strip()
        cur = conn.execute(
            "INSERT INTO dispositions (material_id, actor, action, note, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (mid, actor, action, note, now_iso()),
        )
        did = cur.lastrowid
        record_audit(conn, "disposition", did, "create",
                     "%s 处理: %s" % (actor, action), material_id=mid)
        conn.commit()
        row = conn.execute("SELECT * FROM dispositions WHERE id=?", (did,)).fetchone()
        return row_to_dict(row)

    # -- audit -------------------------------------------------------------- #
    def list_audit(self, query, material_id=None):
        with _db_lock:
            conn = get_conn()
            try:
                sql = "SELECT * FROM audit_events"
                clauses = []
                params = []
                if material_id is not None:
                    clauses.append("material_id=?")
                    params.append(material_id)
                et = query.get("entity_type", [None])[0]
                if et:
                    clauses.append("entity_type=?")
                    params.append(et)
                if clauses:
                    sql += " WHERE " + " AND ".join(clauses)
                sql += " ORDER BY id DESC"
                limit = query.get("limit", [None])[0]
                if limit:
                    try:
                        sql += " LIMIT %d" % int(limit)
                    except ValueError:
                        pass
                rows = conn.execute(sql, params).fetchall()
                return {"items": [row_to_dict(r) for r in rows], "total": len(rows)}
            finally:
                conn.close()

    # -- risk summary ------------------------------------------------------- #
    def risk_summary(self, conn, mid):
        self._ensure_material(conn, mid)
        by_risk = {lvl: 0 for lvl in RISK_LEVELS}
        by_status = {st: 0 for st in COMMENT_STATUSES}
        rows = conn.execute(
            "SELECT c.risk_level, c.status FROM comments c"
            " JOIN versions v ON c.version_id=v.id WHERE v.material_id=?",
            (mid,),
        ).fetchall()
        for r in rows:
            by_risk[r["risk_level"]] = by_risk.get(r["risk_level"], 0) + 1
            by_status[r["status"]] = by_status.get(r["status"], 0) + 1
        total = len(rows)
        unresolved = by_status.get("open", 0)
        weights = {"low": 1, "medium": 2, "high": 4, "critical": 8}
        score = sum(weights.get(r["risk_level"], 0) for r in rows
                    if r["status"] in ("open", "accepted"))
        return {
            "material_id": mid,
            "total_comments": total,
            "by_risk": by_risk,
            "by_status": by_status,
            "open_comments": unresolved,
            "risk_score": score,
        }

    # -- validation helpers ------------------------------------------------- #
    def _int(self, value, what):
        try:
            return int(value)
        except (TypeError, ValueError):
            raise ApiError(400, "非法的 %s" % what)

    def _require(self, body, key):
        val = body.get(key)
        if val is None or str(val).strip() == "":
            raise ApiError(400, "缺少必填字段: %s" % key)
        return str(val).strip()

    def _enum(self, body, key, allowed, default):
        """校验枚举字段：字段缺失（键不存在或为 None）时返回默认值；
        字段一旦出现，就必须是 allowed 中的合法值，否则报 400，
        避免空串 / 0 / 错误值被静默替换成默认值。"""
        if key not in body or body[key] is None:
            return default
        val = body[key]
        if not isinstance(val, str):
            raise ApiError(400, "字段 %s 必须是字符串" % key)
        val = val.strip()
        if val not in allowed:
            raise ApiError(400, "非法的 %s: '%s'，可选值：%s"
                           % (key, val, "、".join(sorted(allowed))))
        return val

    def _ensure_material(self, conn, mid):
        if not conn.execute("SELECT 1 FROM materials WHERE id=?", (mid,)).fetchone():
            raise ApiError(404, "材料不存在")

    def _ensure_version(self, conn, vid):
        if not conn.execute("SELECT 1 FROM versions WHERE id=?", (vid,)).fetchone():
            raise ApiError(404, "版本不存在")


def main():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("评审材料协作室 后端已启动: http://127.0.0.1:%d" % PORT)
    print("数据库: %s" % DB_PATH)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n后端已停止")
        server.shutdown()


if __name__ == "__main__":
    main()
