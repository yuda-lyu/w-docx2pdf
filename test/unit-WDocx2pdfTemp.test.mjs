import fs from 'fs'
import path from 'path'
import assert from 'assert'
import WDocx2pdf from '../src/WDocx2pdf.mjs'


//不需Word之暫存檔清除測試(R-CONVERT-RESULT-01): WDocx2pdf先把輸入複製為opt.fdTemp下之docx2pdf_<id>.docx再轉檔,
//任何返回路徑(成功, 取不到cv.exe, 轉檔器失敗, 輸出檔不存在)皆須清除本次之輸入暫存檔與輸出暫存檔, 不刪fdTemp資料夾本身, 不動他次呼叫之暫存檔
//真Word之失敗路徑與成功路徑見WDocx2pdf.test.mjs; 本檔以LibreOffice模式搭配假啟動檔(opt.fpExeLibreOffice)驗證本機未裝LibreOffice時之清除邏輯
function isWindows() {
    return process.platform === 'win32'
}


describe('WDocx2pdf temp files', function() {
    this.timeout(60000)

    //check
    if (!isWindows()) {
        return
    }

    let fdt = path.resolve('./test/_tmp/WDocx2pdf-temp')
    let fdTemp = path.join(fdt, 'temp')
    let fpIn = path.join(fdt, 'in.docx')
    let fpOut = path.join(fdt, 'out.pdf')
    let keys = ['W_BIN_CACHE', 'W_BIN_MIRROR', 'W_BIN_OFFLINE']
    let saved = {}

    //假啟動檔: node.exe對`--headless ...`引數回報bad option並以離開碼9結束(LibreOffice模式下execProcess因離開碼非0而reject; 不用cmd.exe: 其會進入互動模式等stdin而懸置);
    //Git for Windows附之true.exe一律以離開碼0結束且不產生任何檔案(LibreOffice模式下execProcess成功但無輸出檔), 本機無則略過該案
    let fpExeFail = process.execPath
    let fpExeNoOutput = 'C:\\Program Files\\Git\\usr\\bin\\true.exe'

    let tempFiles = () => {
        return fs.existsSync(fdTemp) ? fs.readdirSync(fdTemp).filter((v) => v.startsWith('docx2pdf_')).sort() : null
    }

    //call, 呼叫WDocx2pdf並回傳{ ok, v }, 不拋錯
    let call = async (o) => {
        let r = { ok: false, v: null }
        await WDocx2pdf(fpIn, fpOut, { fdTemp, ...o })
            .then((v) => {
                r = { ok: true, v }
            })
            .catch((e) => {
                r = { ok: false, v: e }
            })
        return r
    }

    before(function() {
        fs.rmSync(fdt, { recursive: true, force: true })
        fs.mkdirSync(fdTemp, { recursive: true })
        fs.writeFileSync(fpIn, 'user document content')
        for (let k of keys) {
            saved[k] = process.env[k]
        }

        //取不到cv.exe: 離線, 空快取, 無鏡像
        process.env.W_BIN_CACHE = path.join(fdt, 'cache')
        process.env.W_BIN_OFFLINE = '1'
        delete process.env.W_BIN_MIRROR
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
        fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        try {
            fs.rmdirSync(path.resolve('./test/_tmp')) //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    })

    beforeEach(function() {
        fs.rmSync(fpOut, { force: true })
    })

    it('removes the input temp copy when cv.exe can not be obtained (ensureBins rejects), and rejects a string "[E_OFFLINE_MISSING] ..." (not an Error object) like w-docx-split, w-html2docx and w-docx2html', async function() {
        let r = await call({ mode: 'MicrosoftOffice' })
        assert.strict.equal(r.ok, false)
        assert.strict.equal(typeof r.v, 'string', String(r.v))
        assert.strict.equal(r.v.startsWith('[E_OFFLINE_MISSING] '), true, r.v)
        assert.strict.equal(r.v.includes('cv.exe'), true, r.v)
        assert.strict.deepStrictEqual(tempFiles(), [])
        assert.strict.equal(fs.existsSync(fdTemp), true)
        assert.strict.equal(fs.existsSync(fpOut), false)
        assert.strict.equal(fs.readFileSync(fpIn, 'utf8'), 'user document content')
    })

    it('does not touch temp files of other calls nor the fdTemp folder itself', async function() {
        let fpOther = path.join(fdTemp, 'docx2pdf_20000101000000_OTHER1.docx')
        let fpOtherPdf = path.join(fdTemp, 'docx2pdf_20000101000000_OTHER1.pdf')
        fs.writeFileSync(fpOther, 'other call input')
        fs.writeFileSync(fpOtherPdf, 'other call output')
        let r = await call({ mode: 'MicrosoftOffice' })
        assert.strict.equal(r.ok, false)
        assert.strict.deepStrictEqual(tempFiles(), ['docx2pdf_20000101000000_OTHER1.docx', 'docx2pdf_20000101000000_OTHER1.pdf'])
        assert.strict.equal(fs.readFileSync(fpOther, 'utf8'), 'other call input')
        assert.strict.equal(fs.readFileSync(fpOtherPdf, 'utf8'), 'other call output')
        fs.rmSync(fpOther, { force: true })
        fs.rmSync(fpOtherPdf, { force: true })
    })

    it('removes the temp copy when the LibreOffice launcher fails (non-zero exit code)', async function() {
        let r = await call({ mode: 'LibreOffice', fpExeLibreOffice: fpExeFail })
        assert.strict.equal(r.ok, false)
        assert.strict.equal(typeof r.v, 'string')
        assert.strict.equal(r.v.startsWith('code['), true, r.v)
        assert.strict.deepStrictEqual(tempFiles(), [])
        assert.strict.equal(fs.existsSync(fpOut), false)
    })

    it('rejects [E_CONVERT_FAILED] and removes the temp copy when the launcher exits 0 but produces no output file', async function() {
        if (!fs.existsSync(fpExeNoOutput)) {
            console.log(`skip: ${fpExeNoOutput} does not exist`)
            this.skip()
        }
        fs.writeFileSync(fpOut, 'STALE-OLD-CONTENT')
        let r = await call({ mode: 'LibreOffice', fpExeLibreOffice: fpExeNoOutput })
        assert.strict.equal(r.ok, false)
        assert.strict.equal(r.v, '[E_CONVERT_FAILED] output file was not generated or is empty')
        assert.strict.deepStrictEqual(tempFiles(), [])

        //輸出路徑上既有之檔不被動到
        assert.strict.equal(fs.readFileSync(fpOut, 'utf8'), 'STALE-OLD-CONTENT')
    })

})
