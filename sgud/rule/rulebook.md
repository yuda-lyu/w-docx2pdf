# w-docx2pdf 規則帳本(藍圖)

## 1. 外部執行檔之存放、下載、校驗與離線(2026-10-28 導入)

- **正本規格**:`C:\opensrcOper\dspec\外部執行檔之存放下載校驗與離線.md`(本節只摘要並指回,條號 S／M／D／O／E／T 皆依該規格;規格變動以其為準).
- **本套件類別**:主控帳本 G10 之 **B 類**(原自主幹 `src/cv.exe` 直連下載、無校驗)→ 改為**釘選模式**(`mode: "pinned"`).

### 1.1 規則

| 編號 | 規則 | 對應規格 | 落點 |
|---|---|---|---|
| R-BIN-01 | 外部執行檔僅 `cv.exe`(自有檔,`srcPython/cv.py` 之 PyInstaller 產物),存於 repo `bin/cv.exe`;npm 包只含 `bin/manifest.json`,不含任何執行檔 | S1、S2 | `.npmignore`:`/bin/*`、`!/bin/manifest.json`、`/bin-cache/`、`src/cv.exe` |
| R-BIN-02 | 清單 `bin/manifest.json` 由 `toolg/genBinManifest.mjs --commit <含 bin/ 實檔之 40 碼提交>` 產生,不手寫;釘選提交 `495f7eb9bff777dd400753ad494b75b975f0169e` | M1、M2、U1 | `toolg/genBinManifest.mjs`、`bin/manifest.json` |
| R-BIN-03 | 取得執行檔之唯一入口為 `src/ensureBins.mjs`(轉呼叫 wsemi `fsEnsureBins`,`pkgRoot` 固定為本套件根,不轉傳 `floatingManifestUrl`);本套件不得另寫下載、快取、鏡像、校驗 | E2 | `src/ensureBins.mjs`;使用處 `src/WDocx2pdf.mjs`(`ensureBins({ names: 'cv.exe' })`) |
| R-BIN-04 | 不在 `postinstall` 下載(首次使用時才取);`package.json` 無 `postinstall` | D1 | `package.json` scripts 僅 `test`、`deploy` |
| R-BIN-05 | 匯出 `ensureBins()`:子路徑 `w-docx2pdf/src/ensureBins.mjs`,及預設匯出之屬性 `WDocx2pdf.ensureBins`(預設匯出須仍為函數,UMD 之 `module.exports` 不變) | D1、E2③ | `src/WDocx2pdf.mjs` 檔尾 |
| R-BIN-06 | 舊公開子路徑 `w-docx2pdf/src/autoDownloadFiles.mjs` 保留為相容轉接(回傳 `{ fpExe }`),內部經 `ensureBins` | — | `src/autoDownloadFiles.mjs` |
| R-BIN-07 | **舊版相容**:舊版於執行時自主幹 `src/cv.exe` 下載,故 repo 之 `src/cv.exe` 須保留(不入 npm 包),內容須與 `bin/cv.exe` 位元相同,至舊版淘汰後另案移除 | S2 | `test/unit-binManifest.test.mjs`(S2 案) |
| R-BIN-08 | `.gitattributes` 設 `bin/** binary`;`.gitignore` 與 `.npmignore` 皆列 `/bin-cache/`;`.npmignore` 另列 `test/_tmp`、`sgud` | S5、M1 補充(F12) | `.gitattributes`、`.gitignore`、`.npmignore` |
| R-BIN-09 | UMD 建置(`toolg/gDistRollup.mjs`)須把 wsemi `fsEnsureBins` 所用之 Node 內建模組列為 external:`crypto`、`stream`、`stream/promises`、`url`(另 `path`、`fs`、`process`、`child_process`);`ensureBins.mjs` 之 `import.meta.url` 由 rollup 換成產物檔位置,`src/` 與 `dist/` 皆在套件根下一層,故 `pkgRoot=..` 兩者皆對 | E2 | `toolg/gDistRollup.mjs` |

### 1.2 站點全集與盤點

- 下載／取用執行檔之站點:改造前 `src/downloadFiles.mjs:18`(`fsDownloadFile` 直連)、`scripts/install.mjs:21`(postinstall)、`src/autoDownloadFiles.mjs:68`(併發共用 Promise)、`src/WDocx2pdf.mjs:120`(取路徑);改造後僅 `src/ensureBins.mjs`(唯一轉呼叫點)與其使用處 `src/WDocx2pdf.mjs`、`src/autoDownloadFiles.mjs`.
- 盤點指令:`node C:/opensrcOper/tools/scan-bins.mjs --only w-docx2pdf`(應為 `OK`);`Grep` 搜 `src/` 之 `fsDownloadFile\b|postinstall|raw/refs/heads` 應無命中(註解除外).

### 1.3 測試對照(規格 §8)

| 編號 | 測試 |
|---|---|
| T1 | `test/unit-binManifest.test.mjs`:`npm pack --dry-run` 只含 `bin/manifest.json`,無 `.exe` 等,且無 `src/cv.exe` |
| T2 | 同上:`bin/` 實檔與清單之 sha256／大小一致;`src/cv.exe` 與 `bin/cv.exe` 位元相同 |
| T3 | `test/unit-ensureBins.test.mjs`:本機 HTTP 伺服器扮 GitHub(注入 `fetch` 改寫主機),首次下載、校驗、快取;第二次 `fetch` 不得被呼叫;網址為釘選提交之 raw 路徑;並發呼叫共用一次下載 |
| T4 | 同上:同大小異內容 `E_HASH_MISMATCH`、截短／多一位元組 `E_SIZE_MISMATCH`、404 `E_HTTP`,皆不留檔 |
| T5 | 同上:`W_BIN_MIRROR`(本地資料夾)自鏡像取得且不連網;鏡像檔被改→離線 `E_OFFLINE_MISSING`、線上退回 GitHub |
| T6 | 同上:`W_BIN_OFFLINE=1` 無快取無鏡像→`E_OFFLINE_MISSING`,訊息含檔名、sha256、大小、應放之完整快取路徑 |
| T7 | 同上:快取檔被改(同大小與不同大小)→重新取得;離線時改檔→`E_OFFLINE_MISSING` |
| T8 | 不適用(釘選模式);`unit-binManifest` 斷言 `mode==='pinned'`,改主幹模式時須補此項 |
| 功能 | `test/WDocx2pdf.test.mjs`:以本地資料夾鏡像供 `bin/cv.exe`、快取放 `test/_tmp`,實際跑 Word 轉檔(需 Windows 與 Microsoft Word) |

### 1.4 更新流程(U1)

替換 `bin/cv.exe` → **同步複製到 `src/cv.exe`**(舊版相容,R-BIN-07)→ 提交並推 GitHub(得提交雜湊)→ `node toolg/genBinManifest.mjs --commit <該提交>` → `npm test` → 發布新版套件(兩步提交:執行檔之提交在前,清單引用它).
