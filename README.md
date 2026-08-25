# 评审材料协作室 (Review Room)

一个全栈内部评审协作系统，支持材料管理、版本控制、评论协作、风险筛选、处理记录时间线和审计追溯。

- **前端**：React + Vite，运行在 `http://localhost:18130`
- **后端**：Python Flask，运行在 `http://localhost:18131`
- **数据库**：SQLite，文件位于 `backend/data/review_room.db`

## 目录结构

```
react-python-review-room/
├── backend/                  # Python Flask 后端
│   ├── app.py                # API 路由与业务逻辑
│   ├── db.py                 # 数据库初始化与连接
│   ├── requirements.txt      # Python 依赖
│   └── data/                 # SQLite 数据库（首次运行自动创建）
│       └── review_room.db
├── frontend/                 # React 前端
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── index.css
│       ├── MaterialDetail.jsx
│       ├── CreateMaterialForm.jsx
│       ├── VersionForm.jsx
│       ├── VersionPanel.jsx
│       ├── CommentForm.jsx
│       ├── CommentPanel.jsx
│       ├── RecordForm.jsx
│       ├── Timeline.jsx
│       ├── RiskSummary.jsx
│       └── AuditPanel.jsx
└── README.md
```

## 快速启动

### 1. 启动后端

```bash
cd backend

# 建议使用虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务（首次启动自动创建数据库和表）
python app.py
```

后端将在 `http://localhost:18131` 启动。

### 2. 启动前端

打开另一个终端：

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端将在 `http://localhost:18130` 启动。

Vite 已配置代理，所有 `/api/*` 请求会自动转发到后端 `http://localhost:18131`。

### 3. 访问

浏览器打开 `http://localhost:18130` 即可使用。

## 数据库说明

- 数据库类型：SQLite 3
- 文件位置：`backend/data/review_room.db`（首次启动后端时自动创建）
- 包含 5 张表：
  - `materials`：材料（标题、来源团队、类型、摘要）
  - `versions`：版本（版本号、变更说明、正文摘要，关联材料）
  - `comments`：评论（评论人、位置、内容、风险级别、状态，可绑定版本）
  - `processing_records`：处理记录（动作、处理人、说明、时间）
  - `audit_events`：审计事件（实体类型、操作、操作人、详情、时间）

如需重置数据，停止后端后删除 `backend/data/review_room.db`，重新启动后端即可。

## API 接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/materials?search=&risk=` | 材料列表（支持关键词和风险筛选） |
| POST | `/api/materials` | 创建材料 |
| GET | `/api/materials/:id` | 材料详情（含版本、评论、处理记录） |
| PUT | `/api/materials/:id` | 更新材料 |
| GET | `/api/materials/:id/versions` | 材料的版本列表 |
| POST | `/api/materials/:id/versions` | 新增版本 |
| GET | `/api/versions/:id` | 版本详情（含该版本的评论） |
| GET | `/api/comments?material_id=&version_id=&status=&risk_level=` | 评论列表（支持筛选） |
| POST | `/api/comments` | 创建评论 |
| PUT | `/api/comments/:id` | 更新评论（状态/风险级别等） |
| GET | `/api/materials/:id/records` | 材料的处理记录 |
| POST | `/api/materials/:id/records` | 新增处理记录 |
| GET | `/api/audit?entity_type=&entity_id=&limit=` | 审计事件查询 |
| GET | `/api/risk-summary?material_id=` | 风险摘要统计 |

## 完整评审流程

1. **创建材料**：点击右上角"创建材料"，填写标题、来源团队、材料类型和摘要。

2. **新增版本**：进入材料详情，点击"+ 版本"，填写版本号（如 v1.0）、变更说明和正文摘要。每份材料可以有多个版本。

3. **提交评论**：在"评论面板"标签页点击"+ 评论"，评论可绑定到特定版本，填写评论人、位置描述（如"第3章第2节"）、内容，并选择风险级别（低/中/高/严重）。

4. **风险筛选**：在评论面板顶部可按风险级别和状态筛选评论；在材料列表页也可按是否包含某风险级别评论筛选材料。

5. **处理评论**：对每条评论点击"更新状态/风险"，将状态从 `open`（待处理）更新为：
   - `accepted`（已采纳）— 接受意见并将修订
   - `rejected`（已驳回）— 不采纳该意见
   - `resolved`（已解决）— 问题已处理完成

6. **记录处理结论**：在"处理记录"标签页点击"+ 添加记录"，选择动作类型（开始评审/评审通过/评审驳回/要求修订/提交修订/评论已解决/升级处理/关闭材料等），填写处理人和说明。处理记录按时间线展示。

7. **审计追溯**：在"审计事件"标签页可查看该材料的所有操作记录，包括创建、更新、评论状态变更等。

8. **风险概览**：在评论面板顶部可查看按风险级别统计的评论数量和待处理数量。

## 评论状态流转

```
open（待处理）
  ├── accepted（已采纳）
  ├── rejected（已驳回）
  └── resolved（已解决）
```

## 技术栈

- 前端：React 18、Vite 5、原生 CSS
- 后端：Python 3、Flask 3、Flask-CORS
- 数据库：SQLite 3
