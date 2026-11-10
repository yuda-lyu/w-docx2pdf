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
| 功能 | `test/WDocx2pdf.test.mjs`:以本地資料夾鏡像供 `bin/cv.exe`、快取放 `test/_tmp`,實際跑 Word 轉檔(需 Windows 與 Microsoft Word);另含〈Word instance isolation〉6 案(R-WORD,見第 2 節) |

### 1.4 更新流程(U1)

替換 `bin/cv.exe` → **同步複製到 `src/cv.exe`**(舊版相容,R-BIN-07)→ 提交並推 GitHub(得提交雜湊)→ `node toolg/genBinManifest.mjs --commit <該提交>` → `npm test` → 發布新版套件(兩步提交:執行檔之提交在前,清單引用它).

建置:`srcPython/build.bat`(依 `cv.spec`,`python -m PyInstaller cv.spec --noconfirm --clean --distpath ..\bin`)直接輸出 `bin/cv.exe`;需 `pip install pyinstaller pywin32`,轉檔不再依賴第三方 `docx2pdf` 套件(2026-11-11 起,見 R-WORD-06).

## 2. R-WORD Word 實例須自行建立、只結束自己者(2026-11-11 導入)

來源:主控排程第 408 項(dp408,2026-11-11;範本為 w-html2docx 之 hd408,其 `sgud/rule/rulebook.md`〈R-WORD〉).原轉檔器借用第三方 `docx2pdf` 0.1.8 之 `convert`:其 `windows()` 以 `win32com.client.Dispatch("Word.Application")` 取得 Word、轉完 `word.Quit()`,`Dispatch` 先以 GetActiveObject 連上已登錄於 ROT 之 Word,故會借用他行程(轉檔或使用者互動中)之 Word 並於轉完將其關閉(含未存文件);兩行程同時轉檔亦互相破壞.本節規則之編號與內容同範本,三件成套(R-WORD-01、02、04):缺一即無法同時並行轉檔且不傷他人.

| 規則 | 內容 | 站點 | 測試 |
| --- | --- | --- | --- |
| R-WORD-01 | 取得 Word 一律 `win32com.client.DispatchEx('Word.Application')`(CoCreateInstanceEx,每次另起 WINWORD).**不得**用 `Dispatch`(含經第三方套件之 `Dispatch`) | `srcPython/cv.py` 之 `docxToPdf` | 〈Word instance isolation〉①②④ |
| R-WORD-02 | 只結束自己之實例:收尾一律經 `closeOwnWord`——關閉本行程之文件(關閉失敗者仍屬本行程,以 COM 物件身分比對,不以路徑),再以 `countOtherDocs` 盤點實例內非本行程之文件(含受保護檢視之 `ProtectedViewWindows`);有他人文件**或無法判定**(有界重試 10×0.5 秒後)時**不 Quit**(stderr 印 `Word instance is kept since …`),實例已不存在(RPC 斷線類錯誤)則不再動作,否則 `Quit(0)`.why:`DispatchEx` 所建之實例仍登錄於 ROT,他行程之 `Dispatch` 可連上並於其中開文件(範本實測);寧可留下實例,不關他人之文件.限制:盤點與 Quit 之間他人仍可連入;他人取用本行程已開之同一文件物件時,本行程之 Close 仍會關掉它 | `closeOwnWord`,`countOtherDocs` | ④ |
| R-WORD-03 | 例外路徑不殘留:`Visible`/`DisplayAlerts` 之設定與轉檔同在 `try` 內,任何例外(含開檔失敗、另存失敗)皆經 `finally` 之 `closeOwnWord`(原寫法例外時不關文件亦不 Quit,殘留 WINWORD) | `docxToPdf` | ③(a)(b) |
| R-WORD-04 | 輸入檔以唯讀開啟 `Documents.Open(fpIn, False, True)`(位置參數依序為 FileName,ConfirmConversions,ReadOnly);轉檔器只 `SaveAs` 至 pdf.why:各轉檔各一個實例,兩轉檔以可寫方式同開同一檔時,後開者跳出「檔案使用中」對話框(可見)而停住(範本實測).範本之「輸出即輸入須可寫」例外**本套件不適用**:輸出為 `.pdf`、輸入為 `.docx`,`resolvePaths` 已驗副檔名,兩者不可能同路徑,故無 `isSamePath`.限制:唯讀只解鎖檔情境,密碼、修復、安全警告等互動仍可能出現(改前即有) | `docxToPdf` | ②(同一輸入檔同時被兩個轉檔器開啟,無可見視窗、輸入檔位元不變、無 `~$` 擁有者檔) |
| R-WORD-05 | 不開可見視窗:`app.Visible = False`,`app.DisplayAlerts = False`(原寫法未設,密碼等提示會卡在隱藏之 Word);測試中扮演他行程之 Word 亦一律隱藏 | `docxToPdf`,`test/tools/wordInstance.mjs` | 全組(`assertNoVisible`) |
| R-WORD-06 | 轉出內容與 `docx2pdf` 0.1.8 單檔模式等價:`Documents.Open` 後 `doc.SaveAs(fpOut, FileFormat=17)`(wdFormatPDF,仍用 `SaveAs`,不改 `SaveAs2`/`ExportAsFixedFormat`),`doc.Close(0)`;`resolvePaths` 沿用其規則(輸入須 `.docx`,輸出為資料夾則存 `<輸入檔名>.pdf`、否則須 `.pdf`、為空則存輸入檔旁);**不含**其資料夾批次轉檔(本套件呼叫端恆給單一檔案,輸入為資料夾即例外).轉檔例外時印出錯誤字典(含 `traceback` 鍵)、其後仍印 `success` 並以離開碼 0 結束(此行為不變),由 `WDocx2pdf.mjs` 依輸出判定為轉檔失敗(R-CONVERT-RESULT-02,2026-11-11 起;原僅以輸出檔是否存在判定並 reject 固定字串 `can not convert`) | `resolvePaths`,`docxToPdf`,`cv` | L3 輸出等價(頁數、頁尺寸、各頁文字、字型);③ |

