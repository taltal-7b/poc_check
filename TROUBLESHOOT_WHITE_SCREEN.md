# 真っ白な画面の修正

## 問題

ブラウザで http://localhost:5173 にアクセスすると真っ白な画面が表示される。

## 原因

1. Loading コンポーネントのエクスポート問題
2. API URL の設定問題

## 修正内容

✅ `frontend/src/components/ui/Loading.tsx` に default export を追加  
✅ `frontend/src/lib/api.ts` の API URL を修正（ポート3001に変更）

## 確認手順

### 1. ブラウザの開発者ツールを開く

1. ブラウザで `http://localhost:5173` を開く
2. `F12` キーを押して開発者ツールを開く
3. 「Console」タブを確認

エラーメッセージがある場合は、それを確認してください。

### 2. 完全リロード

1. `Ctrl + Shift + R` で完全リロード
2. または `Ctrl + F5`

### 3. ブラウザのキャッシュとストレージをクリア

1. 開発者ツールで `Application` タブ（Chromeの場合）
2. 左側の `Storage` セクション
3. `Clear site data` をクリック
4. ページをリロード

### 4. それでも白い画面の場合

コンテナを完全に再起動：

```powershell
cd C:\Users\kings\poc_check

# すべてのコンテナを停止して削除
docker-compose down

# イメージを再ビルドして起動
docker-compose up -d --build

# ログを確認
docker logs pm_frontend -f
```

## 現在の状況確認

### フロントエンドの状態

```powershell
# コンテナが起動しているか確認
docker ps | Select-String "pm_frontend"

# ログを確認
docker logs pm_frontend --tail 50
```

### ネットワーク接続の確認

```powershell
# フロントエンドにアクセスできるか
Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -Method Head

# バックエンドにアクセスできるか  
Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing
```

## よくある原因と解決方法

### 原因1: JavaScriptエラー

**確認方法:**
- ブラウザの開発者ツール（F12）→ Consoleタブ

**解決方法:**
- エラーメッセージを確認
- コンテナを再起動

### 原因2: API接続エラー

**確認方法:**
- 開発者ツール → Network タブ
- ページをリロード
- 失敗しているリクエストを確認

**解決方法:**
```powershell
# バックエンドが起動しているか確認
docker logs pm_backend --tail 50

# バックエンドを再起動
docker restart pm_backend
```

### 原因3: ポート競合

**確認方法:**
```powershell
netstat -ano | findstr :5173
```

**解決方法:**
```powershell
# Dockerコンテナを停止
docker-compose down

# 競合しているプロセスを終了
# （netstatで表示されたPIDを使用）
taskkill /F /PID <プロセスID>

# 再起動
docker-compose up -d
```

### 原因4: Dockerボリュームの問題

**解決方法:**
```powershell
cd C:\Users\kings\poc_check

# ボリュームを含めて完全削除
docker-compose down -v

# node_modulesを削除
Remove-Item -Recurse -Force frontend/node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force backend/node_modules -ErrorAction SilentlyContinue

# 再ビルドして起動
docker-compose up -d --build
```

## 手動での起動（Dockerを使わない場合）

Dockerに問題がある場合は、手動で起動できます：

```powershell
# ターミナル1: バックエンド
cd C:\Users\kings\poc_check\backend
npm run dev

# ターミナル2: フロントエンド
cd C:\Users\kings\poc_check\frontend
npm run dev
```

## デバッグ方法

### 1. ブラウザのコンソールログ

```javascript
// 開発者ツールのConsoleで実行
console.log(document.getElementById('root'))
```

`root` 要素が存在するか確認。

### 2. ネットワークリクエスト

開発者ツール → Network タブ
- `main.tsx` や `App.tsx` が読み込まれているか
- エラーステータス（404, 500など）がないか

### 3. React Developer Tools

Chrome拡張機能「React Developer Tools」をインストール：
- コンポーネントツリーが表示されるか確認

## 修正後の確認

1. ✅ ブラウザで http://localhost:5173 を開く
2. ✅ ログイン画面が表示される
3. ✅ admin / admin123 でログイン
4. ✅ ダッシュボードが表示される
5. ✅ 左メニューが表示される
6. ✅ 「プロジェクト」や「課題」メニューが動作する

## 完全な再起動手順

すべてがうまくいかない場合の最終手段：

```powershell
# 1. すべて停止
docker-compose down -v

# 2. Dockerイメージを削除
docker rmi poc_check-frontend poc_check-backend

# 3. キャッシュをクリア
docker system prune -a --volumes

# 4. 再ビルド（時間がかかります）
docker-compose up -d --build

# 5. 起動を待つ
Start-Sleep -Seconds 60

# 6. ログを確認
docker logs pm_frontend
docker logs pm_backend

# 7. ブラウザで開く
Start-Process "http://localhost:5173"
```

## サポート情報

もし問題が解決しない場合は、以下の情報を収集してください：

```powershell
# 1. コンテナの状態
docker ps -a

# 2. フロントエンドのログ
docker logs pm_frontend > frontend-logs.txt

# 3. バックエンドのログ
docker logs pm_backend > backend-logs.txt

# 4. ブラウザのコンソールエラー（スクリーンショット）

# 5. ネットワークタブのエラー（スクリーンショット）
```
