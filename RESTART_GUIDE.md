# フロントエンドが反応しない場合の対処法

## 問題
「新規プロジェクト」ボタンなどが反応しない

## 原因
フロントエンドの開発サーバーが変更を検知していない、またはキャッシュの問題

## 解決手順

### 1. 開発サーバーを再起動する

#### 方法A: 既存のサーバーを停止して再起動

```powershell
# 1. 現在実行中のNode.jsプロセスを確認
Get-Process -Name node -ErrorAction SilentlyContinue

# 2. Node.jsプロセスを停止
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# 3. プロジェクトルートで開発サーバーを起動
cd C:\Users\kings\poc_check
npm run dev
```

#### 方法B: 個別に起動する場合

```powershell
# ターミナル1: バックエンド
cd C:\Users\kings\poc_check\backend
npm run dev

# ターミナル2: フロントエンド
cd C:\Users\kings\poc_check\frontend
npm run dev
```

### 2. ブラウザのキャッシュをクリア

1. ブラウザで `http://localhost:5173` を開く
2. 開発者ツールを開く（F12キー）
3. 以下のいずれかの方法でキャッシュをクリア：

#### 方法A: ハードリロード
- Windows: `Ctrl + Shift + R` または `Ctrl + F5`

#### 方法B: 開発者ツールから
1. 開発者ツールを開いた状態で
2. リロードボタンを右クリック
3. 「キャッシュの消去とハード再読み込み」を選択

#### 方法C: 完全なキャッシュクリア
1. 開発者ツールの「Application」タブ（Chromeの場合）
2. 左側の「Storage」セクション
3. 「Clear site data」をクリック

### 3. コンソールエラーを確認

1. ブラウザで `http://localhost:5173` を開く
2. F12キーを押して開発者ツールを開く
3. 「Console」タブを選択
4. エラーメッセージを確認

よくあるエラー：
- `Failed to fetch` → バックエンドが起動していない
- `404 Not Found` → ルート設定の問題
- `Uncaught SyntaxError` → コンパイルエラー
- `Cannot read property of undefined` → データ構造の問題

### 4. ネットワークタブを確認

1. 開発者ツールで「Network」タブを選択
2. ページをリロード
3. API呼び出しが失敗していないか確認

### 5. フロントエンドのビルドエラーを確認

フロントエンドの開発サーバーを起動したターミナルで、エラーメッセージが表示されていないか確認してください。

### 6. それでも動作しない場合

#### A. node_modulesを再インストール

```powershell
# プロジェクトルート
cd C:\Users\kings\poc_check

# フロントエンドのnode_modulesを削除して再インストール
Remove-Item -Recurse -Force frontend/node_modules -ErrorAction SilentlyContinue
cd frontend
npm install
cd ..

# バックエンドのnode_modulesを削除して再インストール
Remove-Item -Recurse -Force backend/node_modules -ErrorAction SilentlyContinue
cd backend
npm install
cd ..
```

#### B. ポート競合を確認

```powershell
# ポート5173を使用しているプロセスを確認
netstat -ano | findstr :5173

# ポート3000を使用しているプロセスを確認
netstat -ano | findstr :3000
```

競合がある場合は、プロセスを終了してから再起動してください。

### 7. 簡易起動スクリプト

以下のコマンドをコピーして実行してください：

```powershell
# すべてのNodeプロセスを停止
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# プロジェクトルートに移動
cd C:\Users\kings\poc_check

# 3秒待機
Start-Sleep -Seconds 3

# 開発サーバーを起動
npm run dev
```

### 8. 起動確認

正常に起動すると、以下のメッセージが表示されます：

```
> backend@1.0.0 dev
> ts-node-dev --respawn --transpile-only src/index.ts

Database connected successfully
Server is running on port 3000

> frontend@1.0.0 dev
> vite

  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### トラブルシューティングチェックリスト

- [ ] Node.jsプロセスをすべて停止した
- [ ] プロジェクトルートディレクトリにいる
- [ ] `npm run dev` を実行した
- [ ] バックエンドが起動している（http://localhost:3000/health にアクセスできる）
- [ ] フロントエンドが起動している（http://localhost:5173 にアクセスできる）
- [ ] ブラウザのキャッシュをクリアした
- [ ] 開発者ツールでエラーを確認した
- [ ] ページをリロードした（Ctrl + Shift + R）

### よくある問題と解決方法

#### 問題: ボタンをクリックしても何も起きない

**確認項目:**
1. ブラウザのコンソールにエラーが表示されているか
2. `onClick` イベントが正しく設定されているか
3. JavaScriptが有効になっているか

#### 問題: モーダルが表示されない

**確認項目:**
1. `isOpen` ステートが正しく更新されているか
2. モーダルコンポーネントがインポートされているか
3. CSS（z-index）の問題がないか

#### 問題: データが表示されない

**確認項目:**
1. バックエンドAPIが正常に応答しているか
2. ログインしているか（認証トークンがあるか）
3. データベースにデータが存在するか

### 開発者ツールでデバッグ

#### Reactコンポーネントのステートを確認

1. React Developer Tools をインストール
2. 開発者ツールで「Components」タブを選択
3. コンポーネントのステートを確認

#### ネットワーク呼び出しを確認

1. 開発者ツールで「Network」タブを選択
2. ボタンをクリック
3. API呼び出しが行われているか確認
4. レスポンスの内容を確認

### それでも解決しない場合

以下の情報を収集してください：

1. ブラウザのコンソールエラー（スクリーンショット）
2. ネットワークタブのエラー（スクリーンショット）
3. フロントエンドターミナルのエラーメッセージ
4. バックエンドターミナルのエラーメッセージ
