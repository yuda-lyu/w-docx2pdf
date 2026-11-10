# w-docx2pdf 現況

(只記現況,不寫過程;過程見 `sgud/exp/experience.md`.最後更新:2026-11-11)

## 功能

| 功能 | 狀態 | 規則帳本 | 測試 |
|---|---|---|---|
| `WDocx2pdf(fpIn, fpOut, opt)`:`mode='MicrosoftOffice'` 經 `cv.exe`(Word)轉檔 | 可用;`cv.exe` 經 `ensureBins({ names: 'cv.exe' })` 取得 | R-BIN-03 | `test/WDocx2pdf.test.mjs`(需 Windows＋Word,以本地鏡像供檔) |
| **轉檔失敗之回報與暫存清除**(排程第 410 項,2026-11-11):`cv.exe` 不論成敗離開碼皆 0,`WDocx2pdf()` 依其輸出判定(`src/judgeConvertOutput.mjs`:`error:` 行或 `cv.py` 之錯誤字典行任一為失敗、須有整行 `success` 才成功),判成功後另驗輸出暫存檔存在且大小 > 0(兩模式共用);失敗 reject `[E_CONVERT_FAILED] 原因`(原因為 Word 之診斷,不回顯路徑;輸出以 `codeCmd: 'auto'` 解碼);所有返回路徑(成功、取不到 `cv.exe`、各 reject)皆於 `finally` 清除本次之 `fdTemp` 內輸入複本與輸出暫存,不刪 `fdTemp` 資料夾、不動他次暫存檔.成功時 resolve `'ok'` 與輸出內容不變;對外行為變化(固定字串 `can not convert` 不再出現)見 README〈轉檔失敗之回報〉.exe 未重建 | 已完成 | R-CONVERT-RESULT-01～04、R-CONVERT-TEMP-01 | `test/unit-judgeConvertOutput.test.mjs`(純函數)、`test/unit-WDocx2pdfTemp.test.mjs`(不需 Word 之清除)、`test/WDocx2pdf.test.mjs`〈when cv.exe fails internally〉(真 Word 4 案) |
| 轉檔器 `cv.exe` 之 Word 取得與收尾:`DispatchEx` 每次另起實例、輸入唯讀開啟、只結束自己之實例(實例內有他人文件或無法判定時不 Quit),不再依賴第三方 `docx2pdf` | 完成;原始碼、`bin/cv.exe`、`src/cv.exe`、清單 `bin/manifest.json` 皆已換新(見下) | R-WORD-01～06 | `test/WDocx2pdf.test.mjs`〈Word instance isolation〉6 案(①③②交錯②同時②同檔④) |
| `WDocx2pdf`:`mode='LibreOffice'` | 可用(未變) | — | 無測試 |
| 外部執行檔 `cv.exe`:釘選模式,清單 `bin/manifest.json`(釘選提交 `ba266e1d88ddf4ba2652c5a5ba3e7a68e6353525`,sha256／大小為新 `cv.exe`),首次使用才下載,快取 `bin-cache/`,支援 `W_BIN_CACHE`／`W_BIN_MIRROR`／`W_BIN_OFFLINE` | 完成 | R-BIN-01～09 | `test/unit-binManifest.test.mjs`(T1、T2)、`test/unit-ensureBins.test.mjs`(T3～T7);T8 不適用 |
| `ensureBins()` 匯出:`w-docx2pdf/src/ensureBins.mjs`、`WDocx2pdf.ensureBins` | 完成 | R-BIN-05 | `test/unit-ensureBins.test.mjs`;UMD 於 tmp 建置驗證(未重建追蹤中之 `dist/`) |
| `autoDownloadFiles()`(舊公開子路徑) | 保留為相容轉接,回傳 `{ fpExe }` | R-BIN-06 | `test/unit-ensureBins.test.mjs` |

## 執行檔換版(兩段皆已完成)

- 第一段(排程第 408 項,2026-11-11):`srcPython/cv.py` 改自寫 Word COM,重建 `bin/cv.exe` 並同步 `src/cv.exe`(兩者位元相同).新 `cv.exe`:sha256 `e7542543890f423a6e23baaa25372328a8ae8334ad0f01dc4a531de4e6d827bd`,9517102 位元組(前版 `cd1d36ac…`/12601507).
- 第二段(主控提交 `e7e65e0`):`bin/manifest.json` 已依新提交 `ba266e1d…` 重產(`commit`、`sha256`、`size`);排程第 410 項實測全套含 `unit-binManifest`、`unit-ensureBins` 皆綠.
- **`cv.exe` 之成敗信號形態**(排程第 410 項實測,本輪不重建 exe):轉檔例外時輸出為「參數回顯行＋錯誤字典單行＋`success`」(無 `error:`),外層失敗才印 `error:`;`WDocx2pdf.mjs` 已依此判定(R-CONVERT-RESULT-02).下次重建 exe 時宜讓 `cv()` 失敗拋出(回饋 #5),判定函數相容.

## 已知缺口與待辦

- 取不到 `cv.exe` 時 `WDocx2pdf()` reject 字串 `[code] message`(2026-11-11 主控裁示統一,同 w-docx-split、w-html2docx、w-docx2html;舊版為 Error 物件).
- LibreOffice 模式本機未裝,其失敗路徑之暫存清除以假啟動檔驗證(非真 LibreOffice);其 `execProcess` 未加 `codeCmd: 'auto'`.
- `srcPython/test.py`(`from docx2pdf import convert`)為舊測試版腳本,本機未裝該套件即不可執行,未動.
- 追蹤中之 `dist/`、`docs/` 尚為改造前建置(內含舊的下載邏輯),待發布流程重建.
- `src/cv.exe` 為舊版相容保留,至舊版淘汰後另案移除(R-BIN-07).
- 發布時須確認:`npm pack --dry-run` 只含 `bin/manifest.json`、`dist/` 已重建.
- Word 實例隔離之已知限制:盤點與 Quit 之間他人仍可連入;他人取用本行程已開之同一文件物件時本行程之 Close 仍會關掉它;不含資料夾批次轉檔(R-WORD-06).

## 最近一次驗證

- 2026-11-11(排程第 410 項):全套 `npm test`(經測試鎖)59 passing／0 failing(5 檔:`unit-binManifest`、`unit-ensureBins`、`unit-judgeConvertOutput`、`unit-WDocx2pdfTemp`、`WDocx2pdf`);新增 33 案(修前:不需 Word 之 4 案與真 Word 之 3 案紅,見 `sgud/exp/experience.md`);變異 24 式中 22 式被殺,存活 2 式皆為等價變異(`judgeConvertFile` 去 `isFile()`、複製置於 `try` 前).
- 2026-11-11(排程第 408 項):模擬夾(新 `cv.exe`＋清單改為其 sha256／大小)全套 26 passing／0 failing(isolation 6 案另重複 3 次皆綠);修前 exe 之 isolation 6 案全紅;L3:新舊 exe 轉 4 份 docx(`ztmp`、含表格圖片頁碼之 4 頁、3 頁、7 頁)之 PDF 頁數、頁尺寸、各頁文字、字型皆相同.repo 內 `npm test`(清單未重產)10 passing／11 failing(預期,見上).
