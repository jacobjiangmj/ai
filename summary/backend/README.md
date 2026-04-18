# 后端总结

## 角色定位

后端是整个项目的数据入口和聚合层，负责：

- 连接 GitLab API
- 拉取最近 30 天流水线作业数据
- 将数据落到 SQLite
- 提供前端筛选项和图表数据接口

## 目录结构

- `config/`：Django 项目配置
- `gallery/`：核心业务应用
- `db.sqlite3`：本地数据库
- `media/`：媒体目录
- `requirements.txt`：Python 依赖
- `manage.py`：Django 管理入口

## 关键文件职责

### `config/settings.py`

- 配置 Django 基础设置
- 使用 SQLite 作为默认数据库
- 开启全量 CORS
- 从环境变量中读取 GitLab 连接配置

关键环境变量：

- `GITLAB_BASE_URL`
- `GITLAB_PROJECT_PATH`
- `GITLAB_PRIVATE_TOKEN`

### `config/urls.py`

- 将 `/api/` 路由转发到 `gallery.urls`

### `gallery/models.py`

定义两张核心表：

- `Pipeline`：保存流水线主信息，如 pipeline id、分支、状态、时间、链接
- `PipelineJob`：保存作业信息，如 job id、阶段、名称、耗时、开始结束时间、链接

其中 `PipelineJob` 建有：

- `stage + name` 联合索引方向的查询优化
- `started_at` 时间维度查询优化

### `gallery/services.py`

核心职责是和 GitLab API 通信：

- 校验 token 是否存在
- 根据 `project_path` 获取项目 ID
- 分页拉取 job 数据
- 截断到最近 30 天
- 用 `update_or_create` 落库，避免重复写入

这里的存储策略比较直接：

- 先根据 job 中携带的 pipeline 信息更新 `Pipeline`
- 再更新或创建 `PipelineJob`

### `gallery/views.py`

这里承担了两部分工作：

- 请求参数解析与校验
- 数据聚合与 JSON 输出

`PipelineJobQueryService` 是查询逻辑中心，负责：

- 解析多选筛选参数
- 解析开始和结束时间
- 限定默认只查最近 30 天且耗时不为空的数据
- 生成筛选项 payload
- 生成按日期聚合的图表数据
- 生成按 job id 展开的图表数据

主要视图：

- `GitLabSyncView`：执行同步
- `FilterOptionsView`：返回阶段、作业名和映射关系
- `DurationDashboardView`：按日期返回平均耗时曲线
- `JobIdDashboardView`：按作业 ID 返回耗时曲线

### `gallery/urls.py`

提供四个接口：

- `gitlab/sync/`
- `gitlab/filters/`
- `gitlab/durations/`
- `gitlab/job-ids/`

## 数据模型理解

`Pipeline` 和 `PipelineJob` 是一对多关系：

- 一个流水线对应多个作业
- 图表展示主要基于 `PipelineJob`

在看板场景里，真正被频繁使用的是这些字段：

- `stage`
- `name`
- `duration`
- `started_at`
- `job_id`
- `web_url`

## 后端对前端输出的数据形态

筛选接口输出：

- 所有阶段列表
- 所有作业名列表
- 阶段到作业名的映射
- `maxCharts` 等限制信息
- GitLab 配置状态摘要

图表接口输出：

- `results`：图表数组
- `filters`：当前生效筛选条件回显

每个图表对象大致包含：

- `stage`
- `job_name`
- `average_duration`
- `run_count`
- `points`

## 设计特点

- 查询逻辑集中在 `PipelineJobQueryService`，结构相对清晰
- 同步逻辑与查询逻辑分离，便于理解
- 图表接口直接返回前端可消费的结构，前端无需二次聚合
- 以本地运行和快速交付为优先，没有引入复杂任务队列或缓存层

## 当前限制

- 同步只抓取成功作业：`scope[]=success`
- 默认窗口固定在最近 30 天
- 单次图表结果最多返回前 8 组 stage/name 组合
- 没有认证、权限控制和更细的错误分层
- `csrf_exempt` 直接用于同步接口，更适合开发环境而不是生产环境

## 适合后续扩展的方向

- 增加定时同步或异步任务
- 支持更多 job 状态维度
- 增加分页与排序控制
- 增加项目切换或多项目聚合
- 为生产环境补齐安全配置和部署配置