盤點指令:

```
git grep -n "Dispatch(\|DispatchEx(\|GetActiveObject\|\.Quit(" -- srcPython/cv.py
git grep -n "Documents.Open(" -- srcPython/cv.py
git grep -n "docx2pdf" -- srcPython/cv.py
```

判準(命中之註解行除外):`srcPython/cv.py` 取得 Word 只有 `wc.DispatchEx('Word.Application')` 一處,無 `Dispatch(`;`.Quit(` 只在 `closeOwnWord`;`Documents.Open(` 以第三個位置參數 `True`(唯讀)開啟;不再 `import docx2pdf`(僅註解提及).

驗證法:`test/tools/wordInstance.mjs`(複製自 w-html2docx 之同名檔,本套件增 `startOpenBorrower`)提供他行程 Word、可見視窗監看、停用項目清除等;`test/tools/docxFixture.mjs` 產生夾具 docx(自寫「僅儲存」zip,不加依賴)並提供兩種扣住點:**連結圖**(Word `Open` 後即向伺服器取圖,伺服器扣住則 `SaveAs`(匯出 PDF)卡住,此時 Word **不受理**他行程之 COM)與**附加範本**(`Open` 期間向伺服器取範本,只扣住 GET 時 Word 仍受理他行程之 COM,用於④).〈WDocx2pdf Word instance isolation〉6 案(①③②交錯②同時②同檔④)見 `test/WDocx2pdf.test.mjs`,與經驗見 `sgud/exp/experience.md`〈Word 實例隔離〉.

## 3. R-CONVERT 轉檔成敗之判定與暫存清除(2026-11-11 導入)

來源:主控排程第 410 項(dp410,同形盤查;範本為 w-docx-split 之 R-SPLIT-RESULT-01 與 w-docx2html 之 R-CONVERT-RESULT-01).原 `WDocx2pdf.mjs` 不取 `cv.exe` 之輸出,僅靠 `fsIsFile(fpOutTemp)` 兜住失敗,reject 只有固定字串 `can not convert`,Word 之錯誤原因遺失;且失敗路徑(含取不到 `cv.exe` 而拋出)皆不清暫存,每次失敗都在 `fdTemp` 留下使用者文件之複本.

