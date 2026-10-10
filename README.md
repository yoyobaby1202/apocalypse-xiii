# 俊佑の十三支默示錄 v0.7

只保留一個分析按鈕「🔍 AI分析建議排法」，使用 v0.6 深度分析引擎：先遍歷所有合法排法，以 45 次對手比較初篩最多 240 種，再用 3,000 次對手比較選出 AI 建議。玩家排牌與 AI 建議完全一致時顯示提示。

保留玩家 VS AI 勝率、打槍率、被打槍率、打槍雙倍得分與遊戲規則頁。深度搜尋不是對每一個合法排法都使用 3,000 次比較，因此不保證絕對最佳解。

## 全新安裝（Windows PowerShell）

1. 解壓縮 ZIP，開啟內含 package.json 的資料夾（ZIP 根目錄直接含 package.json）。
2. VS Code：檔案 → 開啟資料夾，選擇解壓縮資料夾。
3. 在 VS Code 終端機依序執行：

```powershell
dir package.json
npm.cmd install
npm.cmd run dev
```

4. 開啟終端機顯示的 Local 網址，例如 http://localhost:5173/。

以後啟動同一專案只要 `npm.cmd run dev`。
