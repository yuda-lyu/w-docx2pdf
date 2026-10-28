import fs from 'fs'
import path from 'path'
import w from 'wsemi'
import assert from 'assert'
import WDocx2pdf from '../src/WDocx2pdf.mjs'


function isWindows() {
    return process.platform === 'win32'
}


describe('WDocx2pdf', function() {

    //check
    if (!isWindows()) {
        return
    }

    let fpOutTrue = `./test/ztmpTrue.pdf`

    let fpIn = `./test/ztmp.docx`
    let fpOut = `./test/ztmp.pdf`
    let opt = {}

    //cv.exe經ensureBins取得(外部執行檔制式規格), 測試不連外網: 以本地資料夾鏡像供檔(bin/cv.exe), 快取放test/_tmp
    let fdt = path.resolve('./test/_tmp/WDocx2pdf')
    let keys = ['W_BIN_CACHE', 'W_BIN_MIRROR', 'W_BIN_OFFLINE']
    let saved = {}

    before(function() {
        let manifest = JSON.parse(fs.readFileSync('bin/manifest.json', 'utf8'))
        let entry = manifest.files.find((v) => v.name === 'cv.exe')
        fs.rmSync(fdt, { recursive: true, force: true })
        fs.mkdirSync(`${fdt}/mirror/${manifest.pkg}/${entry.sha256}`, { recursive: true })
        fs.copyFileSync('bin/cv.exe', `${fdt}/mirror/${manifest.pkg}/${entry.sha256}/cv.exe`)
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

    //pdfInfo, 取PDF之檔頭、檔尾與頁數(頁樹之/Count)
    //註: 不比對檔案大小, Word轉出之PDF大小隨Word版本與字型內嵌而異(2026-10-28本機Word 2021轉出135319, 基準檔90895, 兩者皆為有效之1頁PDF)
    function pdfInfo(fp) {
        let s = fs.readFileSync(fp).toString('latin1')
        let m = s.match(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/)
        return {
            isPdf: s.startsWith('%PDF-'),
            hasEof: /%%EOF\s*$/.test(s),
            pages: m ? Number(m[1]) : null,
        }
    }

    it('convert', async function() {
        await WDocx2pdf(fpIn, fpOut, opt)
        let r = pdfInfo(fpOut)
        let rr = pdfInfo(fpOutTrue)
        w.fsDeleteFile(fpOut)
        assert.strict.deepEqual(r, { isPdf: true, hasEof: true, pages: rr.pages })
        assert.strict.equal(rr.pages, 1)
    })

})
