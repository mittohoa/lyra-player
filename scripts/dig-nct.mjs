// Cong cu bao tri: khi NhacCuaTui doi phia server va src/main/sources/nct.ts hong,
// chay file nay de tim lai API that su tu bundle JS cua ho.
//
//   node scripts/dig-nct.mjs
//
// Lich su: thang 8/2026 ho bo trang HTML co san (nhung XML player) va chuyen sang
// SPA Nuxt goi REST API o graph.nhaccuatui.com. Cach tim lai la boc bundle JS,
// tim ban do endpoint (mot object lon dang `{ tenHam(t){ return e.get("/api/v1/...") } }`).
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const get = (u) => fetch(u, { headers: { 'User-Agent': UA } }).then((r) => r.text())

const page = await get('https://www.nhaccuatui.com/tim-kiem/bai-hat?q=test')

const config = page.match(/apiBaseUrl:"([^"]+)"/)
console.log('API goc:', config?.[1] ?? '(khong thay - ho da doi cach cau hinh)')

const js = [...new Set([...page.matchAll(/https:\/\/www-static\.nct\.vn\/resource\/[^"']+\.js/g)].map((m) => m[0]))]
console.log(`Tai ${js.length} file JS...\n`)
const bodies = await Promise.all(js.map(async (u) => [u.split('/').pop(), await get(u).catch(() => '')]))

// Ban do endpoint: `tenHam(t={}){return e.get("/duong/dan")}` hoac e.post
const endpoints = new Map()
for (const [file, body] of bodies) {
  const re = /([A-Za-z][A-Za-z0-9_]*)\((?:[^)]{0,80})\)\{[^}]{0,80}?return e\.(get|post)\((["'`])([^"'`]+)\3/g
  for (const m of body.matchAll(re)) {
    if (!endpoints.has(m[1])) endpoints.set(m[1], { method: m[2].toUpperCase(), path: m[4], file })
  }
}

console.log(`--- ${endpoints.size} endpoint tim thay; loc theo tu khoa quan trong ---`)
for (const [name, e] of endpoints) {
  if (/search|song|lyric|stream|detail/i.test(name + e.path)) {
    console.log(`  ${e.method.padEnd(4)} ${name.padEnd(24)} ${e.path}`)
  }
}

// Ham giai ma lyric: hien tai la RC4 (hex -> RC4 -> utf8), khoa nam trong
// truong keyDecryptLyric cua chinh ban tin lyric.
console.log('\n--- noi lyric duoc giai ma ---')
for (const [file, body] of bodies) {
  const i = body.indexOf('keyDecryptLyric')
  if (i === -1) continue
  console.log(`  [${file}] ...${body.slice(Math.max(0, i - 260), i + 200).replace(/\s+/g, ' ')}...`)
}
