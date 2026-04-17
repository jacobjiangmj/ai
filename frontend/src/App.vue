<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'

const backendBase = 'http://127.0.0.1:8000'
const maxCharts = 8
const preferenceStorageKey = 'gitlab-dashboard-preferences'
const dashboardType = ref('job-id')
const openSelector = ref('')
const timeRange = ref('last-30-days')
const selectorKeyword = reactive({
  stage: '',
  job_name: '',
})
const searchSelectionSnapshot = reactive({
  stage: null,
  job_name: null,
})

const timeRangeOptions = [
  { label: '今天', value: 'today' },
  { label: '三天内', value: 'last-3-days' },
  { label: '7天内', value: 'last-7-days' },
  { label: '30天内', value: 'last-30-days' },
  { label: '自定义', value: 'custom' },
]
const hourOptions = Array.from({ length: 24 }, (_, index) => `${index}`.padStart(2, '0'))
const minuteOptions = Array.from({ length: 60 }, (_, index) => `${index}`.padStart(2, '0'))

function createDefaultSelectorKeyword() {
  return {
    stage: '',
    job_name: '',
  }
}

const dashboardOptions = [
  { label: '按日期耗时看板', value: 'duration' },
  { label: '按作业 ID 看板', value: 'job-id' },
]

const loading = ref(false)
const syncing = ref(false)
const errorMessage = ref('')
const charts = ref([])
const filterOptions = ref({ stages: [], jobs: [], stage_job_map: {}, limits: { maxCharts }, config: { hasToken: false } })
const chartRefs = ref([])
const chartInstances = new Map()

const filters = reactive(createDefaultFilters())

function createDefaultFilters() {
  const { start, end } = buildDateRange('last-30-days')

  return {
    stage: [],
    job_name: [],
    search: '',
    start_at: formatDateTimeLocal(start),
    end_at: formatDateTimeLocal(end),
  }
}

function formatDateTimeLocal(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

function formatDisplayDateTime(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')

  return `${year}/${month}/${day} ${hour}:${minute}`
}

function extractDatePart(value) {
  if (!value) {
    return ''
  }
  return value.split('T')[0] || ''
}

function extractTimePart(value) {
  if (!value || !value.includes('T')) {
    return ''
  }
  return value.split('T')[1].slice(0, 5)
}

function extractHourPart(value) {
  const time = extractTimePart(value)
  return time ? time.split(':')[0] : ''
}

function extractMinutePart(value) {
  const time = extractTimePart(value)
  return time ? time.split(':')[1] : ''
}

function defaultTimeForKey(key) {
  return key === 'end_at' ? '23:59' : '00:00'
}

function updateDatePart(key, nextDate) {
  if (!nextDate) {
    filters[key] = ''
    return
  }

  const time = extractTimePart(filters[key]) || defaultTimeForKey(key)
  filters[key] = `${nextDate}T${time}`
}

function updateTimePart(key, type, nextValue) {
  const date = extractDatePart(filters[key])
  if (!date) {
    return
  }

  const currentHour = extractHourPart(filters[key]) || defaultTimeForKey(key).split(':')[0]
  const currentMinute = extractMinutePart(filters[key]) || defaultTimeForKey(key).split(':')[1]
  const hour = type === 'hour' ? nextValue : currentHour
  const minute = type === 'minute' ? nextValue : currentMinute
  filters[key] = `${date}T${hour}:${minute}`
}

function buildDateRange(range) {
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 0, 0)

  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  if (range === 'today') {
    return { start, end }
  }

  const days = {
    'last-3-days': 2,
    'last-7-days': 6,
    'last-30-days': 29,
  }[range]

  if (typeof days === 'number') {
    start.setDate(start.getDate() - days)
  }

  return { start, end }
}

function applyTimeRange(range) {
  timeRange.value = range

  if (range === 'custom') {
    return
  }

  const { start, end } = buildDateRange(range)
  filters.start_at = formatDateTimeLocal(start)
  filters.end_at = formatDateTimeLocal(end)
}

