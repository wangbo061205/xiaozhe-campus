const api = require('../../utils/api')

const STATUS_MAP = {
  OPEN: { name: '待处理', cls: 'tag-type' },
  HANDLING: { name: '处理中', cls: 'tag-lost' },
  RESOLVED: { name: '已解决', cls: 'tag-official' },
  CLOSED: { name: '已关闭', cls: 'tag-expired' }
}

const CATEGORY_NAME = {
  ACCOUNT: '账号卡证', COURSE: '教学教务', DORM: '宿舍后勤', PAYMENT: '缴费资助', OTHER: '其他'
}

Page({
  data: {
    gq: '',
    categories: [
      { label: '账号卡证', value: 'ACCOUNT' },
      { label: '教学教务', value: 'COURSE' },
      { label: '宿舍后勤', value: 'DORM' },
      { label: '缴费资助', value: 'PAYMENT' },
      { label: '其他', value: 'OTHER' }
    ],
    category: 'ACCOUNT',
    title: '',
    detail: '',
    contactHint: '',
    submitting: false,
    loading: true,
    tickets: [],
    channels: [
      { name: '保卫处 24 小时值班', info: '0951-2068110（安全、门禁、紧急救助）' },
      { name: '一卡通服务中心', info: '0951-2068100 · 工作日 9:00-17:00（学生事务大厅）' },
      { name: '学生资助管理中心', info: '0951-2068300 · 奖助学金与贷款咨询' },
      { name: '信息化建设与管理处', info: '0951-2068600 · 校园网与账号问题' }
    ]
  },

  onLoad() {
    this.setData({ gq: getApp().glassClass() })
  },

  onShow() {
    this.loadTickets()
  },

  loadTickets() {
    api.get('/api/v1/tickets/mine')
      .then((list) => {
        const tickets = list.map((t) => ({
          id: t.id,
          title: t.title,
          detail: t.detail || '',
          categoryName: CATEGORY_NAME[t.category] || t.category,
          statusName: (STATUS_MAP[t.status] || {}).name || t.status,
          statusClass: (STATUS_MAP[t.status] || {}).cls || 'tag-type',
          timeText: (t.createdAt || '').slice(0, 10)
        }))
        this.setData({ loading: false, tickets: tickets })
      })
      .catch(() => this.setData({ loading: false }))
  },

  onCategory(e) { this.setData({ category: e.currentTarget.dataset.value }) },
  onTitle(e) { this.setData({ title: e.detail.value }) },
  onDetail(e) { this.setData({ detail: e.detail.value }) },
  onContact(e) { this.setData({ contactHint: e.detail.value }) },

  submit() {
    if (this.data.submitting) return
    const title = (this.data.title || '').trim()
    if (!title) {
      wx.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    api.post('/api/v1/tickets', {
      category: this.data.category,
      title: title,
      detail: (this.data.detail || '').trim(),
      contactHint: (this.data.contactHint || '').trim() || '站内留言联系'
    }).then(() => {
      this.setData({ submitting: false, title: '', detail: '', contactHint: '' })
      wx.showToast({ title: '已提交，请留意处理进度', icon: 'success' })
      this.loadTickets()
    }).catch((err) => {
      this.setData({ submitting: false })
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    })
  }
})
