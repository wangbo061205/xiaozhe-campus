/**
 * 玻璃胶囊标签栏
 * 每个 tab 页在 onShow 里调用：
 *   if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ active: N })
 */
Component({
  options: { addGlobalClass: true },

  data: {
    active: 0,
    keyboardHidden: false,
    gq: '',
    list: [
      { pagePath: '/pages/chat/chat', icon: 'message-circle', text: '小折' },
      { pagePath: '/pages/index/index', icon: 'house', text: '校园' },
      { pagePath: '/pages/map/map', icon: 'map', text: '地图' },
      { pagePath: '/pages/lostfound/lostfound', icon: 'backpack', text: '失物招领' },
      { pagePath: '/pages/mine/mine', icon: 'user-round', text: '我的' }
    ]
  },

  lifetimes: {
    attached() {
      const app = getApp()
      this.setData({ gq: app && app.glassClass ? app.glassClass() : '' })
    }
  },

  methods: {
    onTap(e) {
      const index = e.currentTarget.dataset.index
      const item = this.data.list[index]
      if (!item) return
      if (index === this.data.active) return
      wx.switchTab({
        url: item.pagePath,
        success: () => this.setData({ active: index })
      })
    }
  }
})
