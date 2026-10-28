import fs from 'fs'
import path from 'path'
import http from 'http'
import crypto from 'crypto'
import assert from 'assert'
import ensureBins from '../src/ensureBins.mjs'
import autoDownloadFiles from '../src/autoDownloadFiles.mjs'


function sha256Of(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex')
}


//listFiles, 遞迴列出資料夾內所有檔(相對路徑), 資料夾不存在回傳[]
function listFiles(fd, rel = '') {
    let r = []
    let fdc = path.join(fd, rel)
    if (!fs.existsSync(fdc)) {
        return r
    }
    for (let d of fs.readdirSync(fdc, { withFileTypes: true })) {
        let p = rel === '' ? d.name : `${rel}/${d.name}`
        if (d.isDirectory()) {
            r.push(...listFiles(fd, p))
        }
        else {
            r.push(p)
        }
    }
    return r
}


//規格: 外部執行檔之存放下載校驗與離線(制式規格) D1~D4、O1~O3、E2、E3、§8 T3~T8
//測試不連外網: 本機HTTP伺服器扮raw.githubusercontent.com(以注入之fetch改寫主機), 鏡像為本地資料夾
describe(`ensureBins`, function() {
    this.timeout(120000)

    let pkgRoot = path.resolve('.')
    let fdt = path.resolve('./test/_tmp/ensureBins')
    let manifest = JSON.parse(fs.readFileSync('bin/manifest.json', 'utf8'))
    let entry = manifest.files.find((v) => v.name === 'cv.exe')
    let bodyGood = fs.readFileSync('bin/cv.exe')
    let pathUrl = `/${manifest.repo}/${manifest.commit}/${entry.path}`

    let server = null
    let port = 0
    let mode = 'good' //good, wrong(同大小不同內容), short(截短), long(多一位元組), notfound
    let urls = []

    let fetchLocal = (url, init) => {
        return globalThis.fetch(url.replace('https://raw.githubusercontent.com', `http://127.0.0.1:${port}`), init)
    }
    let fetchNever = () => {
        throw new Error('fetch must not be called')
    }

    //base, 各案共用之選項: 不讀真實環境變數, 快取放測試資料夾, 失敗不重試
    let base = (name, o = {}) => {
        return { cacheDir: `${fdt}/${name}/cache`, mirror: '', offline: false, env: {}, maxAttempts: 1, retryDelayMs: 1, fetch: fetchLocal, ...o }
    }

    //mkMirror, 建本地鏡像<鏡像>/<pkg>/<sha256>/<name>
    let mkMirror = (name, buf) => {
        let fdm = `${fdt}/${name}/mirror`
        let fdf = `${fdm}/${manifest.pkg}/${entry.sha256}`
        fs.mkdirSync(fdf, { recursive: true })
        fs.writeFileSync(`${fdf}/${entry.name}`, buf)
        return fdm
    }

    before(async function() {
        fs.rmSync(fdt, { recursive: true, force: true })
        fs.mkdirSync(fdt, { recursive: true })
        server = http.createServer((req, res) => {
            urls.push(req.url)
            let body = bodyGood
            if (mode === 'wrong') {
                body = Buffer.from(bodyGood)
                body[0] = body[0] ^ 0xff
            }
            else if (mode === 'short') {
                body = bodyGood.subarray(0, bodyGood.length - 1000)
            }
            else if (mode === 'long') {
                body = Buffer.concat([bodyGood, Buffer.from([0])])
            }
            else if (mode === 'notfound') {
                res.writeHead(404)
                res.end('not found')
                return
            }
            res.writeHead(200, { 'content-length': String(body.length) })
            res.end(body)
        })

        //port自8947起依序找可用者(不隨機)
        for (let p = 8947; p < 8967; p++) {
            let ok = await new Promise((resolve) => {
                server.once('error', () => resolve(false))
                server.listen(p, '127.0.0.1', () => resolve(true))
            })
            if (ok) {
                port = p
                break
            }
        }
        assert.strict.notEqual(port, 0, 'no available port')
    })

    beforeEach(function() {
        mode = 'good'
        urls = []
    })

    after(async function() {
        await new Promise((resolve) => {
            server.close(resolve)
        })
        fs.rmSync(fdt, { recursive: true, force: true })
    })

    it(`should download from the pinned commit url, verify, cache, then hit the cache without network (T3, D1, D4, M2)`, async function() {
        let o = base('t3')
        let r1 = await ensureBins(o)
        assert.strict.deepStrictEqual(Object.keys(r1), ['cv.exe'])
        assert.strict.equal(r1['cv.exe'], path.join(o.cacheDir, entry.sha256, 'cv.exe'))
        assert.strict.equal(sha256Of(fs.readFileSync(r1['cv.exe'])), entry.sha256)
        assert.strict.deepStrictEqual(urls, [pathUrl])

        //第二次: 快取命中, fetch不得被呼叫
        let r2 = await ensureBins({ ...o, fetch: fetchNever })
        assert.strict.equal(r2['cv.exe'], r1['cv.exe'])
        assert.strict.deepStrictEqual(urls, [pathUrl])

        //只取部分檔
        let r3 = await ensureBins({ ...o, fetch: fetchNever, names: 'cv.exe' })
        assert.strict.equal(r3['cv.exe'], r1['cv.exe'])
    })

    it(`should share one download among concurrent calls (replaces the old pmDownload of autoDownloadFiles)`, async function() {
        let o = base('t3c')
        let rs = await Promise.all([ensureBins(o), ensureBins(o), ensureBins(o)])
        assert.strict.equal(new Set(rs.map((v) => v['cv.exe'])).size, 1)
        assert.strict.equal(sha256Of(fs.readFileSync(rs[0]['cv.exe'])), entry.sha256)
        assert.strict.deepStrictEqual(urls, [pathUrl])
        assert.strict.deepStrictEqual(listFiles(o.cacheDir), [`${entry.sha256}/cv.exe`])
    })

    it(`should refuse a download whose sha256 differs and leave no file (T4, D2)`, async function() {
        mode = 'wrong'
        let o = base('t4a')
        let err = null
        await ensureBins(o).catch((e) => {
            err = e
        })
        assert.strict.equal(err && err.code, 'E_HASH_MISMATCH', err && err.message)
        assert.strict.deepStrictEqual(listFiles(o.cacheDir), [])
    })

    it(`should refuse a download whose size differs and leave no file (T4, D2)`, async function() {
        for (let m of ['short', 'long']) {
            mode = m
            let o = base(`t4b-${m}`)
            let err = null
            await ensureBins(o).catch((e) => {
                err = e
            })
            assert.strict.equal(err && err.code, 'E_SIZE_MISMATCH', `${m}: ${err && err.message}`)
            assert.strict.deepStrictEqual(listFiles(o.cacheDir), [], m)
        }
    })

    it(`should reject with the http error code when the url does not exist and leave no file (D2)`, async function() {
        mode = 'notfound'
        let o = base('t4c')
        let err = null
        await ensureBins(o).catch((e) => {
            err = e
        })
        assert.strict.equal(err && err.code, 'E_HTTP', err && err.message)
        assert.strict.deepStrictEqual(listFiles(o.cacheDir), [])
    })

    it(`should take the file from the local folder mirror of W_BIN_MIRROR without network, even offline (T5, O1, O2, O3)`, async function() {
        let fdm = mkMirror('t5a', bodyGood)
        let cache = `${fdt}/t5a/cache`
        let r = await ensureBins({ env: { W_BIN_MIRROR: fdm, W_BIN_CACHE: cache, W_BIN_OFFLINE: '1' }, fetch: fetchNever })

        //W_BIN_CACHE時快取為<W_BIN_CACHE>/<pkg>/<sha256>/<name>(D3)
        assert.strict.equal(r['cv.exe'], path.resolve(cache, manifest.pkg, entry.sha256, 'cv.exe'))
        assert.strict.equal(sha256Of(fs.readFileSync(r['cv.exe'])), entry.sha256)
        assert.strict.deepStrictEqual(urls, [])
    })

    it(`should refuse a tampered mirror file: offline gives E_OFFLINE_MISSING and caches nothing (T5, O2)`, async function() {
        let bad = Buffer.from(bodyGood)
        bad[0] = bad[0] ^ 0xff
        let fdm = mkMirror('t5b', bad)
        let o = base('t5b', { mirror: fdm, offline: true, fetch: fetchNever })
        let err = null
        await ensureBins(o).catch((e) => {
            err = e
        })
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
        assert.strict.deepStrictEqual(listFiles(o.cacheDir), [])
        assert.strict.deepStrictEqual(urls, [])
    })

    it(`should skip a tampered mirror file and fall back to the pinned url when online (O2)`, async function() {
        let bad = Buffer.from(bodyGood)
        bad[0] = bad[0] ^ 0xff
        let fdm = mkMirror('t5c', bad)
        let o = base('t5c', { mirror: fdm })
        let r = await ensureBins(o)
        assert.strict.equal(sha256Of(fs.readFileSync(r['cv.exe'])), entry.sha256)
        assert.strict.deepStrictEqual(urls, [pathUrl])
    })

    it(`should reject E_OFFLINE_MISSING naming the file, sha256, size and the full cache path when offline with no cache and no mirror (T6, O3)`, async function() {
        let cache = `${fdt}/t6/cache`
        let err = null
        await ensureBins({ env: { W_BIN_OFFLINE: '1', W_BIN_CACHE: cache }, fetch: fetchNever }).catch((e) => {
            err = e
        })
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
        let cachePath = path.resolve(cache, manifest.pkg, entry.sha256, 'cv.exe')
        assert.strict.equal(err.missing[0].name, 'cv.exe')
        assert.strict.equal(err.missing[0].sha256, entry.sha256)
        assert.strict.equal(err.missing[0].size, entry.size)
        assert.strict.equal(err.missing[0].cachePath, cachePath)
        assert.strict.equal(err.message.includes('cv.exe'), true)
        assert.strict.equal(err.message.includes(entry.sha256), true)
        assert.strict.equal(err.message.includes(`${entry.size} bytes`), true)
        assert.strict.equal(err.message.includes(cachePath), true)
        assert.strict.equal(err.message.includes('W_BIN_MIRROR'), true)
        assert.strict.deepStrictEqual(urls, [])
        assert.strict.deepStrictEqual(listFiles(cache), [])
    })

    it(`should re-acquire when the cached file is tampered (T7, D4)`, async function() {
        let o = base('t7')
        let r1 = await ensureBins(o)
        assert.strict.deepStrictEqual(urls, [pathUrl])

        //同大小不同內容
        let bad = Buffer.from(bodyGood)
        bad[bad.length - 1] = bad[bad.length - 1] ^ 0xff
        fs.writeFileSync(r1['cv.exe'], bad)
        let r2 = await ensureBins(o)
        assert.strict.equal(r2['cv.exe'], r1['cv.exe'])
        assert.strict.equal(sha256Of(fs.readFileSync(r2['cv.exe'])), entry.sha256)
        assert.strict.equal(urls.length, 2)

        //不同大小
        fs.writeFileSync(r1['cv.exe'], Buffer.from('MZ'))
        let r3 = await ensureBins(o)
        assert.strict.equal(sha256Of(fs.readFileSync(r3['cv.exe'])), entry.sha256)
        assert.strict.equal(urls.length, 3)
    })

    it(`should refuse a tampered cache file when offline with no mirror: no usable file, E_OFFLINE_MISSING (T7, D4)`, async function() {
        let o = base('t7b')
        let r1 = await ensureBins(o)
        fs.writeFileSync(r1['cv.exe'], Buffer.from('MZ'))
        let err = null
        await ensureBins({ ...o, offline: true, fetch: fetchNever }).catch((e) => {
            err = e
        })
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
    })

    it(`should default the cache to <package root>/bin-cache and ignore opt.pkgRoot of the caller (D3, E2)`, async function() {
        let expected = path.join(pkgRoot, 'bin-cache', entry.sha256, 'cv.exe')
        let fp = ''
        try {
            let r = await ensureBins({ pkgRoot: path.join(fdt, 'otherRoot'), env: {}, mirror: '', offline: true, fetch: fetchNever })
            fp = r['cv.exe']
        }
        catch (err) {
            //預設快取無檔時為離線缺檔, 應放之位置須是本套件根
            assert.strict.equal(err.code, 'E_OFFLINE_MISSING', err.message)
            fp = err.missing[0].cachePath
        }
        assert.strict.equal(fp, expected)
    })

})


