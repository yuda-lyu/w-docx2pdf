# w-docx2pdf 現況

(只記現況,不寫過程;過程見 `sgud/exp/experience.md`.最後更新:2026-11-11)

## 功能

| 功能 | 狀態 | 規則帳本 | 測試 |
|---|---|---|---|
| `WDocx2pdf(fpIn, fpOut, opt)`:`mode='MicrosoftOffice'` 經 `cv.exe`(Word)轉檔 | 可用;`cv.exe` 經 `ensureBins({ names: 'cv.exe' })` 取得 | R-BIN-03 | `test/WDocx2pdf.test.mjs`(需 Windows＋Word,以本地鏡像供檔) |
| 轉檔器 `cv.exe` 之 Word 取得與收尾:`DispatchEx` 每次另起實例、輸入唯讀開啟、只結束自己之實例(實例內有他人文件或無法判定時不 Quit),不再依賴第三方 `docx2pdf` | **原始碼與 `bin/cv.exe`、`src/cv.exe` 已換新(第一段);清單 `bin/manifest.json` 未重產,待主控提交後第二段**(見下) | R-WORD-01～06 | `test/WDocx2pdf.test.mjs`〈Word instance isolation〉6 案(①③②交錯②同時②同檔④) |
| `WDocx2pdf`:`mode='LibreOffice'` | 可用(未變) | — | 無測試 |
| 外部執行檔 `cv.exe`:釘選模式,清單 `bin/manifest.json`(目前仍為舊提交 `495f7eb9bff777dd400753ad494b75b975f0169e` 與舊 `cv.exe` 之 sha256／大小),首次使用才下載,快取 `bin-cache/`,支援 `W_BIN_CACHE`／`W_BIN_MIRROR`／`W_BIN_OFFLINE` | 完成(清單待第二段重產) | R-BIN-01～09 | `test/unit-binManifest.test.mjs`(T1、T2)、`test/unit-ensureBins.test.mjs`(T3～T7);T8 不適用 |
| `ensureBins()` 匯出:`w-docx2pdf/src/ensureBins.mjs`、`WDocx2pdf.ensureBins` | 完成 | R-BIN-05 | `test/unit-ensureBins.test.mjs`;UMD 於 tmp 建置驗證(未重建追蹤中之 `dist/`) |
| `autoDownloadFiles()`(舊公開子路徑) | 保留為相容轉接,回傳 `{ fpExe }` | R-BIN-06 | `test/unit-ensureBins.test.mjs` |

## 執行檔換版(第一段已做,第二段待主控)

- 第一段(排程第 408 項,2026-11-11):`srcPython/cv.py` 改自寫 Word COM,重建 `bin/cv.exe` 並同步 `src/cv.exe`(兩者位元相同).新 `cv.exe`:sha256 `e7542543890f423a6e23baaa25372328a8ae8334ad0f01dc4a531de4e6d827bd`,9517102 位元組(前版 `cd1d36ac…`/12601507).
- **第二段(主控提交並推送後)**:`node toolg/genBinManifest.mjs --commit <新提交>` 重產 `bin/manifest.json`(只應有 `commit`、`sha256`、`size` 三處變動),再跑全套.清單重產前 `npm test` 有 11 條預期失敗(皆為清單與 `bin/` 實檔不符:ensureBins 相關 7 條＋autoDownloadFiles 1 條＋`convert` 1 條＋〈Word instance isolation〉before 1 條〔其下 6 案未執行〕＋manifest T2 1 條);清單重產後預期 26 passing／0 failing.

## 已知缺口與待辦

- **`README.md` 仍寫「based on the `docx2pdf` in `python`」**:轉檔器已不依賴該套件(轉出方式等價,見 R-WORD-06),措辭是否改寫待裁示.
- `srcPython/test.py`(`from docx2pdf import convert`)為舊測試版腳本,本機未裝該套件即不可執行,未動.
- 追蹤中之 `dist/`、`docs/` 尚為改造前建置(內含舊的下載邏輯),待發布流程重建.
- `src/cv.exe` 為舊版相容保留,至舊版淘汰後另案移除(R-BIN-07).
- 發布時須確認:`npm pack --dry-run` 只含 `bin/manifest.json`、`dist/` 已重建.
- Word 實例隔離之已知限制:盤點與 Quit 之間他人仍可連入;他人取用本行程已開之同一文件物件時本行程之 Close 仍會關掉它;不含資料夾批次轉檔(R-WORD-06).

## 最近一次驗證

- 2026-11-11:模擬夾(新 `cv.exe`＋清單改為其 sha256／大小)全套 26 passing／0 failing(isolation 6 案另重複 3 次皆綠);修前 exe 之 isolation 6 案全紅;L3:新舊 exe 轉 4 份 docx(`ztmp`、含表格圖片頁碼之 4 頁、3 頁、7 頁)之 PDF 頁數、頁尺寸、各頁文字、字型皆相同.repo 內 `npm test`(清單未重產)10 passing／11 failing(預期,見上).
