import fs from 'fs'
import assert from 'assert'
import { execSync } from 'child_process'
import fsGetBinManifestEntry from 'wsemi/src/fsGetBinManifestEntry.mjs'
import fsEnsureBins from 'wsemi/src/fsEnsureBins.mjs'


//規格: 外部執行檔之存放下載校驗與離線(制式規格) S1、M1、M2、M4、§8 T1、T2
describe(`bin/manifest.json`, function() {
    this.timeout(120000)

    let manifest = null
    let fdt = './test/_tmp/binManifest'

    before(function() {
        manifest = JSON.parse(fs.readFileSync('bin/manifest.json', 'utf8'))
    })

    after(function() {
        fs.rmSync(fdt, { recursive: true, force: true })
    })

    it(`should pass the schema check of fsEnsureBins (M1, M2)`, async function() {
        //離線且快取為空資料夾: 清單有效時為E_OFFLINE_MISSING(缺檔), 清單無效時為E_MANIFEST; 不連網
        let err = null
        try {
            await fsEnsureBins('bin/manifest.json', { pkgRoot: '.', cacheDir: `${fdt}/cache`, mirror: '', offline: true, env: {} })
        }
        catch (e) {
            err = e
        }
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
    })

    it(`should be pinned mode of this package with a 40-character commit (M2, F15), so T8 does not apply`, function() {
        assert.strict.equal(manifest.pkg, 'w-docx2pdf')
        assert.strict.equal(manifest.mode, 'pinned')
        assert.strict.equal(manifest.repo, 'yuda-lyu/w-docx2pdf')
        assert.strict.match(manifest.commit, /^[0-9a-f]{40}$/)
        assert.strict.deepStrictEqual(manifest.files.map((v) => v.name), ['cv.exe'])
    })

    it(`should match the real files in bin/ (M4, T2)`, async function() {
        for (let f of manifest.files) {
            for (let p of [f, ...(f.parts || [])]) {
                if (typeof p.path === 'string') {
                    let e = await fsGetBinManifestEntry(p.path)
                    assert.strict.deepStrictEqual([e.sha256, e.size], [p.sha256, p.size], p.path)
                }
            }
        }
    })

    it(`should keep the legacy src/cv.exe in the repo for old versions, same bytes as bin/cv.exe (S2)`, async function() {
        let a = await fsGetBinManifestEntry('bin/cv.exe')
        let b = await fsGetBinManifestEntry('src/cv.exe')
        assert.strict.deepStrictEqual([b.sha256, b.size], [a.sha256, a.size])
    })

    it(`should not pack external executables into the npm package, only bin/manifest.json (S1, T1)`, function() {
        let r = JSON.parse(execSync('npm pack --dry-run --json', { encoding: 'utf8', windowsHide: true }))
        let info = Array.isArray(r) ? r[0] : Object.values(r)[0] //npm 11以前為陣列, npm 12起為以套件名為鍵之物件
        let fps = info.files.map((v) => v.path)
        assert.strict.deepStrictEqual(fps.filter((v) => /\.(exe|dll|msi|zip|7z|\d{3})$/i.test(v)), [])
        assert.strict.deepStrictEqual(fps.filter((v) => v.startsWith('bin/') || v.startsWith('bin-cache/')), ['bin/manifest.json'])
        assert.strict.equal(fps.includes('src/cv.exe'), false)
        assert.strict.equal(fps.includes('src/ensureBins.mjs'), true)
    })

})