function loadPreferences() {
  const defaults = createDefaultFilters()
  const selectorDefaults = createDefaultSelectorKeyword()

  try {
    const raw = localStorage.getItem(preferenceStorageKey)
    if (!raw) {
      Object.assign(filters, defaults)
      Object.assign(selectorKeyword, selectorDefaults)
      dashboardType.value = 'job-id'
      return
    }

    const saved = JSON.parse(raw)
    filters.stage = Array.isArray(saved.stage) ? saved.stage : defaults.stage
    filters.job_name = Array.isArray(saved.job_name) ? saved.job_name : defaults.job_name
    filters.search = typeof saved.search === 'string' ? saved.search : defaults.search
    filters.start_at = typeof saved.start_at === 'string' && saved.start_at ? saved.start_at : defaults.start_at
    filters.end_at = typeof saved.end_at === 'string' && saved.end_at ? saved.end_at : defaults.end_at
    timeRange.value = typeof saved.timeRange === 'string' ? saved.timeRange : 'last-30-days'
    selectorKeyword.stage = typeof saved.selector_stage_keyword === 'string' ? saved.selector_stage_keyword : selectorDefaults.stage
    selectorKeyword.job_name = typeof saved.selector_job_name_keyword === 'string' ? saved.selector_job_name_keyword : selectorDefaults.job_name
    dashboardType.value = saved.dashboardType === 'duration' || saved.dashboardType === 'job-id' ? saved.dashboardType : 'job-id'
  } catch {
    Object.assign(filters, defaults)
    Object.assign(selectorKeyword, selectorDefaults)
    timeRange.value = 'last-30-days'
    dashboardType.value = 'job-id'
  }
}

function savePreferences() {
  localStorage.setItem(
    preferenceStorageKey,
    JSON.stringify({
      dashboardType: dashboardType.value,
      stage: filters.stage,
      job_name: filters.job_name,
      search: filters.search,
      timeRange: timeRange.value,
      start_at: filters.start_at,
      end_at: filters.end_at,
      selector_stage_keyword: selectorKeyword.stage,
      selector_job_name_keyword: selectorKeyword.job_name,
    }),
  )
}

loadPreferences()

const filteredJobs = computed(() => {
  if (!filters.stage.length) {
    return filterOptions.value.jobs || []
  }

  const jobSet = new Set()
  filters.stage.forEach((stage) => {
    ;(filterOptions.value.stage_job_map?.[stage] || []).forEach((job) => jobSet.add(job))
  })

  return Array.from(jobSet).sort()
})

const summary = computed(() => {
  const totalJobs = charts.value.reduce((sum, item) => sum + item.run_count, 0)
  return {
    chartCount: charts.value.length,
    totalJobs,
    maxCharts: filterOptions.value.limits?.maxCharts || maxCharts,
  }
})

const hasTimeRangeError = computed(() => {
  if (!filters.start_at || !filters.end_at) {
    return false
  }
  return new Date(filters.start_at).getTime() > new Date(filters.end_at).getTime()
})

const stageDisplayText = computed(() => buildSelectorText(filters.stage, '选择阶段'))
const jobDisplayText = computed(() => buildSelectorText(filters.job_name, '选择作业名'))
const searchableStages = computed(() => {
  const keyword = selectorKeyword.stage.trim().toLowerCase()
  const stages = filterOptions.value.stages || []
  if (!keyword) {
    return stages
  }
  return stages.filter((item) => item.toLowerCase().includes(keyword))
})
const searchableJobs = computed(() => {
  const keyword = selectorKeyword.job_name.trim().toLowerCase()
  const jobs = filteredJobs.value || []
  if (!keyword) {
    return jobs
  }
  return jobs.filter((item) => item.toLowerCase().includes(keyword))
})
const displayStartAt = computed(() => formatDisplayDateTime(filters.start_at))
const displayEndAt = computed(() => formatDisplayDateTime(filters.end_at))
const timeRangeDisplayText = computed(() => {
  const quickLabel = timeRangeOptions.find((item) => item.value === timeRange.value)?.label || '自定义'
  if (!displayStartAt.value || !displayEndAt.value) {
    return quickLabel
  }
  return `${quickLabel} | ${displayStartAt.value} - ${displayEndAt.value}`
})

function buildSelectorText(values, placeholder) {
  if (!values.length) {
    return placeholder
  }
  if (values.length <= 2) {
    return values.join('、')
  }
  return `已选择 ${values.length} 项`
}

