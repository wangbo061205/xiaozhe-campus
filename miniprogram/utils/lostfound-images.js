const MAX_IMAGES = 6
const MAX_BYTES = 5 * 1024 * 1024
const api = require('./api')

function imagePaths(value) {
  let list = value
  if (typeof list === 'string') {
    try { list = JSON.parse(list) } catch (e) { return [] }
  }
  if (!Array.isArray(list)) return []
  return list.filter(path => typeof path === 'string' && /^\/api\/v1\/lost-found\/images\/[\da-f-]{36}$/i.test(path)).slice(0, MAX_IMAGES)
}

function downloadImage(path) {
  if (!imagePaths([path]).length) return Promise.reject(new Error('图片地址无效'))
  return api.withSession(token => new Promise((resolve, reject) => {
    const app = getApp()
    const header = { Authorization: 'Bearer ' + token }
    wx.downloadFile({
      url: app.globalData.baseUrl + path, header, timeout: 30000,
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(api.responseError(res.statusCode, null, '图片暂不可用，请稍后重试'))
      },
      fail() { reject(new Error('图片加载失败，请检查网络')) }
    })
  }))
}
module.exports = { MAX_IMAGES, MAX_BYTES, imagePaths, downloadImage }
