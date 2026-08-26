# react-python-review-room

项目介绍：评审材料协作室，支持前端整理材料、提交评论、后端保存版本和处理记录，覆盖 React、Python、SQLite、状态流转和跨模块联动。

## 目录结构

```
backend/    Flask API 服务（端口 18131）
  app.py          全部接口与建表逻辑
  review_room.db  SQLite 数据库（首次启动自动生成）
frontend/   React + Vite 前端（端口 18130）
  src/App.jsx     页面：材料列表 / 版本详情 / 评论面板 / 风险摘要 / 时间线 / 创建表单
  src/api.js      API 封装
```

## 启动方式

### 后端（端口 18131）

```bash
cd backend
python3 app.py
```

依赖：Python 3.9+、Flask（`pip3 install flask`）。首次启动会自动创建数据库并完成建表。

### 前端（端口 18130）

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:18130/ 。Vite 已将 `/api` 代理到 `http://localhost:18131`，需先启动后端。

## 数据库位置与表结构

数据库文件：`backend/review_room.db`（SQLite，后端启动时自动初始化）。

| 表 | 说明 |
| --- | --- |
| `materials` | 材料：标题、来源团队、材料类型、摘要 |
| `versions` | 版本：版本号、变更说明、正文摘要，同一材料下版本号唯一 |
| `comments` | 评论：评论人、位置描述、内容、风险级别（low/medium/high/critical）、状态（open/accepted/rejected/resolved） |
| `dispositions` | 处理记录：评论状态从 X 变为 Y 的操作人、处理意见、时间 |
| `audit_events` | 审计事件：材料/版本/评论的创建与状态变更全量留痕 |

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET / POST | `/api/materials` | 材料列表（含版本/评论计数）/ 创建材料 |
| GET | `/api/materials/<id>` | 材料详情（含版本列表） |
| POST | `/api/materials/<id>/versions` | 新增版本 |
| GET | `/api/versions/<id>` | 版本详情（含评论） |
| GET | `/api/comments` | 评论查询，支持 `material_id` `version_id` `risk_level` `status` 过滤 |
| POST | `/api/versions/<id>/comments` | 新增评论（初始状态 open） |
| PATCH | `/api/comments/<id>/status` | 评论状态流转，自动生成处理记录与审计事件 |
| GET | `/api/dispositions` | 处理记录，支持 `material_id` `comment_id` 过滤 |
| GET | `/api/audits` | 审计事件查询，支持 `entity_type` `entity_id` 过滤 |
| GET | `/api/risk-summary` | 风险摘要（按风险级别 × 状态计数），支持 `material_id` |

## 完整评审流程

1. **创建材料**：首页左栏表单填写标题、来源团队、材料类型、摘要。
2. **新增版本**：选中材料后，在版本栏填写版本号（如 v1.0）、变更说明、正文摘要。
3. **提交评论**：选中版本后，在评论面板填写评论人、位置描述、内容，选择风险级别，初始状态为 open。
4. **风险筛选**：评论面板顶部可按风险级别、状态组合筛选。
5. **处理评论**：在评论卡片上点击「标记为已接受 / 已拒绝 / 已解决」，填写处理意见；每次流转写入 `dispositions` 并生成审计事件。典型流转：open → accepted → resolved，或 open → rejected。
6. **查看结论**：右栏展示该材料的风险摘要表（各级别 × 各状态计数）与处理记录时间线；所有操作可通过 `/api/audits` 追溯。

如需重置数据，停止后端后删除 `backend/review_room.db`，重启即可重建空库。
