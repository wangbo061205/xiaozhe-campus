/**
 * 玻璃导航栏（悬浮胶囊）
 * 用法：<glass-nav title="搜索" back />
 * 组件会自己输出一条固定胶囊 + 一个等高的占位块，页面直接放在最上面即可。
 *
 * 注意：navigationStyle 设为 custom 后，微信自带的胶囊按钮（··· ⊙）**依然存在**，
 * 所以导航胶囊必须在右侧给它让位，否则会被压住。位置全部由
 * wx.getMenuButtonBoundingClientRect() 算出来，而不是写死高度。
 *
 * 另一个注意点：自定义组件默认样式隔离，app.wxss 的 .glass-* / .gq-low 不一定能作用进来，
 * 所以玻璃配方和降级都写在组件自己的 wxss 里。
 */
Component({
  options: { addGlobalClass: true },
  properties: {
    title: { type: String, value: '' },
    back: { type: Boolean, value: false },
    action: { type: String, value: '' },
    plain: { type: Boolean, value: false },
    actionButton: { type: Boolean, value: false }
  },

  data: {
    top: 28,       // 胶囊距屏幕顶部（px）
    barH: 40,      // 胶囊高度（px）
    rightGap: 104, // 胶囊左边缘到屏幕右边的距离 + 间距（px）
    totalH: 76,    // 导航占位总高（px）
    gq: ''
  },

  lifetimes: {
    attached() {
      const app = getApp()
      const g = (app && app.globalData) || {}
      const statusBar = g.statusBarHeight != null ? g.statusBarHeight : 20

      let windowWidth = 375
      try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        if (info && info.windowWidth) windowWidth = info.windowWidth
      } catch (e) { /* 用默认值 */ }

      let capsule = null
      try {
        capsule = wx.getMenuButtonBoundingClientRect()
      } catch (e) { capsule = null }

      let top, barH, rightGap, totalH
      if (capsule && capsule.width > 0 && capsule.height > 0) {
        // 与胶囊按钮同一水平线、同一高度
        top = capsule.top
        barH = capsule.height
        // 右端停在胶囊左侧，留 8px 间隙
        rightGap = Math.max(88, windowWidth - capsule.left + 8)
        // 上下留白对称
        totalH = capsule.bottom + (capsule.top - statusBar)
      } else {
        // 兜底：拿不到胶囊信息时按状态栏推算
        top = statusBar + 8
        barH = 40
        rightGap = 104
        totalH = statusBar + 56
      }

      this.setData({
        top: top,
        barH: barH,
        rightGap: rightGap,
        totalH: totalH,
        gq: app && app.glassClass ? app.glassClass() : ''
      })
    }
  },

  methods: {
    onAction() {
      this.triggerEvent('actiontap')
    },
    onBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({ url: '/pages/chat/chat' })
      }
    }
  }
})
