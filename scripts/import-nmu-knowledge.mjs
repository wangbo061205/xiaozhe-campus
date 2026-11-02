import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sites = {www:'北方民族大学官网',xww:'北方民族大学新闻网',jwc:'北方民族大学教务处',yjsc:'北方民族大学研究生院',gjhzjl:'北方民族大学国际合作处',en:'北方民族大学英文网',dsjy:'北方民族大学党史专题',kyc:'北方民族大学科研处'}

export function articleType(category) {
  if (/常见问答/.test(category)) return 'FAQ'
  if (/办事流程/.test(category)) return 'GUIDE'
  if (/学校概况|现任领导|机构设置/.test(category)) return 'DEPARTMENT'
  if (/规章|政策|制度/.test(category)) return 'POLICY'
  return 'NOTICE'
}

export function normalizeArticle(article, markdown) {
  const url = new URL(article.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !(url.hostname === 'nmu.edu.cn' || url.hostname.endsWith('.nmu.edu.cn'))) {
    return { skipped: '非学校域名或错误页', url: article.url, title: article.title }
  }
  url.hash = ''
  url.protocol = 'https:'
  let body = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  body = body.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
  body = body.replace(/^# [^\n]*\n*/, '').replace(/^> 来源：[^\n]*\n*/, '').trim()
  if (!article.title?.trim() || article.title.length > 255) throw new Error('索引标题为空或超过255字')
  let publishedAt = null
  if (article.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(article.date) || Number.isNaN(Date.parse(article.date))) throw new Error('索引发布日期不正确')
    publishedAt = article.date + 'T00:00:00+08:00'
  }
  const prose = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<img[^>]*>/gi, '').trim()
  const limited = Boolean(article.emptyBody) || prose.length < 80
  if (limited) body = '【抓取完整性提示】此条目为图片、附件、索引或简短正文资料；未收录的正文及附件内容不能据此推断，请打开官方原文核实。\n\n' + (body || '未抓取到正文。')
  if (body.length > 300000) throw new Error('正文超过30万字，请人工拆分')
  const sourceName = sites[article.site] || '北方民族大学官网部门子站'
  const note = limited ? '资料可能不完整；请核对官方原文。' : ''
  const summary = note + body.replace(/【抓取完整性提示】[^\n]*\n*/, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#*|`>]/g, '').replace(/\s+/g, ' ').slice(0, 220)
  return { item: {
    externalKey: createHash('sha256').update(url.href).digest('hex'),
    type: articleType(article.category), title: article.title.trim(), content: body,
    summary, sourceName: (article.source ? `${sourceName} · ${article.source}` : sourceName).slice(0,255),
    sourceUrl: article.url, official: true, department: ['www','xww','en','dsjy'].includes(article.site) ? null : sourceName.replace('北方民族大学',''),
    sourceSite: article.site, sourceCategory: article.category, publishedAt
  }, limited }
}

export async function loadDataset(source) {
  const realSource = await fs.realpath(source)
  const knowledgeRoot = await fs.realpath(path.join(realSource, 'knowledge'))
  const lines = (await fs.readFile(path.join(realSource, 'data', 'articles.jsonl'), 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
  const items = [], skipped = [], seen = new Set(), counts = {bySite:{},byType:{},limited:0,unknownDate:0}
  for (let index = 0; index < lines.length; index++) {
    let article
    try { article = JSON.parse(lines[index]) } catch { throw new Error(`索引第${index+1}行格式不正确`) }
    const file = await fs.realpath(path.resolve(realSource, article.file))
    const relative = path.relative(knowledgeRoot, file)
    if (relative.startsWith('..') || path.isAbsolute(relative) || !file.toLowerCase().endsWith('.md')) throw new Error(`索引第${index+1}行文件越出knowledge目录`)
    const normalized = normalizeArticle(article, await fs.readFile(file, 'utf8'))
    if (normalized.skipped) { skipped.push(normalized); continue }
    const item = normalized.item
    if (seen.has(item.externalKey)) { skipped.push({title:article.title,url:article.url,skipped:'规范URL重复'}); continue }
    seen.add(item.externalKey); items.push(item)
    counts.bySite[item.sourceSite] = (counts.bySite[item.sourceSite] || 0) + 1
    counts.byType[item.type] = (counts.byType[item.type] || 0) + 1
    counts.limited += Number(normalized.limited); counts.unknownDate += Number(!item.publishedAt)
  }
  return {items,report:{source:realSource,indexed:lines.length,eligible:items.length,skipped,counts}}
}

async function main() {
  const args = process.argv.slice(2)
  const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i+1] : fallback }
  if (args.includes('--help')) { console.log('node scripts/import-nmu-knowledge.mjs --source <资料目录> [--apply] [--base-url http://127.0.0.1:8080]\n默认仅校验。实际导入需设置 CAMPUS_ADMIN_PASSWORD，可选 CAMPUS_ADMIN_USERNAME。'); return }
  const source = option('--source', 'D:\\Desktop\\dp\\nmu-kb')
  const baseUrl = new URL(option('--base-url', 'http://127.0.0.1:8080'))
  if (baseUrl.protocol !== 'https:' && !(baseUrl.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(baseUrl.hostname))) throw new Error('远程导入必须使用HTTPS')
  const {items,report} = await loadDataset(source)
  const reportRoot = path.join(project, 'run', 'knowledge-import')
  await fs.mkdir(reportRoot, {recursive:true})
  const reportFile = path.join(reportRoot, 'nmu-import-report.json')
  const save = () => fs.writeFile(reportFile, JSON.stringify(report,null,2)+'\n','utf8')
  await save()
  console.log(`索引 ${report.indexed} 篇，可导入 ${items.length} 篇，排除 ${report.skipped.length} 篇；短正文或图片附件提示 ${report.counts.limited} 篇。`)
  if (!args.includes('--apply')) { console.log('校验完成，尚未写入数据库。报告：'+reportFile); return }
  const password = process.env.CAMPUS_ADMIN_PASSWORD
  if (!password) throw new Error('请通过 CAMPUS_ADMIN_PASSWORD 提供管理员密码')
  let token
  async function request(endpoint, body, authenticated = true) {
    const response = await fetch(new URL(endpoint, baseUrl), {method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)})
    const result = await response.json()
    if (!response.ok || result.code !== 0) throw new Error(`接口失败（${response.status}）：${result.message || '请检查服务状态'}`)
    return result.data
  }
  const login = await request('/api/v1/auth/login',{username:process.env.CAMPUS_ADMIN_USERNAME || 'admin',password},false)
  if (login.role !== 'ADMIN' || !login.token) throw new Error('批量导入需要管理员身份')
  token = login.token
  report.startedAt = new Date().toISOString(); report.created = 0; report.existing = 0; report.processed = 0
  for (let index = 0; index < items.length; index += 100) {
    const batch = items.slice(index,index+100)
    const result = await request('/api/v1/admin/knowledge/import',{dataset:'nmu-official',items:batch})
    report.created += result.created; report.existing += result.skipped; report.processed += batch.length
    await save()
    console.log(`进度 ${report.processed}/${items.length}，新增 ${report.created}，已存在 ${report.existing}`)
  }
  report.completedAt = new Date().toISOString(); await save()
  console.log('导入完成，报告：'+reportFile)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error('导入未完成：'+error.message); process.exitCode=1 })
