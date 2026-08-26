# 评审材料协作室（Review Room）

一个用于项目组内部评审的全栈小系统：把**材料、版本、评论、处理结论、审计事件**放在一起管理，
支持风险筛选、处理时间线和完整的评审流转。

- 前端：React（浏览器内 Babel 编译，依赖已内置，**无需 npm 安装**），监听 **18130** 端口
- 后端：Python 标准库（`http.server` + `sqlite3`，**无需 pip 安装**），监听 **18131** 端口
- 存储：SQLite，保存材料、版本、评论、处理记录、审计事件

## 目录结构

```
react-python-review-room/
├── backend/
│   ├── server.py          # 后端 API 服务（端口 18131）
│   └── review_room.db     # SQLite 数据库（首次启动自动创建）
├── frontend/
│   ├── serve.py           # 前端静态资源服务（端口 18130）
│   ├── index.html         # 页面入口
│   ├── app.jsx            # React 应用主体
│   ├── styles.css         # 样式
│   └── vendor/            # 内置的 React / ReactDOM / Babel（离线可用）
└── README.md
```

## 数据库位置

SQLite 数据库文件为 `backend/review_room.db`，由后端首次启动时自动创建并建表。
删除该文件即可清空所有数据、重新开始。

数据表：
- `materials` 材料：标题、来源团队、材料类型、摘要
- `versions` 版本：版本号、变更说明、正文摘要（隶属某份材料）
- `comments` 评论：评论人、位置描述、内容、风险级别、状态（绑定到某个版本）
- `dispositions` 处理记录：处理人、动作、结论说明（隶属某份材料）
- `audit_events` 审计事件：对以上写操作自动留痕

约束：
- 评论状态 `status` ∈ `open`（待处理）/ `accepted`（已采纳）/ `rejected`（已驳回）/ `resolved`（已解决）
- 风险级别 `risk_level` ∈ `low` / `medium` / `high` / `critical`

## 如何启动

需要环境：Python 3（3.6+，标准库即可）。前端依赖已内置，无需 Node/npm。

### 1. 启动后端（端口 18131）

```bash
cd backend
python3 server.py
```

看到 `评审材料协作室 后端已启动: http://127.0.0.1:18131` 即成功。

### 2. 启动前端（端口 18130）

新开一个终端：

```bash
cd frontend
python3 serve.py
```

然后在浏览器打开：**http://127.0.0.1:18130/index.html**

> 前端通过 `http://127.0.0.1:18131/api` 访问后端。若修改了后端地址/端口，
> 请同步修改 `frontend/app.jsx` 顶部的 `API` 常量。

## 前端功能

- **材料列表**（左栏）：展示所有材料及版本数、待处理评论数；顶部“+ 新建”内嵌创建表单
- **版本详情**（中栏）：每份材料的版本卡片，展开查看变更说明、正文摘要与评论
- **评论面板**：在版本下新增评论（评论人、位置、内容、风险级别），并可切换评论状态
- **风险筛选**：按风险级别 / 状态过滤评论
- **风险摘要**：各风险级别计数、待处理数量与风险指数进度条
- **处理记录时间线**（右栏“处理记录”）：材料的处理动作与结论按时间展示
- **审计事件**（右栏“审计事件”）：材料相关的所有写操作留痕
- **创建表单**：材料、版本、评论、处理记录均有内嵌表单

## 后端 API 一览

基础前缀：`http://127.0.0.1:18131/api`

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/health` | 健康检查 |
| GET | `/materials` | 材料列表（含版本数、待处理评论数） |
| POST | `/materials` | 创建材料（`title`*、`source_team`*、`material_type`*、`summary`） |
| GET | `/materials/{id}` | 材料详情（内嵌版本、每个版本的评论、风险摘要） |
| GET | `/materials/{id}/versions` | 版本列表 |
| POST | `/materials/{id}/versions` | 新增版本（`version_no`*、`change_note`、`body_summary`） |
| GET | `/materials/{id}/dispositions` | 处理记录列表 |
| POST | `/materials/{id}/dispositions` | 新增处理记录（`actor`*、`action`*、`note`） |
| GET | `/materials/{id}/audit` | 该材料的审计事件 |
| GET | `/materials/{id}/risk-summary` | 该材料的风险摘要 |
| GET | `/versions/{id}` | 版本详情（含评论） |
| GET | `/versions/{id}/comments` | 评论列表（支持 `?risk_level=` `?status=` 过滤） |
| POST | `/versions/{id}/comments` | 新增评论（`reviewer`*、`content`*、`location`、`risk_level`、`status`） |
| GET | `/comments/{id}` | 评论详情 |
| PATCH | `/comments/{id}` | 更新评论（`status` / `risk_level` / `content` / `location` / `reviewer`） |
| GET | `/audit` | 全局审计事件（支持 `?entity_type=` `?limit=`） |

（\* 为必填字段）

## 完整评审流程示例

1. **创建材料**：在左栏点击“+ 新建”，填写标题、来源团队、材料类型、摘要，提交后材料出现在列表中。
2. **新增版本**：选中材料，在中栏点击“+ 新增版本”，填写版本号（如 `v1.0`）、变更说明、正文摘要。
3. **提交评论**：展开版本卡片，点击“+ 新增评论”，填写评论人、位置描述、内容并选择风险级别；
   评论默认状态为 `open`（待处理）。
4. **风险筛选与研判**：使用中栏的风险 / 状态下拉筛选评论，结合上方风险摘要了解整体风险分布与风险指数。
5. **流转评论状态**：对每条评论点击“标记为已采纳 / 已驳回 / 已解决”，状态实时更新，风险摘要随之刷新。
6. **登记处理结论**：在右栏“处理记录”点击“+ 处理”，选择处理动作（退回修改 / 通过评审 / 有条件通过 等）
   并填写结论说明，形成处理时间线。
7. **查看审计**：切换到右栏“审计事件”，可看到创建材料、新增版本、提交/更新评论、处理记录等全部操作留痕。

## 命令行快速验证（可选）

```bash
B=http://127.0.0.1:18131/api
curl -s $B/health
# 创建材料
curl -s -X POST $B/materials -d '{"title":"上线方案","source_team":"数据组","material_type":"设计文档","summary":"整体方案"}'
# 新增版本（假设材料 id=1）
curl -s -X POST $B/materials/1/versions -d '{"version_no":"v1.0","change_note":"初稿","body_summary":"含风险评估"}'
# 提交评论（假设版本 id=1）
curl -s -X POST $B/versions/1/comments -d '{"reviewer":"李雷","location":"第3章","content":"缺少容量估算","risk_level":"high"}'
# 更新评论状态
curl -s -X PATCH $B/comments/1 -d '{"status":"accepted"}'
# 风险摘要 / 处理记录 / 审计
curl -s $B/materials/1/risk-summary
curl -s -X POST $B/materials/1/dispositions -d '{"actor":"张三","action":"退回修改","note":"补充后再评"}'
curl -s $B/materials/1/audit
```

## 说明

- 后端使用可重入锁串行化数据库写操作，SQLite 单文件存储，适合小规模内部评审场景。
- 前端为纯静态资源 + 浏览器内 Babel 编译，改动 `app.jsx` 后刷新页面即可生效（已禁用缓存）。
