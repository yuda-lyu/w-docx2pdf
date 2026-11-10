import fs from 'fs'
import isestr from 'wsemi/src/isestr.mjs'


//cv.exe(srcPython/cv.py之run)不論成敗離開碼皆為0, 成敗只能依輸出(stdout與stderr合併之字串)判定. 輸出之形態(實測自真Word):
//  ①首行恆為輸入參數字典之回顯`{'fpIn': ..., 'fpOut': ..., 'opt': {}}`(含輸入路徑), 其餘輸出不得原樣回顯
//  ②成功: 其後印`success`
//  ③轉檔例外(如輸入非docx, 損毀docx, Word無法開啟): cv.py之cv()吞掉例外, 印出錯誤字典單行`{'type': <class '...'>, 'message': '...', 'traceback': [...]}`, 其後仍印`success`(此時不產生輸出檔)
//  ④外層失敗(參數解析等, cv.py之core): 印`error: <原因>`, 不印`success`
//  另stderr可能有`Word instance is kept since ...`(R-WORD-02, 不以`error:`起首), 合併後不影響判定
let codeFail = 'E_CONVERT_FAILED'


//failMsg, 組出失敗訊息`[E_CONVERT_FAILED] 原因`, 內部函數(不入JSDoc), 失敗碼與格式僅此一處
function failMsg(detail) {
    return `[${codeFail}] ${detail}`
}


//pyUnescape, 還原Python repr輸出之字串內容(已去外層引號): 反斜線, 引號, 控制字元, \xNN, \uNNNN, \UNNNNNNNN, 換行與定位字元改為空白使訊息維持單行
function pyUnescape(s) {
    return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[\\'"nrt])/g, (m, k) => {
        if (k === 'n' || k === 'r' || k === 't') {
            return ' '
        }
        if (k.length === 1) {
            return k
        }
        let cp = parseInt(k.slice(1), 16)
        return cp <= 0x10FFFF ? String.fromCodePoint(cp) : m
    })
}


//reErrDict, cv.py錯誤字典單行之特徵: 以`{'type': `起首(輸入參數字典之鍵為fpIn, 故不會誤中), 含`'message': `, 以`'traceback': [...]}`結尾; message取貪婪比對至最後一個`, 'traceback': [`
let reErrDict = /^\{'type': .*?, 'message': (.*), 'traceback': \[.*\]\}$/


//parseErrDict, 判定單行是否為cv.py之錯誤字典: 否回傳null; 是回傳其message(Python repr還原為字串, 可為空字串; 引號不成對而無法還原時亦為空字串)
function parseErrDict(line) {
    let m = line.match(reErrDict)
    if (m === null) {
        return null
    }
    let r = m[1]
    let q = r.charAt(0)
    if (r.length >= 2 && (q === `'` || q === `"`) && r.endsWith(q)) {
        return pyUnescape(r.slice(1, -1)).trim()
    }
    return ''
}


//judgeConvertOutput, 依cv.exe之輸出判定轉檔成敗, 內部函數(不入JSDoc), 回傳{ ok, msg }
//判準為fail-closed: 輸出中任一行為失敗標記(以`error:`開頭, 或為cv.py之錯誤字典)視為失敗(即使同時有`success`行), 原因取輸出順序之第一個失敗標記; 無失敗標記時須有整行為`success`之行才視為成功; 其餘(空輸出, 未知輸出, 非字串)一律視為失敗
//失敗訊息為`[E_CONVERT_FAILED] 原因`, 原因取自`error:`之後之文字或錯誤字典之message(Word之診斷), 無原因文字時為固定說明, 不回顯其餘輸出內容(含輸入路徑)
function judgeConvertOutput(out) {
    let lines = isestr(out) ? out.split(/\r?\n/).map((v) => v.trim()) : []

    //失敗標記, 依輸出順序取第一個
    for (let line of lines) {
        let detail = null
        if (line.startsWith('error:')) {
            detail = line.slice('error:'.length).trim()
        }
        else {
            detail = parseErrDict(line)
        }
        if (detail !== null) {
            return { ok: false, msg: failMsg(detail !== '' ? detail : 'cv.exe reported an error') }
        }
    }

    //成功須有明確之success行
    if (lines.includes('success')) {
        return { ok: true, msg: '' }
    }

    return { ok: false, msg: failMsg('cv.exe returned no success result') }
}


//judgeConvertFile, 判成功後另驗輸出檔: fp須為存在且大小>0之檔案, 否則視為失敗, 內部函數(不入JSDoc), 回傳{ ok, msg }
//失敗訊息為固定說明, 不回顯路徑; 兩種轉檔模式(cv.exe與LibreOffice)共用
function judgeConvertFile(fp) {
    let ok = false
    try {
        if (isestr(fp)) {
            let st = fs.statSync(fp)
            ok = st.isFile() && st.size > 0
        }
    }
    catch (err) {
        ok = false
    }
    if (ok) {
        return { ok: true, msg: '' }
    }
    return { ok: false, msg: failMsg('output file was not generated or is empty') }
}


export default judgeConvertOutput
export { judgeConvertFile }
