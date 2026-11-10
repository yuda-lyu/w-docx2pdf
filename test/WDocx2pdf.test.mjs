import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'
import w from 'wsemi'
import assert from 'assert'
import WDocx2pdf from '../src/WDocx2pdf.mjs'
import { setBinEnv } from './tools/binEnv.mjs'
import { writeDocx, startGetHoldServer } from './tools/docxFixture.mjs'
import { sleep, wordPids, isAutomationWord, waitWordGone, killNewAutomationWords, clearDisabledItems, startHeldWord, startOpenBorrower, startVisibleWordWatch, startHoldServer } from './tools/wordInstance.mjs'


function isWindows() {
    return process.platform === 'win32'
}


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

    it('convert', async function() {
        await WDocx2pdf(fpIn, fpOut, opt)
        let r = pdfInfo(fpOut)
        let rr = pdfInfo(fpOutTrue)
        w.fsDeleteFile(fpOut)
        assert.strict.deepEqual(r, { isPdf: true, hasEof: true, pages: rr.pages })
        assert.strict.equal(rr.pages, 1)
    })

})


describe('WDocx2pdf Word instance isolation', function() {

    //check
    if (!isWindows()) {
        return
    }

    //規格(排程第408項, 2026-11, 源自下游套件之調查): 轉檔器(cv.exe)每次另開獨立之Word實例(DispatchEx), 只結束本行程所開者, 輸入檔以唯讀開啟
    //  ①他行程已開之Word(含其未存內容)不被借用, 不被結束; ②兩行程轉檔(同時進行、一前一後交錯、同一輸入檔同時被兩個轉檔器開啟)皆成功;
    //  ③例外路徑(來源開啟失敗, 另存失敗)亦只結束自己之實例且不殘留WINWORD; ④本行程之實例被他行程(舊寫法Dispatch)連上並開文件時, 轉完不結束該實例
    //  他行程之Word以PowerShell經COM扮演(見tools/wordInstance.mjs), 一律隱藏; 本組須在無其他Word時執行(見before)
    //  各案以內含http連結圖之docx(tools/docxFixture.mjs)製造「轉檔進行中」之確定時點: Word開啟後向伺服器取圖, 伺服器扣住期間轉檔卡在匯出PDF(實測)

    let fdTmp = path.resolve('./test/_tmp/WDocx2pdf-word')
    let fdOut = path.join(fdTmp, 'out')
    let fdTemp = path.join(fdTmp, 'temp') //WDocx2pdf之opt.fdTemp(轉檔暫存)

    //png, 1×1之PNG, 由扣住點伺服器回傳
    let png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

    //pre, 本組開始時已存在之WINWORD(須為空, 見before); null為本組未執行(略過或初始化前失敗), 此時after不結束任何WINWORD
    let pre = null

    //restoreBinEnv, cv.exe自本機鏡像(取自repo內bin/)取得, 不連外網
    let restoreBinEnv = null

    //watch, 可見Word視窗之監看(規格: 不得開啟可見之Word視窗)
    let watch = null

    let fpStopOf = (name) => {
        return path.join(fdTmp, `${name}.stop`)
    }

    //genDoc, 產生夾具docx: title為第一頁文字, pages為頁數, linkUrl給定時第一頁含一張指向該網址之連結圖(扣住點)
    let genDoc = (name, opt) => {
        return writeDocx(path.join(fdTmp, `${name}.docx`), opt)
    }

    //conv, 經WDocx2pdf轉檔並回傳{ ok, err, fpOut }, 不拋錯
    let conv = async (fpIn, name) => {
        let fpOut = path.join(fdOut, `${name}.pdf`)
        let r = { ok: false, err: '', fpOut }
        await WDocx2pdf(fpIn, fpOut, { fdTemp })
            .then((v) => {
                r.ok = v === 'ok'
            })
            .catch((e) => {
                r.err = String(e)
            })
        return r
    }

    //runExe, 直接呼叫轉檔器(略過WDocx2pdf之存在檢查與暫存複製), 回傳{ code, out }(stdout與stderr合併, 以latin1收取, 僅供比對ASCII字樣)
    let runExe = (prog, inp) => {
        return new Promise((resolve) => {
            let out = ''
            let p = spawn(prog, [Buffer.from(JSON.stringify(inp), 'utf8').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
            let timer = setTimeout(() => {
                out += ' [test: timeout]'
                p.kill()
            }, 120000)
            p.stdout.on('data', (d) => {
                out += d.toString('latin1')
            })
            p.stderr.on('data', (d) => {
                out += d.toString('latin1')
            })
            p.on('error', (err) => {
                clearTimeout(timer)
                resolve({ code: null, out: `${out} [spawn error: ${err.message}]` })
            })
            p.on('close', (code) => {
                clearTimeout(timer)
                resolve({ code, out })
            })
        })
    }

    //untilHold, 等轉檔進行到Word向伺服器取圖; 轉檔先結束者回傳false
    let untilHold = async (srv, p) => {
        return Promise.race([srv.firstRequest().then(() => true), p.then(() => false)])
    }

    //waitUntil, 以可觀察條件同步(輪詢條件, 非固定延時): cond成立回傳true, 逾ms回傳false
    let waitUntil = async (cond, ms = 60000) => {
        let t0 = Date.now()
        while (!cond()) {
            if (Date.now() - t0 > ms) {
                return false
            }
            await sleep(100)
        }
        return true
    }

    //newPids, 本組開始後新出現之WINWORD
    let newPids = () => {
        return wordPids().filter((v) => !pre.includes(v))
    }

    //assertHeldIntact, H於轉檔後仍在, 其後連續2次讀取皆為文件數1且未存文字不變, 自始無讀取失敗
    let assertHeldIntact = async (h) => {
        let i = h.lines.length
        for (let k = 0; k < 2; k++) {
            let { i: j, line } = await h.waitLine(/^(DOCS|ERR)/, i)
            assert.strict.deepEqual(`DOCS 1 ${h.text}`, line)
            i = j + 1
        }
        assert.strict.deepEqual([], h.lines.filter((v) => /^(ERR|STDERR|SPAWNERR)/.test(v)))
        assert.strict.deepEqual(true, wordPids().includes(h.pid), `held WINWORD ${h.pid}`)
    }

    //assertNoVisible, 規格: 自監看第iw行起無可見之Word視窗(等監看再完成一輪後判定)
    let assertNoVisible = async (iw) => {
        assert.strict.deepEqual([], await watch.visibleSince(iw))
    }

    //assertPdf, 輸出為有效PDF且頁數等於來源之頁數(來源各案頁數不同, 以此確認輸出出自自己之來源)
    let assertPdf = (fp, pages) => {
        assert.strict.deepEqual({ isPdf: true, hasEof: true, pages }, pdfInfo(fp), fp)
    }

    before(async function() {
        this.timeout(120000)

        //前一組之轉檔器所開之Word可能仍在結束中
        await waitWordGone(wordPids().filter(isAutomationWord), 30000)

        //有其他Word(含使用者開啟者)時不跑本組: 修前(Dispatch)之轉檔器會借用並結束之; ④之他行程以GetActiveObject連上時亦無法確定連上本行程之實例
        let pids = wordPids()
        if (pids.length > 0) {
            console.log(`skip [Word instance isolation]: other WINWORD is running(${pids.join(',')})`)
            this.skip()
        }
        pre = pids

        restoreBinEnv = setBinEnv('WDocx2pdf-word-bin')

        //並行轉檔前先取得轉檔器至快取, 免兩個轉檔同時寫快取
        await WDocx2pdf.ensureBins()

        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdOut, { recursive: true })

        //先前被強制結束之Word所留下、指向本套件檔案之停用項目, 會使開檔跳出可見訊息框而停住, 先清除
        let rd = clearDisabledItems(path.resolve('.'))
        if (rd.removed.length > 0 || rd.failed.length > 0) {
            console.log(`Word disabled items under this package: ${JSON.stringify(rd)}`)
        }

        watch = await startVisibleWordWatch(fpStopOf('watch'))
    })

    after(async function() {
        this.timeout(60000)
        if (watch) {
            await watch.stop()
        }

        //收尾: 只結束本組新出現且經COM自動化啟動之WINWORD(各案已斷言不殘留, 此處為失敗時之清理); 有強制結束者再清其可能留下之停用項目
        if (pre !== null) {
            let rk = await killNewAutomationWords(pre)
            if (rk.killed.length > 0) {
                let rd = clearDisabledItems(path.resolve('.'))
                console.log(`cleanup: killed WINWORD ${JSON.stringify(rk)}, Word disabled items ${JSON.stringify(rd)}`)
            }
        }
        if (restoreBinEnv) {
            restoreBinEnv()
        }
        fs.rmSync(fdTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        try {
            fs.rmdirSync(path.resolve('./test/_tmp')) //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    })

    it('①他行程已開之Word(含未存文件)不被借用亦不被結束: 轉檔期間另起WINWORD, 轉完原實例仍在且文件數與未存文字不變, 轉檔器之WINWORD不殘留', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let h = await startHeldWord(fpStopOf('held1'))
        let srv = await startHoldServer(png)
        try {
            let p = conv(genDoc('held1', { title: 'Word instance held1', pages: 1, linkUrl: srv.url }), 'held1')
            assert.strict.deepEqual(true, await untilHold(srv, p), 'conversion ended before Word requested the picture')
            let during = newPids()
            srv.release()
            let r = await p

            //規格①: 轉檔成功, 輸出為來源之PDF
            assert.strict.deepEqual(true, r.ok, r.err)
            assertPdf(r.fpOut, 1)

            //規格①: 轉檔進行中有H以外之WINWORD, 即轉檔器另起之實例(未借用H)
            let mine = during.filter((v) => v !== h.pid)
            assert.strict.deepEqual(true, during.includes(h.pid) && mine.length >= 1, JSON.stringify({ during, held: h.pid }))

            //規格①: 轉完H仍在, 文件數與未存文字不變
            await assertHeldIntact(h)

            //規格③: 轉檔器所開之WINWORD轉完即結束
            assert.strict.deepEqual([], await waitWordGone(mine))
        }
        finally {
            await srv.close()
            await h.stop()
        }
        assert.strict.deepEqual([], await waitWordGone(newPids()))

        //規格: 不得開啟可見之Word視窗
        await assertNoVisible(iw)
    })

    it('③例外路徑亦只結束自己之實例: 來源開啟失敗、另存失敗皆回報錯誤且不產生輸出檔, 他行程之Word仍在且文件不變, 轉檔器之WINWORD不殘留', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let h = await startHeldWord(fpStopOf('held3'))
        try {
            let prog = (await WDocx2pdf.ensureBins())['cv.exe']
            let fpOk = genDoc('fail-ok', { title: 'Word instance fail', pages: 1 })

            //(a)來源開啟失敗, (b)另存失敗(來源已開啟後, 輸出資料夾不存在): 直接呼叫轉檔器(略過WDocx2pdf之存在檢查)
            //  轉檔器沿用既有行為: 轉檔例外時印出錯誤字典(含'traceback'鍵, 僅例外時才印)並仍以離開碼0結束(由呼叫端以輸出檔是否存在判定), 故斷言輸出檔不存在與輸出含錯誤字典
            let cases = [
                { name: '(a)', inp: { fpIn: path.join(fdTmp, 'no-such.docx'), fpOut: path.join(fdOut, 'fail-a.pdf'), opt: {} } },
                { name: '(b)', inp: { fpIn: fpOk, fpOut: path.join(fdOut, 'no-such-folder', 'fail-b.pdf'), opt: {} } },
            ]
            for (let c of cases) {
                let rb = await runExe(prog, c.inp)
                assert.strict.deepEqual(true, rb.out.includes('traceback'), `${c.name} ${rb.code} ${rb.out}`)
                assert.strict.deepEqual(false, fs.existsSync(c.inp.fpOut), c.name)

                //規格③: 每一例外之後他行程之Word皆仍在且文件不變
                await assertHeldIntact(h)
            }

            //規格③: 轉檔器所開之WINWORD皆已結束
            assert.strict.deepEqual([], await waitWordGone(newPids().filter((v) => v !== h.pid)))
        }
        finally {
            await h.stop()
        }
        assert.strict.deepEqual([], await waitWordGone(newPids()))
        await assertNoVisible(iw)
    })

    it('②兩行程交錯轉檔: 甲轉檔進行中(Word正取圖)時乙完整轉完一份, 兩者皆成功且輸出為各自之來源, 不殘留WINWORD', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let srv = await startHoldServer(png)
        let rA = null
        let rB = null
        let aSettled = false
        try {
            let pA = conv(genDoc('interleaveA', { title: 'Word instance interleaveA', pages: 1, linkUrl: srv.url }), 'interleaveA')
            pA.then(() => {
                aSettled = true
            })
            assert.strict.deepEqual(true, await untilHold(srv, pA), 'conversion A ended before Word requested the picture')
            rB = await conv(genDoc('interleaveB', { title: 'Word instance interleaveB', pages: 3 }), 'interleaveB')

            //乙轉完時甲仍被扣住(兩者確實交錯)
            assert.strict.deepEqual(false, aSettled)
            srv.release()
            rA = await pA
        }
        finally {
            await srv.close()
        }

        //規格②: 兩者皆成功, 各自輸出為其來源(頁數: 甲1頁, 乙3頁)
        assert.strict.deepEqual([true, true], [rA.ok, rB.ok], JSON.stringify({ A: rA.err, B: rB.err }))
        assertPdf(rA.fpOut, 1)
        assertPdf(rB.fpOut, 3)

        //規格③: 不殘留WINWORD
        assert.strict.deepEqual([], await waitWordGone(newPids()))
        await assertNoVisible(iw)
    })

    it('②兩行程同時轉檔(各2次): 兩轉檔同時進行於各自之Word實例, 皆成功且輸出為各自之來源, 每次結束後不殘留WINWORD', async function() {
        this.timeout(600000)
        let iw = watch.lines.length
        for (let rep = 0; rep < 2; rep++) {
            let srvA = await startHoldServer(png)
            let srvB = await startHoldServer(png)
            let rs = null
            let pA = null
            let pB = null
            try {
                pA = conv(genDoc(`race-a-${rep}`, { title: `Word instance race-a-${rep}`, pages: 2, linkUrl: srvA.url }), `race-a-${rep}`)
                pB = conv(genDoc(`race-b-${rep}`, { title: `Word instance race-b-${rep}`, pages: 3, linkUrl: srvB.url }), `race-b-${rep}`)

                //同時: 兩轉檔皆已進入Word並向各自之伺服器取圖(皆被扣住), 此時同時存在兩個轉檔器之WINWORD; 任一轉檔先結束者即失敗
                let both = await Promise.race([Promise.all([srvA.firstRequest(), srvB.firstRequest()]).then(() => true), Promise.race([pA, pB]).then(() => false)])
                assert.strict.deepEqual(true, both, 'a conversion ended before both Words requested the picture')
                let during = newPids()
                srvA.release()
                srvB.release()
                rs = await Promise.all([pA, pB])

                //規格②: 同時存在兩個實例(各轉檔一個)
                assert.strict.deepEqual(true, during.length >= 2, JSON.stringify({ rep, during }))
            }
            finally {
                await srvA.close()
                await srvB.close()
                await Promise.all([pA, pB].filter((v) => v !== null)) //失敗時亦等兩轉檔結束, 免殘留者干擾後續案
            }

            //規格②: 0失敗, 輸出為各自之來源; 規格③: 每次結束後不殘留WINWORD
            assert.strict.deepEqual([true, true], rs.map((v) => v.ok), JSON.stringify(rs.map((v) => v.err)))
            assertPdf(rs[0].fpOut, 2)
            assertPdf(rs[1].fpOut, 3)
            assert.strict.deepEqual([], await waitWordGone(newPids()))
        }
        await assertNoVisible(iw)
    })

    it('②同一輸入檔同時被兩個轉檔器開啟: 唯讀開啟, 皆成功, 不跳出「檔案使用中」等可見視窗, 輸入檔不變且無擁有者暫存檔', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let srv = await startHoldServer(png)
        let rs = null
        let pA = null
        let pB = null
        let fpIn = genDoc('shared', { title: 'Word instance shared', pages: 2, linkUrl: srv.url })
        let sha = (fp) => crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')
        let sha0 = sha(fpIn)
        try {
            let prog = (await WDocx2pdf.ensureBins())['cv.exe']
            pA = runExe(prog, { fpIn, fpOut: path.join(fdOut, 'shared-a.pdf'), opt: {} })
            pB = runExe(prog, { fpIn, fpOut: path.join(fdOut, 'shared-b.pdf'), opt: {} })

            //兩轉檔器皆已讀入該檔並向伺服器取圖(各一次, 皆被扣住); 任一轉檔器先結束者即失敗
            let both = await Promise.race([waitUntil(() => srv.urls.length >= 2), Promise.race([pA, pB]).then(() => false)])
            assert.strict.deepEqual(true, both, `a conversion ended before both Words requested the picture: ${JSON.stringify(srv.urls)}`)
            let during = newPids()
            srv.release()
            rs = await Promise.all([pA, pB])
            assert.strict.deepEqual(true, during.length >= 2, JSON.stringify(during))
        }
        finally {
            await srv.close()
            await Promise.all([pA, pB].filter((v) => v !== null))
        }

        //規格②: 兩者皆成功(離開碼0且輸出為來源之2頁PDF); 規格(唯讀): 輸入檔位元不變, 旁無Word之擁有者暫存檔(~$開頭)
        assert.strict.deepEqual([0, 0], rs.map((v) => v.code), JSON.stringify(rs))
        assertPdf(path.join(fdOut, 'shared-a.pdf'), 2)
        assertPdf(path.join(fdOut, 'shared-b.pdf'), 2)
        assert.strict.deepEqual(sha0, sha(fpIn))
        assert.strict.deepEqual([], fs.readdirSync(fdTmp).filter((v) => v.startsWith('~$')))
        assert.strict.deepEqual([], await waitWordGone(newPids()))
        await assertNoVisible(iw)
    })

    it('④本行程之Word被他行程(舊寫法Dispatch)連上並開文件時: 轉檔成功, 轉完不結束該實例, 對方之文件保留, 對方用畢結束後不殘留', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let srv = await startGetHoldServer()
        let b = null
        let x = []
        let r = null
        try {
            //扣住點用附加範本(Word開啟時向伺服器取範本, GET被扣住期間Open不返回但Word受理他行程之COM呼叫); 連結圖之扣住點下Word於匯出期間不受理他行程之COM呼叫(實測), 不適用於本案
            let p = conv(genDoc('borrowed', { title: 'Word instance borrowed', pages: 1, templateUrl: srv.url }), 'borrowed')
            assert.strict.deepEqual(true, await untilHold(srv, p), `conversion ended before Word requested the template: ${JSON.stringify(srv.log)}`)

            //x, 轉檔器之實例(本組開始時無其他Word, 故此時僅此一個)
            x = newPids()
            assert.strict.deepEqual(1, x.length, JSON.stringify(x))

            //他行程以GetActiveObject連上並開啟自己之一份文件(開啟既有檔而非新增空白文件: Word開啟文件時會關閉未更動之空白新文件, 且Word忙於開啟時寫入文字會被拒)
            b = startOpenBorrower(fpStopOf('borrower'), { fp: genDoc('borrower-doc', { title: 'Word instance borrower doc', pages: 1 }) })
            let { line } = await b.waitLine(/^(OPENED|OPENFAIL|NOATTACH|VISIBLE|EXIT)/)
            assert.strict.deepEqual('OPENED', line, b.lines.join(' / '))
            srv.release()
            r = await p

            //規格④: 轉檔成功, 輸出為來源之1頁PDF
            assert.strict.deepEqual(true, r.ok, r.err)
            assertPdf(r.fpOut, 1)

            //規格④: 對方於轉完後仍持有其同一份文件(文件數1, 以其文件參考讀得其檔名), 即實例與該文件皆未被轉檔器關閉
            await b.stop()
            assert.strict.deepEqual(true, b.lines.includes('DOCS 1 borrower-doc.docx'), b.lines.join(' / '))
            b = null
        }
        finally {
            if (b) {
                await b.stop()
            }
            await srv.close()
        }

        //對方用畢以Quit結束該實例, 不殘留
        assert.strict.deepEqual([], await waitWordGone(x))
        assert.strict.deepEqual([], await waitWordGone(newPids()))
        await assertNoVisible(iw)
    })

})