function buildQuery() {
  const params = new URLSearchParams()

  filters.stage.forEach((value) => params.append('stage', value))
  filters.job_name.forEach((value) => params.append('job_name', value))

  if (filters.search) {
    params.set('search', filters.search)
  }
  if (filters.start_at) {
    params.set('start_at', filters.start_at)
  }
  if (filters.end_at) {
    params.set('end_at', filters.end_at)
  }

  return params.toString()
}

function currentDashboardEndpoint() {
  return dashboardType.value === 'job-id' ? 'job-ids' : 'durations'
}

async function loadFilterOptions() {
  const response = await fetch(`${backendBase}/api/gitlab/filters/`)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.detail || '加载筛选项失败')
  }
  filterOptions.value = data
  reconcileSelections()
}

function reconcileSelections() {
  const validStages = new Set(filterOptions.value.stages || [])
  filters.stage = filters.stage.filter((item) => validStages.has(item))

  const validJobs = new Set(filteredJobs.value)
  filters.job_name = filters.job_name.filter((item) => validJobs.has(item))
}

async function loadCharts() {
  if (hasTimeRangeError.value) {
    errorMessage.value = '开始时间必须小于等于结束时间'
    charts.value = []
    clearCharts()
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const response = await fetch(`${backendBase}/api/gitlab/${currentDashboardEndpoint()}/?${buildQuery()}`)
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.detail || '加载图表失败')
    }
    charts.value = data.results || []
    await nextTick()
    renderCharts()
  } catch (error) {
    errorMessage.value = error.message
    charts.value = []
    clearCharts()
  } finally {
    loading.value = false
  }
}

async function syncData() {
  syncing.value = true
  errorMessage.value = ''

  try {
    const response = await fetch(`${backendBase}/api/gitlab/sync/`, { method: 'POST' })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.detail || '同步失败')
    }
    await loadFilterOptions()
    await loadCharts()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    syncing.value = false
  }
}

function setChartRef(el, index) {
  chartRefs.value[index] = el
}

function clearCharts() {
  chartInstances.forEach((instance) => instance.dispose())
  chartInstances.clear()
}

function openJob(point) {
  if (point?.data?.web_url) {
    window.open(point.data.web_url, '_blank', 'noreferrer')
  }
}

function renderCharts() {
  clearCharts()

  charts.value.forEach((item, index) => {
    const element = chartRefs.value[index]
    if (!element) {
      return
    }

    const instance = echarts.init(element)
    chartInstances.set(item.key, instance)

    const labels = item.points.map((point) => point.label)
    const durations = item.points.map((point) => ({
      value: point.avg_duration,
      job_id: point.job_id,
      web_url: point.web_url,
      label: point.label,
    }))
    const averageLine = item.points.map(() => item.average_duration)

    if (dashboardType.value === 'job-id') {
      instance.on('click', openJob)
    }

    instance.setOption({
      animation: false,
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          const valueItem = params[0]
          const averageItem = params[1]
          const lines = [
            `${valueItem.axisValueLabel}`,
            `${valueItem.seriesName}: ${valueItem.value}`,
            `${averageItem.seriesName}: ${averageItem.value}`,
          ]
          if (valueItem.data?.job_id) {
            lines.push(`作业 ID: ${valueItem.data.job_id}`)
            lines.push('点击折线点可跳转到 GitLab 作业页面')
          }
          return lines.join('<br/>')
        },
      },
      grid: {
        left: 48,
        right: 20,
        top: 44,
        bottom: 60,
      },
      legend: {
        top: 0,
        data: [dashboardType.value === 'job-id' ? '作业耗时' : '日均耗时', '30天平均值'],
      },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisLabel: {
          rotate: 35,
          formatter: (value) => {
            if (dashboardType.value === 'job-id') {
              return value.length > 10 ? `${value.slice(0, 10)}...` : value
            }
            return value
          },
        },
      },
      yAxis: {
        type: 'value',
        name: '耗时(秒)',
      },
      series: [
        {
          name: dashboardType.value === 'job-id' ? '作业耗时' : '日均耗时',
          type: 'line',
          smooth: false,
          symbol: 'circle',
          symbolSize: 7,
          data: durations,
          lineStyle: {
            color: dashboardType.value === 'job-id' ? '#0f766e' : '#4f46e5',
            width: 3,
          },
          itemStyle: {
            color: dashboardType.value === 'job-id' ? '#0f766e' : '#4f46e5',
          },
          areaStyle: {
            color: dashboardType.value === 'job-id' ? 'rgba(15, 118, 110, 0.12)' : 'rgba(79, 70, 229, 0.10)',
          },
        },
        {
          name: '30天平均值',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: averageLine,
          lineStyle: {
            color: '#f59e0b',
            type: 'dashed',
            width: 2,
          },
        },
      ],
    })
  })
}

