# w-docx2pdf 執行經驗

## 2026-10-28 外部執行檔改造(制式規格,B 類)

- **原有 `test/WDocx2pdf.test.mjs` 之 `convert` 在本機修前即紅**:轉出 PDF 為 135319 位元組,`test/ztmpTrue.pdf` 為 90895(兩者皆為 Microsoft Word 2021 產生之 1 頁 `%PDF-1.7`,頁數與檔頭相同,差在字型內嵌等機器差異).該案以「檔案大小相等」為斷言,屬現狀指紋且隨機器而異,與外部執行檔改造無關(改造前後轉出同為 135319).斷言未動,待裁示.
- **含外部執行檔之功能測試不連外網**:`WDocx2pdf.test.mjs` 於 `before` 把 `bin/cv.exe` 複製到 `test/_tmp/WDocx2pdf/mirror/<pkg>/<sha256>/cv.exe`,並設 `W_BIN_MIRROR`、`W_BIN_CACHE`(指 `test/_tmp`)、`W_BIN_OFFLINE=1`,`after` 還原環境變數並刪資料夾.mocha `--parallel` 為每檔一個 worker,環境變數只影響該 worker,但仍須還原.
- **`npm pack --dry-run` 會把 `test/_tmp` 內之檔算進包**(`.npmignore` 存在時 `.gitignore` 不生效):測試並行時 `unit-binManifest` 的 T1 可能撞上 `unit-ensureBins` 在 `test/_tmp` 內的快取執行檔而偶發紅,故 `.npmignore` 須列 `test/_tmp`.
- **UMD 的 `pkgRoot`**:`src/ensureBins.mjs` 以 `import.meta.url` 推套件根(`..`);w-package-tools 建 UMD 時把 `import.meta.url` 換成產物檔位置,`dist/` 與 `src/` 同在套件根下一層,兩者皆對.已以 `toolg/gDistRollup.mjs` 相同設定建置至 `./tmp` 驗證(`module.exports` 仍為函數、帶 `ensureBins`、`pkgRoot` 正確).wsemi 的 `fsEnsureBins` 引入 `crypto`、`stream`、`stream/promises`、`url`,須列為 rollup external/globals,否則 UMD 全域名猜錯.
- **預設匯出須仍為函數**:UMD 的 `module.exports` 現為 `WDocx2pdf` 函數;若改成具名匯出會變成 `{ default, ensureBins }` 而弄壞既有 `require`／`import` 用法,故 `ensureBins` 以屬性掛在函數上.
- **`quiet-run --lock` 等鎖時間不定**(實測 1～11 分):依需要把驗證合併成少數幾次執行;紅燈證據中,單一 mocha 指令字串內的 `;` 不會被當作 shell 分隔(quiet-run 將其視為參數),需分開執行.
- **`git rm --cached` 會動到索引**:要刪工作樹檔案直接 `rm`,不要為了「確認」而先 `git rm --cached`(本輪誤用一次,以 `git restore --staged` 還原,未提交).
- `toolg/gDistRollup.mjs` 第 2 行 `getFiles` 為既有未使用之 import(eslint `no-unused-vars`),非本輪造成,未動.
