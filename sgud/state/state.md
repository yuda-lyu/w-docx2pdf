# w-docx2pdf 現況

(只記現況,不寫過程;過程見 `sgud/exp/experience.md`.最後更新:2026-10-28)

## 功能

| 功能 | 狀態 | 規則帳本 | 測試 |
|---|---|---|---|
| `WDocx2pdf(fpIn, fpOut, opt)`:`mode='MicrosoftOffice'` 經 `cv.exe`(Word)轉檔 | 可用;`cv.exe` 經 `ensureBins({ names: 'cv.exe' })` 取得 | R-BIN-03 | `test/WDocx2pdf.test.mjs`(需 Windows＋Word,以本地鏡像供檔) |
| `WDocx2pdf`:`mode='LibreOffice'` | 可用(未變) | — | 無測試 |
| 外部執行檔 `cv.exe`:釘選模式,清單 `bin/manifest.json`(提交 `495f7eb9bff777dd400753ad494b75b975f0169e`),首次使用才下載,快取 `bin-cache/`,支援 `W_BIN_CACHE`／`W_BIN_MIRROR`／`W_BIN_OFFLINE` | 完成 | R-BIN-01～09 | `test/unit-binManifest.test.mjs`(T1、T2)、`test/unit-ensureBins.test.mjs`(T3～T7);T8 不適用 |
| `ensureBins()` 匯出:`w-docx2pdf/src/ensureBins.mjs`、`WDocx2pdf.ensureBins` | 完成 | R-BIN-05 | `test/unit-ensureBins.test.mjs`;UMD 於 tmp 建置驗證(未重建追蹤中之 `dist/`) |
| `autoDownloadFiles()`(舊公開子路徑) | 保留為相容轉接,回傳 `{ fpExe }` | R-BIN-06 | `test/unit-ensureBins.test.mjs` |

## 已知缺口與待辦

- **`test/WDocx2pdf.test.mjs` 之 `convert` 本機修前即紅**:斷言轉出 PDF 大小等於 `test/ztmpTrue.pdf`(90895),本機 Word 轉出為 135319(1 頁,內容有效).非外部執行檔改造造成;待裁示(建議改為語意斷言,如 `%PDF-` 檔頭、頁數,或以本機重產參考檔).
- 追蹤中之 `dist/`、`docs/` 尚為改造前建置(內含舊的下載邏輯),待發布流程重建.
- `src/cv.exe` 為舊版相容保留,至舊版淘汰後另案移除(R-BIN-07).
- 發布時須確認:`npm pack --dry-run` 只含 `bin/manifest.json`、`dist/` 已重建.

## 最近一次驗證

- 2026-10-28:`npm test` 新增 19 案綠(見報告),原有 `convert` 1 案紅(同修前).`node C:/opensrcOper/tools/scan-bins.mjs --only w-docx2pdf` → OK.
