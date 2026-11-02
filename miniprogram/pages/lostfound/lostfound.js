const api = require('../../utils/api')
const media = require('../../utils/lostfound-images')

const STATUS_NAME = {
  PENDING_REVIEW: '审核中',
  PUBLISHED: '展示中',
  CLAIMED: '已认领',
  CLOSED: '已关闭',
  REMOVED: '已下架'
}

Page({
  data: {
    gq: '',
    tab: 'plaza',
    kind: '',
    loading: true,
    all: [],
    shown: [],
    selected: null,
    detailImages: [],
    loadingImages: false
  },

  onLoad() {
    this.setData({ gq: getApp().glassClass() })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 3 })
    }
    this.load()
  },

  load() {
    const version = this.loadVersion = (this.loadVersion || 0) + 1
    this.setData({ loading: true })

    let promise
    if (this.data.tab === 'mine') {
      promise = api.get('/api/v1/lost-found/mine')
    } else {
      promise = api.get('/api/v1/lost-found')
    }

    promise
      .then((list) => {
        if (version !== this.loadVersion) return
        const all = list.map((it) => ({
          id: it.id,
          kind: it.kind,
          kindName: it.kind === 'LOST' ? '寻物' : '招领',
          title: it.title,
          description: it.description || '',
          location: it.location || '',
          contactHint: it.contactHint || '站内留言联系',
          imagePaths: media.imagePaths(it.images),
          cover: '',
          statusName: this.data.tab === 'mine' ? (STATUS_NAME[it.status] || it.status) : ''
        }))
        this.setData({ all: all, loading: false })
        this.applyFilter()
        all.forEach((item, index) => {
          if (!item.imagePaths.length) return
          media.downloadImage(item.imagePaths[0]).then(path => {
            if (version !== this.loadVersion) return
            this.setData({ ['all[' + index + '].cover']: path })
            this.applyFilter()
          }).catch(() => {})
        })
      })
      .catch((err) => {
        if (version !== this.loadVersion) return
        this.setData({ loading: false })
        wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      })
  },

  applyFilter() {
    const kind = this.data.kind
    const shown = kind ? this.data.all.filter((x) => x.kind === kind) : this.data.all
    this.setData({ shown: shown })
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab, kind: '' }, () => {
      this.load()
    })
  },

  onKind(e) {
    this.setData({ kind: e.currentTarget.dataset.kind }, () => {
      this.applyFilter()
    })
  },

  async onTap(e) {
    const item = this.data.shown[e.currentTarget.dataset.index]
    if (!item) return
    const version = this.detailVersion = (this.detailVersion || 0) + 1
    this.setData({ selected: item, detailImages: [], loadingImages: !!item.imagePaths.length })
    const result = await Promise.all(item.imagePaths.map(path => media.downloadImage(path).catch(() => '')))
    if (version !== this.detailVersion) return
    this.setData({ detailImages: result.filter(Boolean), loadingImages: false })
    if (result.some(path => !path)) wx.showToast({ title: '部分图片加载失败，可关闭后重试', icon: 'none' })
  },
  closeDetail() { this.detailVersion = (this.detailVersion || 0) + 1; this.setData({ selected: null, detailImages: [], loadingImages: false }) },
  onHide() { this.closeDetail() },
  onUnload() { this.loadVersion = (this.loadVersion || 0) + 1; this.detailVersion = (this.detailVersion || 0) + 1 },
  stopDetailTouch() {},
  previewImage(e) {
    const urls = this.data.detailImages
    const current = urls[Number(e.currentTarget.dataset.index)]
    if (current) wx.previewImage({ urls, current })
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/lf-publish/lf-publish' })
  }
})
