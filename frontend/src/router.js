import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardPage from './App.vue'
import GomokuPage from './GomokuPage.vue'
import XiangqiPage from './XiangqiPage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardPage,
    },
    {
      path: '/xiangqi',
      name: 'xiangqi',
      component: XiangqiPage,
    },
    {
      path: '/gomoku',
      name: 'gomoku',
      component: GomokuPage,
    },
  ],
})

export default router