//autoDownloadFiles為舊公開子路徑(w-docx2pdf/src/autoDownloadFiles.mjs)之相容轉接, 內部經ensureBins
describe(`autoDownloadFiles`, function() {
    this.timeout(120000)

    let fdt = path.resolve('./test/_tmp/autoDownloadFiles')
    let manifest = JSON.parse(fs.readFileSync('bin/manifest.json', 'utf8'))
    let entry = manifest.files.find((v) => v.name === 'cv.exe')
    let keys = ['W_BIN_CACHE', 'W_BIN_MIRROR', 'W_BIN_OFFLINE']
    let saved = {}

    before(function() {
        fs.rmSync(fdt, { recursive: true, force: true })
        let fdf = `${fdt}/mirror/${manifest.pkg}/${entry.sha256}`
        fs.mkdirSync(fdf, { recursive: true })
        fs.copyFileSync('bin/cv.exe', `${fdf}/cv.exe`)
        for (let k of keys) {
            saved[k] = process.env[k]
        }
        process.env.W_BIN_CACHE = `${fdt}/cache`
        process.env.W_BIN_MIRROR = `${fdt}/mirror`
        process.env.W_BIN_OFFLINE = '1'
    })

    after(function() {
        for (let k of keys) {
            if (saved[k] === undefined) {
                delete process.env[k]
            }
            else {
                process.env[k] = saved[k]
            }
        }
        fs.rmSync(fdt, { recursive: true, force: true })
    })

    it(`should resolve { fpExe } of the verified cv.exe via the env mirror and cache (E2)`, async function() {
        let r = await autoDownloadFiles()
        assert.strict.deepStrictEqual(Object.keys(r), ['fpExe'])
        assert.strict.equal(r.fpExe, path.resolve(fdt, 'cache', manifest.pkg, entry.sha256, 'cv.exe'))
        assert.strict.equal(sha256Of(fs.readFileSync(r.fpExe)), entry.sha256)
    })

    it(`should reject with E_OFFLINE_MISSING when the mirror lacks the file (O3)`, async function() {
        process.env.W_BIN_MIRROR = `${fdt}/emptyMirror`
        process.env.W_BIN_CACHE = `${fdt}/emptyCache`
        let err = null
        await autoDownloadFiles().catch((e) => {
            err = e
        })
        process.env.W_BIN_MIRROR = `${fdt}/mirror`
        process.env.W_BIN_CACHE = `${fdt}/cache`
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
    })

})
