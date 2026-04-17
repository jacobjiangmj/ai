# Django + Vue3 + ECharts GitLab 流水线耗时看板

这是一个前后端分离的最小可运行示例：

- Django 负责从 GitLab 拉取 30 天内流水线作业数据并存入 SQLite
- Vue3 只负责调用后端接口并展示图表
- ECharts 按阶段和作业名分类展示作业耗时，并显示平均值

## 目录结构

```text
backend/   Django 后端与 SQLite
frontend/  Vue3 + Vite 前端
```

## 1. 启动后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

后端地址：`http://127.0.0.1:8000`

## 2. 配置 GitLab 环境变量

后端通过环境变量连接 GitLab：

```bash
export GITLAB_BASE_URL="http://git.aeroht.local"
export GITLAB_PROJECT_PATH="ht_adc/cicd/manifest"
export GITLAB_PRIVATE_TOKEN="你的 GitLab Token"
```

## 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端地址：`http://127.0.0.1:5173`

## 接口

1. `POST /api/gitlab/sync/`
2. `GET /api/gitlab/filters/`
3. `GET /api/gitlab/durations/?stage=&job_name=&search=&start_date=&end_date=`

## 页面能力

- 按阶段筛选
- 按作业名筛选
- 按作业关键字搜索
- 按开始/结束日期过滤
- 单页最多展示 8 个作业图表
- 每个图表同时展示日均耗时和 30 天平均值
