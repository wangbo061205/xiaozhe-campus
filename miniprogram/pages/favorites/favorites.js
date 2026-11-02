const api = require('../../utils/api')

Page({
  data: {
    gq: '',
    loading: true,
    list: []
  },

  onLoad() {
    this.setData({ gq: getApp().glassClass() })
  },

  onShow() {
    this.load()
  },

  load() {
    this.setData({ loading: true })
    api.get('/api/v1/favorites')
      .then((list) => this.setData({ loading: false, list: list.filter(item => item.type !== 'NOTICE') }))
      .catch((err) => {
        this.setData({ loading: false })
        wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      })
  },

  onTap(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id })
  },

  onRemove(e) {
    const kid = e.currentTarget.dataset.kid
    api.del('/api/v1/favorites/' + kid)
      .then(() => {
        wx.showToast({ title: '已取消收藏', icon: 'none' })
        this.load()
      })
      .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
  }
})
