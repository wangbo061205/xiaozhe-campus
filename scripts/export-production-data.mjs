import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'run', 'production-data-' + new Date().toISOString().replace(/[:.]/g, '-'))
fs.mkdirSync(output, { recursive: true })
const dump = path.join(output, 'campus.dump')
const fd = fs.openSync(dump, 'wx')
let result
try {
  result = spawnSync('docker', ['exec', 'campus-postgres', 'pg_dump', '-U', 'campus', '-d', 'campus', '-Fc', '--no-owner', '--no-acl'],
    { cwd: root, stdio: ['ignore', fd, 'pipe'] })
} finally { fs.closeSync(fd) }
if (result.error || result.status !== 0 || fs.statSync(dump).size < 5) {
  throw new Error('数据库导出失败；原数据库未修改。' + (result.error?.message || result.stderr?.toString() || ''))
}
const uploads = path.join(root, 'data', 'lost-found-images')
const hasImages = fs.existsSync(uploads) && fs.readdirSync(uploads).length > 0
if (hasImages) {
  const images = path.join(output, 'images.tar')
  const archived = spawnSync('tar', ['-cf', images, '-C', uploads, '.'], { cwd: root, encoding: 'utf8' })
  if (archived.error || archived.status !== 0) throw new Error('图片备份失败；原图片未修改。')
}
const manifest = { exportedAt: new Date().toISOString(), database: 'campus.dump', databaseBytes: fs.statSync(dump).size,
  images: hasImages ? 'images.tar' : null, note: '包含原有用户、知识库、聊天等数据，请通过自己的 SSH 连接迁移。' }
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ output, ...manifest }, null, 2))
