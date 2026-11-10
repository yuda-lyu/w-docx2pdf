# w-docx2pdf 執行經驗

## 轉換失敗判定與暫存清除(2026-11-11,dp410,規則 R-CONVERT-RESULT / R-CONVERT-TEMP)

- **派工描述與實況不符,實測為準**:派工寫「轉換失敗是於 stdout 印 `error: <原因>`」.真 `cv.exe` 對非 docx 與損毀 docx 之實際輸出為三段——①輸入參數字典回顯(含輸入路徑)②錯誤字典單行 `{'type': <class 'pywintypes.com_error'>, 'message': "(-2147352567, '發生例外狀況。', (0, 'Microsoft Word', '檔案似乎已毀損。', 'wdmain11.chm', 25272, -2146822496), None)", 'traceback': [...]}` ③`success`;**無 `error:` 行**(離開碼 0).原因:`cv.py` 之 `cv()` 吞掉例外,`core()` 無從得知而仍印 `success`;`error:` 只出現在外層失敗(argv、base64、JSON、編碼).照範本只比對 `error:` 會判成功(仍靠輸出檔不存在兜住,但拿不到 Word 診斷).故 `judgeConvertOutput` 除 `error:` 行外,另辨識錯誤字典行並取其 `message`(Python repr 還原)為原因.修後 reject 值與 w-docx2html 之 `[E_CONVERT_FAILED] (-2147352567, '發生例外狀況。', (0, 'Microsoft Word', '檔案似乎已毀損。', …), None)` 相同.
- **輸出為 ANSI 字碼頁**(中文系統 big5):`execProcess` 須 `codeCmd: 'auto'`,否則 Word 診斷變 `�`(變異 W4 實測被殺).回顯行亦含輸入路徑,故判定結果不得回顯其餘輸出.
- **暫存殘留的真正範圍**:不只轉檔失敗——`ensureBins` 拋出(離線無快取)時,輸入複本也已複製而不清;改 `try … finally`,複製放在 `try` 內第一句.`fsCopyFile`／`fsDeleteFile` 皆不拋錯(回 `{ error }`),故複製置於 `try` 前後在行為上等價(變異 W7 存活,屬等價變異).
- **輸出暫存檔存在而 reject 之真實路徑**:`fpOut` 為既有資料夾時,Word 轉檔成功、`fsDeleteFile(fpOut)` 回 `{ error }`(不處理)、`fsCopyFile` 回 EPERM 而 reject——此時輸出暫存檔存在,用於驗證 `fpOutTemp` 之清除(變異 W3 被殺);真 Word 無法使 `fpOutTemp` 在轉檔失敗時存在.
- **假啟動檔(LibreOffice 模式未裝)**:`opt.fpExeLibreOffice` 可指任一執行檔.離開碼非 0 用 `process.execPath`(`node --headless …` 以 9 結束);**不可用 `cmd.exe`**(其進入互動模式等 stdin,spawn 永不結束,逾時後孤兒行程使 mocha 與 `quiet-run` 不退出,需手動結束該 `cmd.exe`);離開碼 0 且無輸出用 Git 附之 `true.exe`(無則略過該案).
- **等價變異**:`judgeConvertFile` 去掉 `isFile()` 存活——NTFS 資料夾 `size` 為 0,已被 `size > 0` 擋下;保留 `isFile()` 作語意明示.
- `quiet-run --lock` 對含真 Word 之 mocha 自動歸類為 Word 鎖(取得時印 `lock(Word)`);變異腳本於 `tmp/dp410/mutate.mjs`(副本置 `tmp/dp410/mut/<名>/`,以 `node <repo>/node_modules/mocha/bin/mocha.js` 於副本執行,Word 類變異需複製 `bin/cv.exe`).

## 2026-11-11 Word 實例隔離(排程第 408 項,範本 w-html2docx 之 hd408)

