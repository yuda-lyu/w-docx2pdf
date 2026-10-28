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
> `w-docx2pdf` is based on the `docx2pdf` in `python`, and only run in `Windows`.

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
