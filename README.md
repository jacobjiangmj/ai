# Django + Vue3 + ECharts GitLab 流水线耗时看板

这是一个前后端分离的本地可运行示例项目，当前包含两块前端内容：

- GitLab 流水线作业耗时看板
- 一个独立的 `/xiangqi` 中国象棋本地对弈页

核心职责如下：

- Django 负责从 GitLab 拉取最近 30 天流水线作业数据并存入 SQLite
- Vue 3 负责调用后端接口、管理筛选条件并渲染图表
- ECharts 负责展示作业耗时曲线和 30 天平均值

## 目录结构

```text
backend/   Django 后端、GitLab 同步逻辑、SQLite 数据
frontend/  Vue3 + Vite 前端
summary/   项目总结文档
start.ps1  Windows 一键启动脚本
```

## 项目总结

- 总览：`summary/README.md`
- 后端：`summary/backend/README.md`
- 前端：`summary/frontend/README.md`

## 配置 GitLab 环境变量

后端通过环境变量连接 GitLab：

```bash
export GITLAB_BASE_URL="http://git.aeroht.local"
export GITLAB_PROJECT_PATH="ht_adc/cicd/manifest"
export GITLAB_PRIVATE_TOKEN="你的 GitLab Token"
```

其中 `GITLAB_PRIVATE_TOKEN` 是同步接口工作的必要条件。

## 启动方式

### 方式一：分别启动前后端

启动后端：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

后端地址：`http://127.0.0.1:8000`

启动前端：

```bash
cd frontend
npm install
npm run dev
```

前端地址：`http://127.0.0.1:5173`

如果前端直接使用默认配置，请确认 `VITE_BACKEND_BASE_URL` 与实际后端端口一致。

### 方式二：Windows 一键启动

根目录提供了 `start.ps1`，会自动执行：

- 安装后端依赖
- 安装前端依赖
- 执行数据库迁移
- 清理占用端口的旧进程
- 启动后端和前端

脚本默认使用：

- 后端：`http://127.0.0.1:18001`
- 前端：`http://127.0.0.1:5173`

执行方式：

```powershell
./start.ps1
```

## 接口

1. `POST /api/gitlab/sync/`
2. `GET /api/gitlab/filters/`
3. `GET /api/gitlab/durations/?stage=&job_name=&search=&start_at=&end_at=`
4. `GET /api/gitlab/job-ids/?stage=&job_name=&search=&start_at=&end_at=`

## 页面能力

看板页支持：

- 按阶段筛选
- 按作业名筛选
- 按作业关键字搜索
- 按时间范围过滤
- 快捷时间范围与自定义时间输入
- 单页最多展示 8 组图表
- 按日期耗时看板
- 按作业 ID 耗时看板
- 作业 ID 模式点击点位跳转 GitLab 作业页
- 筛选条件自动保存到本地存储

附加页面：

- `/xiangqi`：本地双人中国象棋页面，包含走法校验、将军判断和终局判定