function resizeCharts() {
  chartInstances.forEach((instance) => instance.resize())
}

function resetFilters() {
  const defaults = createDefaultFilters()
  filters.stage = defaults.stage
  filters.job_name = defaults.job_name
  filters.search = defaults.search
  filters.start_at = defaults.start_at
  filters.end_at = defaults.end_at
  timeRange.value = 'last-30-days'
  dashboardType.value = 'job-id'
  openSelector.value = ''
}

function toggleSelector(name) {
  if (openSelector.value === name) {
    openSelector.value = ''
    return
  }

  openSelector.value = name
}

function toggleMultiValue(key, value) {
  const values = [...filters[key]]
  const index = values.indexOf(value)

  if (index >= 0) {
    values.splice(index, 1)
  } else {
    values.push(value)
  }

  filters[key] = values
  searchSelectionSnapshot[key] = null
  savePreferences()
}

function removeMultiValue(key, value) {
  filters[key] = filters[key].filter((item) => item !== value)
  searchSelectionSnapshot[key] = null
  savePreferences()
}

function clearMultiValue(key) {
  filters[key] = []
  searchSelectionSnapshot[key] = null
  savePreferences()
}

function selectAllSearchResults(key) {
  const visibleOptions = key === 'stage' ? searchableStages.value : searchableJobs.value
  const snapshot = searchSelectionSnapshot[key]

  if (snapshot) {
    filters[key] = [...snapshot]
    searchSelectionSnapshot[key] = null
    savePreferences()
    return
  }

  const currentValues = new Set(filters[key])
  searchSelectionSnapshot[key] = [...filters[key]]

  visibleOptions.forEach((item) => currentValues.add(item))
  filters[key] = Array.from(currentValues)
  savePreferences()
}

function clearTimeRange() {
  timeRange.value = 'custom'
  filters.start_at = ''
  filters.end_at = ''
}

function handleBeforeUnload() {
  savePreferences()
}

function handleDocumentClick() {
  openSelector.value = ''
}

watch(
  () => [...filters.stage],
  () => {
    const allowedJobs = new Set(filteredJobs.value)
    filters.job_name = filters.job_name.filter((job) => allowedJobs.has(job))
  },
)

watch(
  () => [filters.start_at, filters.end_at],
  () => {
    if (timeRange.value !== 'custom') {
      const { start, end } = buildDateRange(timeRange.value)
      const matchesQuickRange = filters.start_at === formatDateTimeLocal(start) && filters.end_at === formatDateTimeLocal(end)
      if (!matchesQuickRange) {
        timeRange.value = 'custom'
      }
    }

    if (hasTimeRangeError.value) {
      errorMessage.value = '开始时间必须小于等于结束时间'
    } else if (errorMessage.value === '开始时间必须小于等于结束时间') {
      errorMessage.value = ''
    }
  },
)

watch(
  () => [dashboardType.value, timeRange.value, filters.stage.join('|'), filters.job_name.join('|'), filters.search, filters.start_at, filters.end_at],
  () => {
    savePreferences()
    loadCharts()
  },
)

watch(
  () => [selectorKeyword.stage, selectorKeyword.job_name],
  () => {
    savePreferences()
  },
)

onMounted(async () => {
  await loadFilterOptions()
  await loadCharts()
  window.addEventListener('resize', resizeCharts)
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('click', handleDocumentClick)
  savePreferences()
  clearCharts()
})
</script>