| 規則 | 內容 | 站點 | 測試 |
| --- | --- | --- | --- |
| R-CONVERT-RESULT-01 | 單一擁有者:轉檔成敗之判定只在 `src/judgeConvertOutput.mjs`(`judgeConvertOutput` 判輸出、`judgeConvertFile` 判輸出檔);失敗碼 `E_CONVERT_FAILED` 與格式 `[E_CONVERT_FAILED] 原因` 僅其 `failMsg` 一處;他處不得另寫判定或失敗字串 | `src/judgeConvertOutput.mjs`;使用處 `src/WDocx2pdf.mjs` | `test/unit-judgeConvertOutput.test.mjs` |
| R-CONVERT-RESULT-02 | 失敗通道(MicrosoftOffice):`cv.exe` 不論成敗離開碼皆 0,`execProcess` 不 reject,成敗只能依輸出判定.輸出(stdout 與 stderr 合併,`codeCmd: 'auto'` 解碼)之形態(實測自真 Word):首行為輸入參數字典之回顯(含輸入路徑,不得回顯);成功再印 `success`;**轉檔例外**(輸入非 docx、損毀 docx)由 `cv.py` 之 `cv()` 吞掉,印錯誤字典單行 `{'type': ..., 'message': '...', 'traceback': [...]}` 且**其後仍印 `success`**(無 `error:` 行);外層失敗(argv、base64、JSON、編碼)印 `error: <原因>`.判準 fail-closed:依輸出順序取第一個失敗標記(`error:` 行或錯誤字典行)為失敗,原因為 `error:` 後文字或字典之 `message`(Python repr 還原);無失敗標記時須有整行為 `success` 才成功;空輸出、未知輸出、非字串一律失敗;失敗訊息不回顯其餘輸出(含路徑).stderr 之 `Word instance is kept since …`(R-WORD-02)不影響判定 | `judgeConvertOutput`;`src/WDocx2pdf.mjs` 之 `execProcess(prog, b64Input, { codeCmd: 'auto' })` | 單元(錯誤字典、`error:`、fail-closed、repr 還原);〈when cv.exe fails internally〉非 docx、損毀 docx(真 Word:訊息含 Word 診斷、無 U+FFFD、不含路徑) |
| R-CONVERT-RESULT-03 | 判成功後仍驗輸出暫存檔(存在、為檔案、大小 > 0),否則 `[E_CONVERT_FAILED] output file was not generated or is empty`(固定說明,不回顯路徑);MicrosoftOffice 與 LibreOffice 兩模式共用 | `judgeConvertFile`;`src/WDocx2pdf.mjs` | 單元 `judgeConvertFile`;`unit-WDocx2pdfTemp`(LibreOffice 假啟動檔離開碼 0 且無輸出) |
| R-CONVERT-RESULT-04 | reject 型態:取不到 `cv.exe` 為字串 `[code] message`(`ensureBins` 帶 `code` 之 Error 轉成;同 w-docx-split、w-html2docx、w-docx2html;主控 2026-11-11 裁示,回饋 #4、#7);轉檔程式離開碼非 0 為 `execProcess` 之 `code[N]:…`;輸出複製失敗為 fs 錯誤物件;參數檢測為說明字串.JSDoc `@returns` 與 README〈轉檔失敗之回報〉須同步 | `src/WDocx2pdf.mjs` | 〈when cv.exe fails internally〉(`fpOut` 為資料夾);`unit-WDocx2pdfTemp`(`E_OFFLINE_MISSING`) |
| R-CONVERT-TEMP-01 | 暫存清除:輸入複本 `fpInTemp`(`docx2pdf_<id>.docx`)與輸出暫存 `fpOutTemp`(`docx2pdf_<id>.pdf`)僅本次呼叫擁有(檔名含 id),任何返回路徑(成功、取不到 `cv.exe` 而拋出、各 reject)皆於 `finally` 清除;**不刪 `fdTemp` 資料夾本身**(可能為呼叫端共用),**不動他次呼叫之暫存檔**(不得以前綴掃刪);`fsDeleteFile` 不拋錯、檔不存在視為成功 | `src/WDocx2pdf.mjs` 之 `try … finally` | 〈when cv.exe fails internally〉(失敗後 `fdTemp` 只剩他次暫存檔;`fpOut` 為資料夾時輸出暫存亦清除;其後正常 docx 無殘留);`unit-WDocx2pdfTemp`(取不到 `cv.exe`、LibreOffice 兩失敗路徑、他次暫存檔與資料夾保留) |

盤點指令:

```
git grep -n "execProcess(" -- src
git grep -n "E_CONVERT_FAILED\|can not convert" -- src README.md
git grep -n "fsDeleteFile(fpInTemp)\|fsDeleteFile(fpOutTemp)" -- src
```

判準:`execProcess(` 之站點全集為 `src/WDocx2pdf.mjs` 兩處——MicrosoftOffice(取輸出並經 `judgeConvertOutput` 判定)與 LibreOffice(離開碼判定),兩者其後皆經 `judgeConvertFile`;`E_CONVERT_FAILED` 在程式碼中只在 `src/judgeConvertOutput.mjs`(`src/WDocx2pdf.mjs` 之 JSDoc `@returns` 說明文字除外);`can not convert` 在 `src/` 無命中(README 之 Breaking changes 說明除外);暫存檔刪除只在 `finally`.新增任何起轉檔程式之站點,須同步補判定與清除.

已知限制:①錯誤字典之 `message` 取自 Word,Word 之診斷可能自行含檔名(輸入暫存檔名 `docx2pdf_<id>.docx`,不含使用者原路徑);②LibreOffice 本機未裝,其失敗路徑以假啟動檔(`node.exe` 離開碼非 0、Git 附 `true.exe` 離開碼 0 無輸出,後者本機無則略過)驗證暫存清除,非真 LibreOffice;③LibreOffice 之 `execProcess` 未加 `codeCmd: 'auto'`(本規則範圍為 MicrosoftOffice);④既有行為未改:轉檔成功後 `fsDeleteFile(fpOut)` 先刪既有輸出檔再複製,複製失敗時既有 `fpOut` 已被刪;⑤`cv.exe` 之成敗信號有兩種形態(錯誤字典＋`success`、`error:`)係轉檔器現況(本輪不重建 exe),見回饋 #5.

## 4. 測試補充

- 〈Word instance isolation〉須在**無其他 WINWORD** 時執行(有則整組略過並印原因:修前之轉檔器會借用並結束之,且④無法確定連上本行程之實例);略過或初始化前失敗時 `after` 不結束任何 WINWORD.放於 `WDocx2pdf.test.mjs` 同檔(mocha `--parallel` 下不同檔會同時用 Word).
- 該組以 `test/tools/binEnv.mjs` 之 `setBinEnv(tag)` 取得 `cv.exe`(`bin/` 實檔放入 `test/_tmp/<tag>/mirror/`,設 `W_BIN_*`,不連外網);暫存 docx 與輸出放 `test/_tmp/WDocx2pdf-word/`,測完由 `after` 刪除.
- 〈WDocx2pdf when cv.exe fails internally〉(真 Word 4 案,R-CONVERT-RESULT/TEMP)同樣須在**無其他 WINWORD** 時執行(有則整組略過並印出原因);開檔失敗案先起可見視窗看門狗(`startVisibleWordWatch`),`after` 同〈Word instance isolation〉收尾(只結束本組新出現之自動化 Word,並一律清除指向 repo 內檔案之 Word 停用項目後記錄).暫存與輸出放 `test/_tmp/WDocx2pdf-fail/`,測完由 `after` 刪除;模擬「他次呼叫之暫存檔」的 decoy 檔由 `afterEach` 移除,免前案失敗連帶影響後案.不需 Word 之清除測試與判定函數測試為 `test/unit-WDocx2pdfTemp.test.mjs`、`test/unit-judgeConvertOutput.test.mjs`(可與他檔並行);假啟動檔不可用 `cmd.exe`(其對未知引數進入互動模式等 stdin 而懸置,逾時後孤兒行程使 mocha 不結束),失敗用 `process.execPath`(對 `--headless` 以離開碼 9 結束).
- 收尾以 `killNewAutomationWords` 只結束本組新出現之自動化 Word;以 `clearDisabledItems` 清除指向 repo 內檔案之 Word 停用項目(before 於略過判定之後一次;after 只在有強制結束時)——強制結束開著文件之 Word 後,Word 將該文件列入 `HKCU\Software\Microsoft\Office\16.0\Word\Resiliency\DisabledItems`,之後開該檔即跳出可見訊息框(範本實測).測試是否可自動刪除使用者登錄中指向 repo 之停用項目,沿範本待主控裁示.