- **根因**:原 `cv.py` 呼叫第三方 `docx2pdf` 0.1.8 之 `convert`,其 `windows()` 為 `win32com.client.Dispatch("Word.Application")`＋轉完 `word.Quit()`(`keep_active` 預設 False).`Dispatch` 先 GetActiveObject 連上已登錄於 ROT 之 Word,故借用他行程/使用者之 Word,並於轉完 `Quit()` 關掉它(修前 exe 之④紅測:對方持有之文件隨實例消失,讀取得 RPC 伺服器無法使用 0x800706BA;③紅測:例外後他行程之 Word 文件數由 1 變 2,即修前於借用之實例內開了文件而不關閉).該套件另有:例外時不關文件亦不 Quit(讀碼:殘留 WINWORD)、不設 `DisplayAlerts`(讀碼).已改為本套件自寫(`DispatchEx`、唯讀開啟、`closeOwnWord`),轉出方式(`SaveAs`,`FileFormat=17`)不變.
- **docx 輸入之「轉檔進行中」確定時點有兩種,性質相反**:①*連結圖*(`a:blip r:link` 指向 http):Word 在 `Open` 後約 0.1 秒向伺服器取圖,`Open` 先返回,伺服器扣住則 `SaveAs`(匯出 PDF)卡住,此時他行程之 `GetActiveObject` 亦被擋住(連 ATTACHED 都印不出),要等匯出結束;用於「轉檔中另有別的行程/Word」之案(①②③).②*附加範本*(`settings.xml` 之 `w:attachedTemplate` 指向 http):`Open` 期間 Word 依序發 `OPTIONS /`、`OPTIONS /`、`HEAD`、`GET`,只扣住 GET 時 Word 仍受理他行程之 COM(Add/Open 可行);**扣住 HEAD 或所有請求則不受理**(`wordInstance.mjs` 之 `startHoldServer` 會扣住 `/hold.png` 之任何方法,故④另寫只扣第一個 GET 之 `startGetHoldServer`).
- **④他行程連上轉檔器之 Word 並持有文件**:不能用 `startBorrower`(Documents.Add 後寫文字):Word 忙於 `Open` 時寫入文字持續被拒,而轉檔器 `Open` 完成時 Word 會關閉未更動之空白新文件(實測 `words []`、轉檔器照常 Quit,看起來像「保留失敗」);改用新增之 `startOpenBorrower`(開啟一份既有檔並持有,結束時讀 `DOCS <實例文件數> <檔名>`).忙碌中 PowerShell 屬性語法讀不到型別資訊(`$d.Name` 得空值),故開啟時不讀屬性、結束時才以 `InvokeMember` 讀.
- **同形陷阱**:Word 忙於他人之 `Open` 時,以 `InvokeMember` 取 `Documents` 再呼叫 `Open` 實測失敗(OPENFAIL「無法在值為 Null 的運算式上呼叫方法」),直接 `$w.Documents.Open(...)` 則可行;兩種寫法之可行性以實測為準,勿憑印象.
- **測試腳手架**:`test/tools/docxFixture.mjs` 以自寫「僅儲存」zip 產生夾具(不加依賴);各案以不同頁數(1、2、3 頁)區分輸出出自哪個來源(`pdfInfo` 之 `/Count`).修前 exe 之紅測:②交錯與④因 `Quit()` 等待而逾時(180 秒/案),整組約 12 分鐘;修後約 35 秒.
- **模擬夾**(第二段前驗證全套):`tmp/` 下複製套件(不含 `node_modules`、`.git`、`tmp`、`dist`、`docs`)並將清單改為新 exe 之 sha256／大小;不需連結——模擬夾位於 repo 之 `tmp/` 內,Node 自上層 repo 根解析 `node_modules`;以 `node <repo>/node_modules/mocha/bin/mocha.js` 於模擬夾執行(`npx mocha` 在模擬夾會把它當專案根而找不到本機 mocha).
- **Git Bash 把以 `/` 開頭之引數轉成路徑**(如 `/c`、`/hold.png` 變成 `C:/Program Files/Git/...`):經 node/cmd 傳這類引數時加環境變數 `MSYS_NO_PATHCONV=1`.

## 2026-10-28 外部執行檔改造(制式規格,B 類)

- **原有 `test/WDocx2pdf.test.mjs` 之 `convert` 在本機修前即紅**:轉出 PDF 為 135319 位元組,`test/ztmpTrue.pdf` 為 90895(兩者皆為 Microsoft Word 2021 產生之 1 頁 `%PDF-1.7`,頁數與檔頭相同,差在字型內嵌等機器差異).該案以「檔案大小相等」為斷言,屬現狀指紋且隨機器而異,與外部執行檔改造無關(改造前後轉出同為 135319).斷言未動,待裁示.
- **含外部執行檔之功能測試不連外網**:`WDocx2pdf.test.mjs` 於 `before` 把 `bin/cv.exe` 複製到 `test/_tmp/WDocx2pdf/mirror/<pkg>/<sha256>/cv.exe`,並設 `W_BIN_MIRROR`、`W_BIN_CACHE`(指 `test/_tmp`)、`W_BIN_OFFLINE=1`,`after` 還原環境變數並刪資料夾.mocha `--parallel` 為每檔一個 worker,環境變數只影響該 worker,但仍須還原.
- **`npm pack --dry-run` 會把 `test/_tmp` 內之檔算進包**(`.npmignore` 存在時 `.gitignore` 不生效):測試並行時 `unit-binManifest` 的 T1 可能撞上 `unit-ensureBins` 在 `test/_tmp` 內的快取執行檔而偶發紅,故 `.npmignore` 須列 `test/_tmp`.
- **UMD 的 `pkgRoot`**:`src/ensureBins.mjs` 以 `import.meta.url` 推套件根(`..`);w-package-tools 建 UMD 時把 `import.meta.url` 換成產物檔位置,`dist/` 與 `src/` 同在套件根下一層,兩者皆對.已以 `toolg/gDistRollup.mjs` 相同設定建置至 `./tmp` 驗證(`module.exports` 仍為函數、帶 `ensureBins`、`pkgRoot` 正確).wsemi 的 `fsEnsureBins` 引入 `crypto`、`stream`、`stream/promises`、`url`,須列為 rollup external/globals,否則 UMD 全域名猜錯.
- **預設匯出須仍為函數**:UMD 的 `module.exports` 現為 `WDocx2pdf` 函數;若改成具名匯出會變成 `{ default, ensureBins }` 而弄壞既有 `require`／`import` 用法,故 `ensureBins` 以屬性掛在函數上.
- **`quiet-run --lock` 等鎖時間不定**(實測 1～11 分):依需要把驗證合併成少數幾次執行;紅燈證據中,單一 mocha 指令字串內的 `;` 不會被當作 shell 分隔(quiet-run 將其視為參數),需分開執行.
- **`git rm --cached` 會動到索引**:要刪工作樹檔案直接 `rm`,不要為了「確認」而先 `git rm --cached`(本輪誤用一次,以 `git restore --staged` 還原,未提交).
- `toolg/gDistRollup.mjs` 第 2 行 `getFiles` 為既有未使用之 import(eslint `no-unused-vars`),非本輪造成,未動.
