const api = require('../../utils/api')

const STATUS_MAP = {
  in_progress: { name: '进行中', cls: 'tag-type' },
  done: { name: '已完成', cls: 'tag-official' },
  abandoned: { name: '已放弃', cls: 'tag-expired' }
}

Page({
  data: {
    gq: '',
    id: null,
    loading: true,
    error: '',
    run: {},
    materials: [],
    checkedCount: 0,
    statusName: '',
    statusClass: '',
    startedText: ''
  },

  onLoad(options) {
    this.setData({ gq: getApp().glassClass() })
    const id = options.id
    if (!id) {
      this.setData({ loading: false, error: '参数错误' })
      return
    }
    this.setData({ id: id })
    this.load(id)
  },

  load(id) {
    api.get('/api/v1/procedure-runs/' + id)
      .then((run) => {
        let checks = {}
        if (run.materialChecks) {
          try { checks = typeof run.materialChecks === 'string' ? JSON.parse(run.materialChecks) : run.materialChecks } catch (e) { checks = {} }
        }
        const materials = (run.materials || []).map((name) => ({ name: name, checked: !!checks[name] }))
        const st = STATUS_MAP[run.status] || { name: run.status, cls: 'tag-type' }
        this.setData({
          loading: false,
          run: run,
          materials: materials,
          checkedCount: materials.filter((m) => m.checked).length,
          statusName: st.name,
          statusClass: st.cls,
          startedText: (run.startedAt || '').slice(0, 10)
        })
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message || '进度不存在' })
      })
  },

  toggleMaterial(e) {
    const idx = e.currentTarget.dataset.index
    const materials = this.data.materials.slice()
    materials[idx] = { name: materials[idx].name, checked: !materials[idx].checked }
    const checks = {}
    materials.forEach((m) => { if (m.checked) checks[m.name] = true })
    this.setData({
      materials: materials,
      checkedCount: materials.filter((m) => m.checked).length
    })
    api.put('/api/v1/procedure-runs/' + this.data.id, { materialChecks: JSON.stringify(checks) })
      .catch(() => {})
  },

  finish() {
    wx.showModal({
      title: '标记办理完成',
      content: '确认这件事项已经办完了吗？',
      success: (res) => {
        if (!res.confirm) return
        api.put('/api/v1/procedure-runs/' + this.data.id, { status: 'done' })
          .then(() => {
            wx.showToast({ title: '已完成 🎉', icon: 'success' })
            this.load(this.data.id)
          })
          .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
      }
    })
  },

  abandon() {
    wx.showModal({
      title: '放弃办理',
      content: '确定放弃这次办理吗？之后可以重新开始。',
      success: (res) => {
        if (!res.confirm) return
        api.put('/api/v1/procedure-runs/' + this.data.id, { status: 'abandoned' })
          .then(() => this.load(this.data.id))
          .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
      }
    })
  },

  backToDetail() {
    wx.redirectTo({ url: '/pages/detail/detail?id=' + this.data.run.knowledgeId })
  }
})
