# 评审材料协作室（react-python-review-room）

面向项目组内部材料评审的全栈小系统：把**材料、版本、评论、处理结论、审计事件**放在一起管理。
前端 React（Vite）监听 **18130** 端口，后端 Python（Flask）监听 **18131** 端口，数据保存在 SQLite。

首次启动会自动建表并写入一套演示数据（「支付系统重构技术方案」，含 2 个版本、4 条评论和完整处理记录），方便直接体验。

## 目录结构

```
react-python-review-room/
├── backend/
│   ├── app.py               # Flask 后端：建表、种子数据、全部 API
│   ├── requirements.txt     # Python 依赖
│   └── review.db            # SQLite 数据库（首次启动自动生成）
├── frontend/
│   ├── package.json
│   ├── vite.config.js       # 端口 18130，/api 代理到 18131
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx          # 材料列表、风险摘要、新建材料表单
│       ├── MaterialDetail.jsx  # 版本侧栏、评论面板、风险筛选、时间线、审计
│       ├── api.js           # API 封装与枚举/文案
│       └── styles.css
└── README.md
```

## 环境要求

- Python 3.9+（依赖 Flask、flask-cors）
- Node.js 18+（Vite 5）

## 启动方式

需要分别启动后端和前端，各开一个终端。

### 1. 启动后端（端口 18131）

```bash
cd backend
pip3 install -r requirements.txt   # 首次运行
python3 app.py
```

看到 `Running on http://127.0.0.1:18131` 即启动成功。
健康检查：`curl http://localhost:18131/api/health`

### 2. 启动前端（端口 18130）

```bash
cd frontend
npm install                        # 首次运行
npm run dev
```

浏览器打开 **http://localhost:18130** 即可使用。
前端开发服务器会把 `/api/*` 请求代理到 `http://localhost:18131`，无需额外配置跨域。

## 数据库位置

- SQLite 文件：`backend/review.db`（后端启动时自动创建，删除该文件后重启即可重置为演示数据）

包含 5 张表：

| 表 | 说明 |
| --- | --- |
| `materials` | 材料：标题、来源团队、材料类型、摘要、创建人、状态 |
| `versions` | 版本：所属材料、版本号、变更说明、正文摘要、提交人 |
| `comments` | 评论：绑定到具体版本，含评论人、位置描述、内容、风险级别、状态 |
| `handling_records` | 处理记录：每次评论提交/采纳/驳回/解决/重开都留痕，含操作人和说明 |
| `audit_events` | 审计事件：材料创建、版本新增、评论提交、评论状态变更的完整日志 |

**评论状态**：`open`（待处理）→ `accepted`（已采纳）/ `rejected`（已驳回）→ `resolved`（已解决），任意非待处理状态可「重新讨论」重开。
**风险级别**：`low`（低）、`medium`（中）、`high`（高）、`critical`（严重）。

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/meta` | 枚举元数据（材料类型、风险级别、评论状态） |
| GET | `/api/materials` | 材料列表（含版本数、评论数、待处理数、最高风险） |
| POST | `/api/materials` | 创建材料（标题/来源团队/材料类型/摘要） |
| GET | `/api/materials/:id` | 材料详情（含全部版本与评论） |
| POST | `/api/materials/:id/versions` | 新增版本（版本号留空自动编号 vN.0） |
| POST | `/api/versions/:id/comments` | 对某版本发表评论（含风险级别） |
| PATCH | `/api/comments/:id` | 变更评论状态，自动写处理记录 + 审计事件 |
| GET | `/api/materials/:id/timeline` | 处理记录时间线（含评论上下文） |
| GET | `/api/audit?material_id=&event_type=&entity_type=` | 审计事件查询 |
| GET | `/api/risk-summary?material_id=` | 风险摘要（按风险级别/状态聚合，可按材料过滤） |

## 完整评审流程

1. **创建材料**：列表页点「+ 新建材料」，填写标题、来源团队、材料类型（需求文档/设计方案/技术规范/测试报告/合同文本/其他）和摘要。
2. **新增版本**：进入材料详情，在左侧「版本列表」点「+ 新版本」，填写版本号（可留空自动编号）、变更说明和正文摘要。评审意见驱动的修改通过新版本沉淀。
3. **发表评论**：选中某个版本，在「评论面板」点「+ 发表评论」，填写评论人、位置描述（如「第3章 服务拆分」）、评论内容和风险级别。评论自动绑定到当前版本，状态为「待处理」。
4. **风险筛选**：评论面板顶部可按低/中/高/严重风险筛选，也可按评论状态筛选；列表页和详情页顶部的风险摘要条实时汇总待处理风险。
5. **处理结论**：在评论卡片上点「采纳」「驳回」「直接解决」，可填写处理说明。状态流转为：待处理 → 已采纳/已驳回 → 已解决，也可「重新讨论」重开。每次操作自动写入处理记录和审计事件。
6. **跟踪进度**：
   - 「处理记录时间线」标签页：按时间倒序查看每次提交、采纳、驳回、解决的操作人、状态流转、处理说明和对应评论内容；
   - 「审计日志」标签页：查看材料创建、版本新增、评论提交、状态变更的完整事件流；
   - 全部评论关闭后，摘要条出现「✅ 全部评论已关闭」。
7. 列表页卡片展示每份材料的版本数、评论数、待处理数和最高风险，便于排评审优先级。

## 常用维护

- 重置数据：停止后端 → 删除 `backend/review.db` → 重新 `python3 app.py`
- 前端构建：`cd frontend && npm run build`（产物在 `frontend/dist`）
