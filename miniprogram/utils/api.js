/** 通用工具：自动访客会话、请求封装与格式化。 */

function responseError(status, body, fallback) {
  var message = body && body.message
  if (!message) message = status === 401 ? '当前设备会话暂不可用，请重试' :
    status === 403 ? '当前操作没有权限' : fallback || ('请求失败（' + status + '）')
  var error = new Error(message)
  error.status = status
  error.code = (body && (body.errorCode || body.code)) || status
  error.requestId = (body && body.requestId) || ''
  return error
}

function withSession(operation) {
  var app = getApp()
  return app.ensureSession().then(function (token) {
    return operation(token).catch(function (error) {
      if (error.status !== 401) throw error
      // One renewal and one replay only. A permission failure never renews.
      return app.renewSession(token).then(function (renewed) { return operation(renewed) })
    })
  })
}

function networkError(failure, baseUrl) {
  var detail = failure && failure.errMsg || ''
  var code = 'NETWORK_UNREACHABLE'
  var message = '暂时无法连接校园服务，请检查网络后重试'
  if (/domain list|合法域名|url not in/i.test(detail)) {
    code = 'DOMAIN_NOT_ALLOWED'
    message = '校园服务域名尚未配置，请联系管理员'
  } else if (/ssl|certificate|tls/i.test(detail)) {
    code = 'TLS_ERROR'
    message = '校园服务的安全连接异常，请联系管理员'
  } else if (/timeout|超时/i.test(detail)) {
    code = 'REQUEST_TIMEOUT'
    message = '校园服务响应超时，请稍后重试'
  } else if (/abort/i.test(detail)) {
    code = 'REQUEST_ABORTED'
    message = '请求已取消'
  } else if (/^https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::|\/|$)/i.test(baseUrl || '')) {
    message = '当前校园服务需要手机与服务电脑连接同一 Wi-Fi 或热点'
  }
  var error = new Error(message)
  error.code = code
  error.isNetworkError = true
  error.errMsg = detail
  return error
}

function sendRequest(method, path, data, token, options) {
  var task, timer, finish
  var baseUrl = getApp().globalData.baseUrl
  var timeout = options && options.timeout || 60000
  var pending = new Promise(function (resolve, reject) {
    var settled = false
    finish = function (error, result) {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (error) reject(error)
      else resolve(result)
    }
    // A public request has its own deadline, independent of visitor login.
    if (options && options.timeout) timer = setTimeout(function () {
      finish(networkError({ errMsg: 'request:fail timeout' }, baseUrl))
      if (task && task.abort) task.abort()
    }, timeout)
    var header = { 'Content-Type': 'application/json; charset=utf-8' }
    if (token) header.Authorization = 'Bearer ' + token
    try {
      task = wx.request({
        url: baseUrl + path,
        method: method, data: data || {}, header: header, timeout: timeout,
        success: function (res) {
          var body = res.data
          if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
            finish(null, body.data)
            return
          }
          finish(responseError(res.statusCode, body))
        },
        fail: function (failure) { finish(networkError(failure, baseUrl)) }
      })
    } catch (error) { finish(error) }
  })
  pending.abort = function () {
    finish(networkError({ errMsg: 'request:fail abort' }, baseUrl))
    if (task && task.abort) task.abort()
  }
  return pending
}

function request(method, path, data) {
  return withSession(function (token) { return sendRequest(method, path, data, token) })
}

var TYPE_NAME = {
  NOTICE: '通知',
  POLICY: '政策',
  GUIDE: '办事指南',
  DEPARTMENT: '部门',
  PLACE: '地点',
  SERVICE: '服务',
  FAQ: '常见问题'
}

function typeName(t) {
  return TYPE_NAME[t] || t || '内容'
}

function shortDate(s) {
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return String(s)
  var date = new Date(s)
  if (!Number.isFinite(date.getTime())) return ''
  // PostgreSQL returns UTC offsets; display the school's calendar day in China.
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function uploadImage(filePath) {
  return withSession(function (token) {
    return new Promise(function (resolve, reject) {
      wx.uploadFile({
        url: getApp().globalData.baseUrl + '/api/v1/lost-found/images',
        filePath: filePath, name: 'file',
        header: { Authorization: 'Bearer ' + token }, timeout: 60000,
        success: function (res) {
          var body
          try { body = JSON.parse(res.data) } catch (error) {
            reject(responseError(res.statusCode, null, '图片上传响应异常，请重试'))
            return
          }
          if (res.statusCode === 200 && body && body.code === 0 && body.data && body.data.id) { resolve(body.data); return }
          reject(responseError(res.statusCode, body, '图片上传失败，请重试'))
        },
        fail: function () { reject(new Error('图片上传失败，请检查网络后重试')) }
      })
    })
  })
}

function uploadCourse(filePath, source, termStart, fileName) {
  return withSession(function (token) {
    return new Promise(function (resolve, reject) {
      wx.uploadFile({
        url: getApp().globalData.baseUrl + '/api/v1/courses/import/preview',
        filePath: filePath, name: 'file', formData: { source: source, fileName: fileName || '', ...(termStart ? { termStart: termStart } : {}) },
        header: { Authorization: 'Bearer ' + token }, timeout: 180000,
        success: function (res) {
          var body
          try { body = JSON.parse(res.data) } catch (error) { reject(responseError(res.statusCode, null, '课表识别响应异常，请重试')); return }
          if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) { resolve(body.data); return }
          reject(responseError(res.statusCode, body, '课表导入失败，请重试'))
        },
        fail: function (failure) { reject(networkError(failure, getApp().globalData.baseUrl)) }
      })
    })
  })
}

module.exports = {
  withSession: withSession,
  responseError: responseError,
  networkError: networkError,
  uploadImage: uploadImage,
  uploadCourse: uploadCourse,
  publicGet: function (p, d, options) { return sendRequest('GET', p, d, '', options || { timeout: 12000 }) },
  get: function (p, d) { return request('GET', p, d) },
  post: function (p, d) { return request('POST', p, d) },
  put: function (p, d) { return request('PUT', p, d) },
  del: function (p, d) { return request('DELETE', p, d) },
  typeName: typeName,
  shortDate: shortDate
}