<template>
  <main class="page">
    <section class="panel">
      <header class="hero">
        <div>
          <p class="eyebrow">GitLab Pipeline Dashboard</p>
          <h1>30 天流水线作业耗时看板</h1>
          <p class="subtext">默认展示按作业 ID 看板，折线图展示耗时变化，筛选条件会自动保存到本地。</p>
        </div>
        <div class="hero-actions">
          <button class="primary-button" :disabled="syncing" @click="syncData">
            {{ syncing ? '同步中...' : '同步 GitLab 数据' }}
          </button>
        </div>
      </header>

      <section class="dashboard-switcher">
        <button
          v-for="option in dashboardOptions"
          :key="option.value"
          class="switch-button"
          :class="{ active: dashboardType === option.value }"
          @click="dashboardType = option.value"
        >
          {{ option.label }}
        </button>
      </section>

      <section class="toolbar toolbar-compact">
        <label class="selector-field">
          <span>阶段选择</span>
          <div class="selector" @click.stop="toggleSelector('stage')">
            <button type="button" class="selector-trigger">
              <span class="selector-text">{{ stageDisplayText }}</span>
              <span class="selector-arrow">{{ openSelector === 'stage' ? '▲' : '▼' }}</span>
            </button>
            <div v-if="openSelector === 'stage'" class="selector-panel" @click.stop>
              <div class="selector-toolbar">
                <input v-model.trim="selectorKeyword.stage" class="selector-search" type="text" placeholder="搜索阶段" @keydown.enter.prevent="selectAllSearchResults('stage')" />
                <button type="button" class="tiny-button" @click="clearMultiValue('stage')">清空</button>
              </div>
              <label v-for="stage in searchableStages" :key="stage" class="selector-option" :title="stage">
                <input :checked="filters.stage.includes(stage)" type="checkbox" @change="toggleMultiValue('stage', stage)" />
                <span>{{ stage }}</span>
              </label>
            </div>
          </div>
          <div v-if="filters.stage.length" class="tag-list">
            <button v-for="stage in filters.stage" :key="stage" type="button" class="tag-chip" @click.stop="removeMultiValue('stage', stage)">
              {{ stage }} ×
            </button>
          </div>
        </label>

        <label class="selector-field">
          <span>作业选择</span>
          <div class="selector" @click.stop="toggleSelector('job_name')">
            <button type="button" class="selector-trigger">
              <span class="selector-text">{{ jobDisplayText }}</span>
              <span class="selector-arrow">{{ openSelector === 'job_name' ? '▲' : '▼' }}</span>
            </button>
            <div v-if="openSelector === 'job_name'" class="selector-panel" @click.stop>
              <div class="selector-toolbar">
                <input v-model.trim="selectorKeyword.job_name" class="selector-search" type="text" placeholder="搜索作业名" @keydown.enter.prevent="selectAllSearchResults('job_name')" />
                <button type="button" class="tiny-button" @click="clearMultiValue('job_name')">清空</button>
              </div>
              <label v-for="job in searchableJobs" :key="job" class="selector-option" :title="job">
                <input :checked="filters.job_name.includes(job)" type="checkbox" @change="toggleMultiValue('job_name', job)" />
                <span>{{ job }}</span>
              </label>
            </div>
          </div>
          <div v-if="filters.job_name.length" class="tag-list">
            <button v-for="job in filters.job_name" :key="job" type="button" class="tag-chip" @click.stop="removeMultiValue('job_name', job)">
              {{ job }} ×
            </button>
          </div>
        </label>

        <label>
          <span>名称搜索</span>
          <input v-model.trim="filters.search" type="text" placeholder="输入作业名称关键字" />
        </label>

        <label class="selector-field time-selector-field">
          <span>时间范围</span>
          <div class="selector" @click.stop="toggleSelector('time-range')">
            <button type="button" class="selector-trigger">
              <span class="selector-text">{{ timeRangeDisplayText }}</span>
              <span class="selector-arrow">{{ openSelector === 'time-range' ? '▲' : '▼' }}</span>
            </button>
            <div v-if="openSelector === 'time-range'" class="selector-panel time-selector-panel" @click.stop>
              <div class="time-range-group">
                <button
                  v-for="option in timeRangeOptions"
                  :key="option.value"
                  type="button"
                  class="time-range-button"
                  :class="{ active: timeRange === option.value }"
                  @click="applyTimeRange(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              <div class="time-range-inputs">
                <div class="time-range-row">
                  <label class="time-input-field time-input-inline">
                    <span>开始</span>
                    <div class="time-part-row">
                      <input :value="extractDatePart(filters.start_at)" type="date" @input="updateDatePart('start_at', $event.target.value)" />
                      <select :value="extractHourPart(filters.start_at)" @change="updateTimePart('start_at', 'hour', $event.target.value)">
                        <option v-for="hour in hourOptions" :key="`start-hour-${hour}`" :value="hour">{{ hour }}</option>
                      </select>
                      <span class="time-part-separator">:</span>
                      <select :value="extractMinutePart(filters.start_at)" @change="updateTimePart('start_at', 'minute', $event.target.value)">
                        <option v-for="minute in minuteOptions" :key="`start-minute-${minute}`" :value="minute">{{ minute }}</option>
                      </select>
                    </div>
                  </label>
                  <span class="time-range-divider">-</span>
                  <label class="time-input-field time-input-inline">
                    <span>结束</span>
                    <div class="time-part-row">
                      <input :value="extractDatePart(filters.end_at)" type="date" @input="updateDatePart('end_at', $event.target.value)" />
                      <select :value="extractHourPart(filters.end_at)" @change="updateTimePart('end_at', 'hour', $event.target.value)">
                        <option v-for="hour in hourOptions" :key="`end-hour-${hour}`" :value="hour">{{ hour }}</option>
                      </select>
                      <span class="time-part-separator">:</span>
                      <select :value="extractMinutePart(filters.end_at)" @change="updateTimePart('end_at', 'minute', $event.target.value)">
                        <option v-for="minute in minuteOptions" :key="`end-minute-${minute}`" :value="minute">{{ minute }}</option>
                      </select>
                    </div>
                  </label>
                </div>
              </div>
              <div class="time-range-actions">
                <button type="button" class="tiny-button" @click="clearTimeRange">清空</button>
              </div>
            </div>
          </div>
        </label>

        <button class="ghost-button compact-reset" @click="resetFilters">重置筛选</button>
      </section>

      <section class="selection-summary">
        <span>已选阶段：{{ filters.stage.length }}</span>
        <span>已选作业：{{ filters.job_name.length }}</span>
        <span>快捷时间：{{ timeRangeOptions.find((item) => item.value === timeRange)?.label || '自定义' }}</span>
        <span>开始：{{ displayStartAt }}</span>
        <span>结束：{{ displayEndAt }}</span>
      </section>

      <section class="status-row">
        <div class="status-card">
          <span>当前看板</span>
          <strong>{{ dashboardType === 'job-id' ? '作业 ID' : '日期耗时' }}</strong>
        </div>
        <div class="status-card">
          <span>已展示图表</span>
          <strong>{{ summary.chartCount }}/{{ summary.maxCharts }}</strong>
        </div>
        <div class="status-card">
          <span>覆盖作业运行次数</span>
          <strong>{{ summary.totalJobs }}</strong>
        </div>
      </section>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      <p v-else-if="loading" class="loading-message">图表加载中...</p>

      <section v-if="charts.length" class="charts-grid">
        <article v-for="(item, index) in charts" :key="item.key" class="chart-card">
          <div class="card-header">
            <div>
              <p class="stage-tag">{{ item.stage }}</p>
              <h2>{{ item.job_name }}</h2>
            </div>
            <div class="stats">
              <span>平均 {{ item.average_duration }}s</span>
              <span>{{ item.run_count }} 次</span>
            </div>
          </div>
          <p v-if="dashboardType === 'job-id'" class="chart-tip">点击折线点可快速跳转到对应 GitLab 作业。</p>
          <div :ref="(el) => setChartRef(el, index)" class="chart"></div>
        </article>
      </section>

      <section v-else-if="!loading" class="empty-state">
        <h2>暂无可展示数据</h2>
        <p>请调整筛选条件，或先同步 GitLab 数据。</p>
      </section>
    </section>
  </main>
</template>
