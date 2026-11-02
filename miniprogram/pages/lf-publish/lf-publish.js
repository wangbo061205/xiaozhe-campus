const api = require('../../utils/api')
const media = require('../../utils/lostfound-images')

Page({
  data: {
    gq: '',
    kind: 'LOST',
    title: '',
    categories: ['证件卡类', '电子产品', '生活用品', '学习用品', '钥匙/钱包', '其他'],
    categoryIndex: 0,
    description: '',
    location: '',
    contactHint: '',
    images: [],
    choosingImages: false,
    uploadProgress: '',
    submitting: false
  },

  onLoad() {
    this.disposed = false
    this.setData({ gq: getApp().glassClass() })
  },
  onUnload() { this.disposed = true },

  onKind(e) {
    this.setData({ kind: e.currentTarget.dataset.kind })
  },
  onTitle(e) {
    this.setData({ title: e.detail.value })
  },
  onCategory(e) {
    this.setData({ categoryIndex: Number(e.detail.value) })
  },
  onDesc(e) {
    this.setData({ description: e.detail.value })
  },
  onLocation(e) {
    this.setData({ location: e.detail.value })
  },
  onContact(e) {
    this.setData({ contactHint: e.detail.value })
  },

  chooseImages() {
    if (this.data.submitting || this.data.choosingImages || this.data.images.length >= media.MAX_IMAGES) return
    this.setData({ choosingImages: true })
    wx.chooseMedia({
      count: media.MAX_IMAGES - this.data.images.length,
      mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'],
      success: (res) => {
        if (this.disposed) return
        const files = res.tempFiles || []
        const valid = files.filter(file => file.size <= media.MAX_BYTES && file.tempFilePath)
        const images = this.data.images.concat(valid.map((file, index) => ({
          key: Date.now() + '-' + index, path: file.tempFilePath, uploadId: ''
        }))).slice(0, media.MAX_IMAGES)
        this.setData({ images })
        if (valid.length !== files.length) wx.showToast({ title: '单张图片不能超过 5MB', icon: 'none' })
      },
      fail: (err) => { if (!this.disposed && !/cancel/i.test(err.errMsg || '')) wx.showToast({ title: '暂时无法选择图片，请重试', icon: 'none' }) },
      complete: () => { if (!this.disposed) this.setData({ choosingImages: false }) }
    })
  },
  removeImage(e) {
    if (this.data.submitting) return
    const key = e.currentTarget.dataset.key
    this.setData({ images: this.data.images.filter(image => image.key !== key) })
  },
  previewImage(e) {
    const urls = this.data.images.map(image => image.path)
    const current = urls[Number(e.currentTarget.dataset.index)]
    if (current) wx.previewImage({ current, urls })
  },

  async submit() {
    if (this.data.submitting || this.data.choosingImages) return
    const title = (this.data.title || '').trim()
    const description = (this.data.description || '').trim()
    if (!title) {
      wx.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    if (!description) {
      wx.showToast({ title: '请填写描述', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      for (let i = 0; i < this.data.images.length; i++) {
        if (this.data.images[i].uploadId) continue
        this.setData({ uploadProgress: '上传图片 ' + (i + 1) + '/' + this.data.images.length })
        const uploaded = await api.uploadImage(this.data.images[i].path)
        if (this.disposed) return
        this.setData({ ['images[' + i + '].uploadId']: uploaded.id })
      }
      this.setData({ uploadProgress: '正在提交' })
      await api.post('/api/v1/lost-found', {
        kind: this.data.kind,
        title: title,
        category: this.data.categories[this.data.categoryIndex],
        description: description,
        location: (this.data.location || '').trim(),
        contactHint: (this.data.contactHint || '').trim() || '站内留言联系',
        imageIds: this.data.images.map(image => image.uploadId)
      })
      if (this.disposed) return
      wx.showToast({ title: '已提交，等待审核', icon: 'success' })
      setTimeout(() => { if (!this.disposed) wx.navigateBack() }, 1200)
    } catch (err) {
      if (this.disposed) return
      this.setData({ submitting: false, uploadProgress: '' })
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    }
  }
})
