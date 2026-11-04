import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const options = {}
for (let i = 0; i < args.length; i += 2) {
  if (!['--url', '--config', '--backup-dir'].includes(args[i]) || !args[i + 1]) throw new Error('用法：--url https://服务域名 [--config 配置路径] [--backup-dir 备份目录]')
  options[args[i]] = args[i + 1]
}
if (!options['--url']) throw new Error('请提供控制台实际显示的 HTTPS 域名，不能猜测云地址')
const url = new URL(options['--url'])
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || url.pathname !== '/' ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(url.hostname) || !url.hostname.includes('.') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || /(?:^|\.)localhost$/.test(url.hostname)) {
  throw new Error('需要不含路径、端口或凭证的公网 HTTPS 域名')
}
const config = path.resolve(options['--config'] || path.join(root, 'miniprogram/config.js'))
const before = fs.readFileSync(config, 'utf8')
const replace = field => new RegExp(`(\\b${field}\\s*:\\s*)(['"])[^'"\\r\\n]*\\2`, 'g')
for (const field of ['baseUrl', 'simulatorBaseUrl']) {
  if ([...before.matchAll(replace(field))].length !== 1) throw new Error(`配置文件的 ${field} 不唯一，未修改文件`)
}
const after = before.replace(replace('baseUrl'), (_, key) => key + "'" + url.origin + "'")
  .replace(replace('simulatorBaseUrl'), (_, key) => key + "'" + url.origin + "'")
if (before === after) {
  console.log('已使用该云端地址，无需修改：' + url.origin)
} else {
  const backupDir = path.resolve(options['--backup-dir'] || path.join(root, 'run/wxcloudrun-config-backups'))
  fs.mkdirSync(backupDir, { recursive: true })
  const backup = path.join(backupDir, 'config-' + Date.now() + '-' + process.pid + '.js')
  fs.writeFileSync(backup, before, { flag: 'wx' })
  const temporary = config + '.cloudrun-' + process.pid + '.tmp'
  fs.writeFileSync(temporary, after, { flag: 'wx' })
  fs.renameSync(temporary, config)
  console.log(JSON.stringify({ domain: url.origin, config, backup }, null, 2))
}
