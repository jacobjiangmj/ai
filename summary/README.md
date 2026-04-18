# 项目总结

## 项目定位

这是一个前后端分离的小型示例项目，核心目标是把 GitLab 最近 30 天的流水线作业数据拉取到本地，并通过可视化看板展示作业耗时变化。

项目当前同时包含两块前端能力：

- GitLab 流水线耗时看板
- 一个独立的中国象棋本地对弈页面

## 技术栈

- 后端：Django 4 + SQLite + requests + django-cors-headers
- 前端：Vue 3 + Vite + ECharts
- 启动脚本：PowerShell（`start.ps1`）

## 当前架构

- `backend/`：Django 服务，负责 GitLab 数据同步、数据库存储、筛选和图表接口
- `frontend/`：Vue 单页应用，负责筛选交互、图表渲染和象棋页面
- `start.ps1`：Windows 下的一键安装依赖、迁移数据库、启动前后端脚本
- `summary/`：项目总结文档

## 核心业务流

1. 前端调用 `POST /api/gitlab/sync/`。
2. 后端读取 GitLab 环境变量并请求 GitLab API。
3. 后端把流水线和作业信息写入 SQLite。
4. 前端调用筛选接口和图表接口获取聚合结果。
5. ECharts 将作业耗时按日期或按作业 ID 渲染为折线图。

## 已实现能力

- 同步 GitLab 最近 30 天成功作业数据
- 保存流水线与作业记录到本地 SQLite
- 提供阶段、作业名、关键字、时间范围筛选
- 支持两种图表模式：按日期耗时、按作业 ID 耗时
- 图表支持展示 30 天平均值
- 前端自动保存筛选偏好到本地存储
- 作业 ID 模式下支持点击点位跳转 GitLab 作业页面
- 提供独立的 `/xiangqi` 中国象棋本地对弈页面

## 接口概览

- `POST /api/gitlab/sync/`：同步 GitLab 数据
- `GET /api/gitlab/filters/`：获取筛选项与前端限制配置
- `GET /api/gitlab/durations/`：返回按日期聚合的耗时图表数据
- `GET /api/gitlab/job-ids/`：返回按作业 ID 展开的耗时图表数据

## 运行方式

常规方式：

- 启动 Django 后端
- 配置 `GITLAB_BASE_URL`、`GITLAB_PROJECT_PATH`、`GITLAB_PRIVATE_TOKEN`
- 启动前端 Vite 服务

Windows 便捷方式：

- 直接执行根目录 `start.ps1`
- 脚本会安装依赖、执行迁移、清理占用端口并启动前后端

## 目录阅读建议

- 看整体：先读 `summary/README.md`
- 看后端：读 `summary/backend/README.md`
- 看前端：读 `summary/frontend/README.md`

## 当前特点与注意点

- 项目以演示和快速落地为主，配置较宽松，如 `DEBUG=True`、`ALLOWED_HOSTS=["*"]`、`CORS_ALLOW_ALL_ORIGINS=True`
- 默认数据库为 SQLite，适合本地开发和演示
- GitLab Token 是运行关键前置条件，没有 token 时同步接口无法工作
- 仓库中已存在构建产物、日志和依赖目录，说明当前更偏向本地直接运行而非精简分发
