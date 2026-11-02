const api = require('../../utils/api')

Page({
  data: {
    gq: '',
    runs: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 4 })
    }
    this.setData({ gq: getApp().glassClass() })
    this.loadRuns()
  },

  goAcademics() { wx.navigateTo({ url: '/pages/academics/academics' }) },
  goCampusServices() { wx.navigateTo({ url: '/pages/services/services' }) },

  goFavorites() {
    wx.navigateTo({ url: '/pages/favorites/favorites' })
  },
  goCourses() {
    wx.navigateTo({ url: '/pages/courses/courses' })
  },
  goHelp() {
    wx.navigateTo({ url: '/pages/help/help' })
  },
  goRuns() {
    if (this.data.runs.length === 0) {
      wx.showToast({ title: '暂无进行中的办理，去办事指南开始吧', icon: 'none' })
      return
    }
    this.openRun({ currentTarget: { dataset: { id: this.data.runs[0].id } } })
  },
  openRun(e) {
    wx.navigateTo({ url: '/pages/procedure/procedure?id=' + e.currentTarget.dataset.id })
  },

  loadRuns() {
    api.get('/api/v1/procedure-runs/mine')
      .then((list) => {
        const runs = list
          .filter((r) => r.status === 'in_progress')
          .map((r) => ({ id: r.id, title: r.title, startedText: (r.startedAt || '').slice(0, 10) }))
        this.setData({ runs: runs })
      })
      .catch(() => {})
  }
})
