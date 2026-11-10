# w-docx2pdf
A tool for docx2pdf.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-docx2pdf.svg?style=flat)](https://npmjs.org/package/w-docx2pdf) 
[![license](https://img.shields.io/npm/l/w-docx2pdf.svg?style=flat)](https://npmjs.org/package/w-docx2pdf) 
[![npm download](https://img.shields.io/npm/dt/w-docx2pdf.svg)](https://npmjs.org/package/w-docx2pdf) 
[![npm download](https://img.shields.io/npm/dm/w-docx2pdf.svg)](https://npmjs.org/package/w-docx2pdf) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-docx2pdf.svg)](https://www.jsdelivr.com/package/npm/w-docx2pdf)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-docx2pdf/global.html).

## Core
> `w-docx2pdf` converts docx to pdf with `Microsoft Word` via COM (`pywin32`, in a bundled executable), and only run in `Windows`. It starts its own Word instance and only closes its own documents, so a Word opened by the user or by other processes is not borrowed or closed.

## Installation

### Using npm(ES6 module):
```alias
npm i w-docx2pdf
```

#### Example:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-docx2pdf/blob/master/g.mjs)]
```alias
import WDocx2pdf from './src/WDocx2pdf.mjs'
//import WDocx2pdf from 'w-docx2pdf/src/WDocx2pdf.mjs'
//import WDocx2pdf from 'w-docx2pdf'

async function test() {

    let fpIn = `./test/ztmp.docx`
    let fpOut = `./test/ztmp.pdf`
    let opt = {}

    let r = await WDocx2pdf(fpIn, fpOut, opt)
    console.log(r)
    // => ok

    w.fsDeleteFile(fpOut)

}
test()
    .catch((err) => {
        console.log('catch', err)
    })
```

## 轉檔失敗之回報

`WDocx2pdf()` 成功時 resolve `'ok'`;失敗時 reject,型態如下(判斷失敗原因請用字串前綴或 `code`,不要比對完整訊息):

| 情形 | reject 之值 |
|---|---|
| 非 Windows、`fpIn` 不存在、`opt.fpExeLibreOffice` 不存在 | 說明字串 |
| `mode='MicrosoftOffice'` 取不到 `cv.exe` | 字串 `[code] 訊息`(code 取自 `ensureBins()`,如 `[E_OFFLINE_MISSING] …`,見〈外部執行檔〉;舊版為 Error 物件) |
| 轉檔程式無法執行或離開碼非 0 | `execProcess` 之訊息字串(如 `code[N]:\n...`) |
| 轉檔失敗(輸入非 docx、docx 損毀、Word 無法開啟等) | 字串 `[E_CONVERT_FAILED] 原因`;`mode='MicrosoftOffice'` 時原因為 Word 之診斷(已依系統字碼頁解碼,不回顯輸入或輸出路徑,但 Word 之診斷可能自行含檔名) |
| 轉檔程式報成功卻未產生輸出檔(或為空檔) | 字串 `[E_CONVERT_FAILED] output file was not generated or is empty` |
| 轉檔成功但複製至 `fpOut` 失敗(如 `fpOut` 為既有資料夾) | fs 之錯誤物件 |

- 轉檔失敗時不會產生或覆蓋 `fpOut`;各情形(含失敗)皆清除本次於 `opt.fdTemp` 內之輸入複本與輸出暫存檔,不刪 `opt.fdTemp` 資料夾本身,不動他次呼叫之暫存檔.
- **Breaking changes(2026-11-11)**:`mode='MicrosoftOffice'` 轉檔失敗原本 reject 固定字串 `can not convert`(Word 之錯誤原因遺失),現改為 `[E_CONVERT_FAILED] 原因`;兩種模式「未產生輸出檔」之固定字串亦由 `can not convert` 改為 `[E_CONVERT_FAILED] output file was not generated or is empty`.以字串比對 `can not convert` 判斷失敗者,請改以前綴 `[E_CONVERT_FAILED]` 判斷.成功時之回傳值與輸出內容不變.
- 轉檔失敗原本會在 `fdTemp`(預設為工作目錄下之 `./_convertTempPdf`)留下一份輸入文件之複本,現已清除.

## 外部執行檔

本套件執行時需要下列外部執行檔(僅 `mode='MicrosoftOffice'` 使用),不含於 npm 包:

| 檔名 | 用途 | 來源 |
|---|---|---|
| cv.exe | 呼叫 Microsoft Office 將 docx 轉為 pdf | 本套件 GitHub repo 之 `bin/`(釘選提交,見 `bin/manifest.json`) |

- 首次使用到相關功能時自動下載(或預先呼叫本套件匯出之 `ensureBins()`),以 `bin/manifest.json` 所載之 SHA-256 與大小校驗後存於 `<套件根>/bin-cache/`;之後自快取取得(亦校驗).安裝時不下載(不使用 `postinstall`).
- 預先取得: `import ensureBins from 'w-docx2pdf/src/ensureBins.mjs'`(或 `WDocx2pdf.ensureBins`),`let bins = await ensureBins()` 回傳 `{ 'cv.exe': <絕對路徑> }`.
- 環境變數:
  - `W_BIN_CACHE=<資料夾>`:快取改放 `<資料夾>/w-docx2pdf/`(套件所在之 `node_modules` 唯讀時使用,多套件可共用同一資料夾).
  - `W_BIN_MIRROR=<資料夾或 http(s) 網址>`:內網鏡像,先找鏡像再連 GitHub;結構為 `<鏡像>/w-docx2pdf/<sha256>/cv.exe`.鏡像之檔同樣以清單校驗,不符即不用.
  - `W_BIN_OFFLINE=1`:不連網,只用快取與鏡像;缺檔時錯誤(`E_OFFLINE_MISSING`)會列出缺哪些檔、sha256、大小與應放之完整路徑.
- 離線部署:
  1. 在可連網之電腦設 `W_BIN_CACHE=<空資料夾>`,呼叫本套件之 `ensureBins()` 一次(或使用到相關功能一次).
  2. 把該資料夾整個帶到內網電腦,設 `W_BIN_MIRROR=<該資料夾>`(全離線時另設 `W_BIN_OFFLINE=1`).