describe('WDocx2pdf when cv.exe fails internally', function() {

    //check
    if (!isWindows()) {
        return
    }

    //規格(排程第410項, R-CONVERT-RESULT-01): cv.exe轉檔例外時(輸入非docx, 損毀docx, Word無法開啟)只於stdout印出錯誤字典且其後仍印success、離開碼為0, execProcess不會reject;
    //  ①WDocx2pdf須reject字串`[E_CONVERT_FAILED] 原因`, 原因取自Word之診斷(已依系統字碼頁解碼不亂碼, 不回顯輸入或輸出路徑), 不產生輸出檔, 輸出路徑上既有之檔不被改動
    //  ②失敗後fdTemp內無本次之暫存檔(輸入複本與輸出暫存), 他次呼叫之暫存檔不被動到, fdTemp資料夾本身保留; ③其後正常docx仍resolve 'ok'、輸出為有效PDF、無暫存殘留; ④不殘留WINWORD, 不開啟可見之Word視窗
    //  本組同〈Word instance isolation〉須在無其他Word時執行(有則整組略過並印出原因); 開檔失敗案先起可見視窗看門狗(自動化實例之可見視窗隨即結束並記錄)

    let fdTmp = path.resolve('./test/_tmp/WDocx2pdf-fail')
    let fdOut = path.join(fdTmp, 'out')
    let fdTemp = path.join(fdTmp, 'temp') //WDocx2pdf之opt.fdTemp(轉檔暫存)
    let prefix = '[E_CONVERT_FAILED] '
    let fixedReasons = ['cv.exe reported an error', 'cv.exe returned no success result', 'output file was not generated or is empty']
    let fnDecoy = 'docx2pdf_20000101000000_DECOY1.docx' //他次呼叫之暫存檔(模擬), 本組之失敗呼叫不得動它

    //pre, 本組開始時已存在之WINWORD(須為空); null為本組未執行(略過或初始化前失敗), 此時after不結束任何WINWORD
    let pre = null
    let restoreBinEnv = null
    let watch = null

    let newPids = () => {
        return wordPids().filter((v) => !pre.includes(v))
    }

    let tempFiles = () => {
        return fs.readdirSync(fdTemp).filter((v) => v.startsWith('docx2pdf_')).sort()
    }

    //assertNoVisible, 規格④: 自監看第iw行起無可見之Word視窗(等監看再完成一輪後判定)
    let assertNoVisible = async (iw) => {
        assert.strict.deepEqual([], await watch.visibleSince(iw))
    }

    //conv, 經WDocx2pdf轉檔並回傳{ ok, v }(v為resolve值或reject值), 不拋錯
    let conv = async (fpIn, fpOut) => {
        let r = { ok: false, v: null }
        await WDocx2pdf(fpIn, fpOut, { fdTemp })
            .then((v) => {
                r = { ok: true, v }
            })
            .catch((e) => {
                r = { ok: false, v: e }
            })
        return r
    }

    //bads, 轉檔必失敗之輸入: 副檔名為.docx但內容非docx, 損毀之docx(截去後半之zip)
    let bads = [
        {
            name: 'a text file named .docx',
            gen: (fp) => {
                fs.writeFileSync(fp, 'this is plain text, not a docx\r\nline2')
            },
        },
        {
            name: 'a truncated (corrupt) docx',
            gen: (fp) => {
                let fpGood = writeDocx(`${fp}.good`, { title: 'Word fail corrupt', pages: 1 })
                let b = fs.readFileSync(fpGood)
                fs.writeFileSync(fp, b.subarray(0, Math.floor(b.length / 2)))
                fs.rmSync(fpGood, { force: true })
            },
        },
    ]

    before(async function() {
        this.timeout(120000)

        //前一組之轉檔器所開之Word可能仍在結束中
        await waitWordGone(wordPids().filter(isAutomationWord), 30000)

        //有其他Word(含使用者開啟者)時不跑本組, 免本組之收尾誤傷與判定受干擾
        let pids = wordPids()
        if (pids.length > 0) {
            console.log(`skip [when cv.exe fails internally]: other WINWORD is running(${pids.join(',')})`)
            this.skip()
        }
        pre = pids

        restoreBinEnv = setBinEnv('WDocx2pdf-fail-bin')

        //先取得轉檔器至快取
        await WDocx2pdf.ensureBins()

        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdOut, { recursive: true })
        fs.mkdirSync(fdTemp, { recursive: true })

        //先前被強制結束之Word所留下、指向本套件檔案之停用項目, 會使開檔跳出可見訊息框而停住, 先清除
        let rd = clearDisabledItems(path.resolve('.'))
        if (rd.removed.length > 0 || rd.failed.length > 0) {
            console.log(`Word disabled items under this package: ${JSON.stringify(rd)}`)
        }

        watch = await startVisibleWordWatch(path.join(fdTmp, 'watch.stop'))
    })

    after(async function() {
        this.timeout(60000)
        if (watch) {
            await watch.stop()
        }

        //收尾: 只結束本組新出現且經COM自動化啟動之WINWORD(各案已斷言不殘留, 此處為失敗時之清理); 開檔失敗之Word可能留下停用項目, 一律清除指向本套件之項目並記錄
        if (pre !== null) {
            let rk = await killNewAutomationWords(pre)
            let rd = clearDisabledItems(path.resolve('.'))
            if (rk.killed.length > 0 || rd.removed.length > 0 || rd.failed.length > 0) {
                console.log(`cleanup: killed WINWORD ${JSON.stringify(rk)}, Word disabled items ${JSON.stringify(rd)}`)
            }
        }
        if (restoreBinEnv) {
            restoreBinEnv()
        }
        fs.rmSync(fdTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        try {
            fs.rmdirSync(path.resolve('./test/_tmp')) //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    })

    //前一案失敗時其模擬之他次暫存檔亦須移除, 免連帶影響其後各案
    afterEach(function() {
        fs.rmSync(path.join(fdTemp, fnDecoy), { force: true })
    })

    for (let c of bads) {
        it(`${c.name}: rejects "[E_CONVERT_FAILED] <Word diagnosis>" (decoded, no paths), leaves no temp file of this call, keeps the existing output file, no WINWORD residue`, async function() {
            this.timeout(180000)
            let iw = watch.lines.length
            let fpIn = path.join(fdTmp, `bad-${bads.indexOf(c)}.docx`)
            let fpOut = path.join(fdOut, `bad-${bads.indexOf(c)}.pdf`)
            c.gen(fpIn)
            fs.writeFileSync(fpOut, 'STALE-OLD-CONTENT')
            fs.writeFileSync(path.join(fdTemp, fnDecoy), 'other call input')

            let r = await conv(fpIn, fpOut)

            //規格①: reject字串`[E_CONVERT_FAILED] 原因`, 原因為Word之診斷(非固定說明), 不亂碼, 不含輸入或輸出路徑
            assert.strict.equal(r.ok, false, `resolved [${r.v}]`)
            assert.strict.equal(typeof r.v, 'string', String(r.v))
            assert.strict.equal(r.v.startsWith(prefix), true, r.v)
            let reason = r.v.slice(prefix.length)
            assert.strict.equal(reason.includes('Microsoft Word'), true, r.v)
            assert.strict.equal(fixedReasons.includes(reason), false, r.v)
            assert.strict.equal(r.v.includes('�'), false, r.v)
            assert.strict.equal(r.v.includes('can not convert'), false, r.v)
            for (let p of [fpIn, fpOut, fdTemp, fdTmp]) {
                assert.strict.equal(r.v.includes(p), false, r.v)
                assert.strict.equal(r.v.includes(p.replace(/\\/g, '/')), false, r.v)
                assert.strict.equal(r.v.includes(p.replace(/\\/g, '\\\\')), false, r.v)
            }

            //規格①: 輸出路徑上既有之檔不被改動
            assert.strict.equal(fs.readFileSync(fpOut, 'utf8'), 'STALE-OLD-CONTENT')

            //規格②: fdTemp內只剩他次呼叫之暫存檔(afterEach移除之), 資料夾本身保留
            assert.strict.deepEqual([fnDecoy], tempFiles())

            //規格④: 不殘留WINWORD, 不開啟可見視窗
            assert.strict.deepEqual([], await waitWordGone(newPids()))
            await assertNoVisible(iw)
        })
    }

    it('removes both temp files also when the converted PDF can not be copied to fpOut (fpOut is an existing folder): rejects, no temp file, the folder is untouched', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let fpIn = writeDocx(path.join(fdTmp, 'out-is-folder.docx'), { title: 'Word fail out folder', pages: 1 })
        let fpOut = path.join(fdOut, 'out-is-folder.pdf')
        fs.mkdirSync(fpOut)

        let r = await conv(fpIn, fpOut)

        //規格①: 轉檔成功後複製至fpOut失敗(fpOut為資料夾), 此時輸出暫存檔已存在; reject之值為複製之錯誤(型態同改前, 非[E_CONVERT_FAILED])
        assert.strict.equal(r.ok, false, `resolved [${r.v}]`)
        assert.strict.equal(Boolean(r.v), true)
        assert.strict.equal(fs.statSync(fpOut).isDirectory(), true)
        assert.strict.deepEqual([], fs.readdirSync(fpOut))

        //規格②: 輸入複本與輸出暫存皆清除
        assert.strict.deepEqual([], tempFiles())
        assert.strict.deepEqual([], await waitWordGone(newPids()))
        await assertNoVisible(iw)
    })

    it('a normal docx after the failures still resolves "ok" with a valid PDF of its own pages, and leaves no temp file', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let fpIn = writeDocx(path.join(fdTmp, 'after-fail.docx'), { title: 'Word fail after', pages: 2 })
        let fpOut = path.join(fdOut, 'after-fail.pdf')

        let r = await conv(fpIn, fpOut)

        //規格③: resolve 'ok', 輸出為來源之2頁PDF
        assert.strict.deepEqual({ ok: true, v: 'ok' }, r)
        assert.strict.deepEqual({ isPdf: true, hasEof: true, pages: 2 }, pdfInfo(fpOut))

        //規格②③: 成功路徑亦清除暫存
        assert.strict.deepEqual([], tempFiles())
        assert.strict.equal(fs.existsSync(fdTemp), true)

        //規格④
        assert.strict.deepEqual([], await waitWordGone(newPids()))
        await assertNoVisible(iw)
    })

})
