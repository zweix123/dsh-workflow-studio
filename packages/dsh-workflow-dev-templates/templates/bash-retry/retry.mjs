import { readFileSync, writeFileSync } from 'node:fs'

const file = '.dsh-dev-bash-retry.json'
let attempts = 0
try { attempts = JSON.parse(readFileSync(file, 'utf8')) }
catch (error) { if (error.code !== 'ENOENT') throw error }
if (!Number.isSafeInteger(attempts) || attempts < 0) throw new Error('示例计数文件无效')
writeFileSync(file, JSON.stringify(++attempts))
if (attempts === 1) {
  console.error('第一次执行故意失败；请手动重试。')
  process.exit(7)
}
console.log(JSON.stringify({ result: attempts === 2 ? 42 : '第三次执行已交付有效结果。' }))
