# 回饋

任務中發現之自有套件、全域技能、全域設定之調整與抽提提案(只增不改;處置結果另記一列並寫明承接哪一列).

| # | 日期 | 類別 | 對象 | 內容 | 依據 |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-11 | 自有套件 | w-html2docx(`test/tools/wordInstance.mjs` 之範本),w-docx2html,w-docx-split,w-md2docx | 範本之④(`startBorrower`:`Documents.Add` 後寫入文字)只適用「Word 於匯入中仍可寫入」之情境;輸入為 docx 之轉檔器,他行程須在轉檔器開啟其文件之前連上,此時寫入文字被拒,且 Word 會在轉檔器 `Open` 完成時關閉未更動之空白新文件(看起來像「保留失敗」).本套件增 `startOpenBorrower`(開啟一份既有檔並持有),並另寫只扣第一個 GET 之附加範本扣住點;宜回補至範本檔並寫入同形套件之驗證法 | `test/tools/wordInstance.mjs`、`test/tools/docxFixture.mjs`;`sgud/exp/experience.md`〈Word 實例隔離〉;修前 exe 與新 exe 之④實測 |
| 2 | 2026-11-11 | 全域技能 | 新建:Office(Word)COM 自動化之規範(承接 w-html2docx 回饋 #4) | 補:以 http 製造「轉檔中」確定時點時有兩種性質相反之扣住點——連結圖(`SaveAs`/匯出期間 Word **不受理**他行程之 COM,連 `GetActiveObject` 都被擋)與附加範本之 GET(`Open` 期間 Word **仍受理**);扣住 `HEAD` 或所有請求則不受理.另:派工提示詞之規則編號(R-WORD-03 為唯讀開檔)與範本帳本實際編號(R-WORD-04)不一致,同形套件宜以帳本為準或統一編號 | 本套件 dp408 探測 P1、P2、p3b(`sgud/exp/experience.md`) |
| 3 | 2026-11-11 | 全域技能 | role-command-windows §2.3 | Git Bash 不只轉換「路徑」,連以 `/` 開頭之任意引數都轉換:`cmd /c x.bat` 變成 `cmd C:/ x.bat`、URL 路徑參數 `/hold.png` 變成 `C:/Program Files/Git/hold.png`;經 node 或 `cmd` 傳這類引數時須加 `MSYS_NO_PATHCONV=1` | 本套件 dp408 建置與探測之實例 |
