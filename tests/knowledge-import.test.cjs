const { test } = require('node:test')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const load = () => import(pathToFileURL(path.resolve(__dirname,'../scripts/import-nmu-knowledge.mjs')))

test('官网导入保留原日期、来源、正文，并以URL幂等', async () => {
  const {normalizeArticle} = await load()
  const article = {title:'招生简章',date:'2026-09-01',url:'http://www.nmu.edu.cn/info/1/2.htm',site:'yjsc',category:'硕士招生'}
  const text = '---\ntitle: "招生简章"\n---\n\n# 招生简章\n\n> 来源：研究生院\n\n'+ '报名条件及招生内容。'.repeat(20)
  const {item} = normalizeArticle(article,text)
  assert.equal(item.publishedAt,'2026-09-01T00:00:00+08:00')
  assert.ok(item.content.startsWith('报名条件'))
  assert.equal(item.sourceSite,'yjsc'); assert.equal(item.sourceCategory,'硕士招生')
  assert.equal(item.externalKey,normalizeArticle({...article,url:'https://www.nmu.edu.cn/info/1/2.htm#x'},text).item.externalKey)
})
test('无日期不补导入日期，图片附件不伪造正文，错误站点排除', async () => {
  const {normalizeArticle,articleType} = await load()
  const article = {title:'讲座',url:'https://www.nmu.edu.cn/info/1/3.htm',site:'www',category:'学术看点',emptyBody:true}
  const {item,limited} = normalizeArticle(article,'# 讲座\n\n欢迎广大师生聆听')
  assert.equal(item.publishedAt,null); assert.equal(limited,true)
  assert.match(item.content,/不能据此推断/)
  assert.equal(normalizeArticle({...article,url:'https://nmu.edu.cn.attacker.example/x'},'test').skipped,'非学校域名或错误页')
  assert.equal(articleType('教学规章'),'POLICY'); assert.equal(articleType('办事流程'),'GUIDE')
})
