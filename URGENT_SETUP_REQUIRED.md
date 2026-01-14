# ⚠️ 緊急：Node.jsのセットアップが必要です

## 問題

右上のボタンが反応しない原因は、**開発サーバーが起動していない**ためです。

現在、Node.jsがインストールされていないか、環境変数のパスが設定されていない状態です。

## 確認方法

新しいコマンドプロンプトまたはPowerShellを開いて、以下を実行してください：

```powershell
node --version
npm --version
```

エラーが表示される場合は、Node.jsのインストールまたは環境変数の設定が必要です。

## 解決方法

### 方法1: Node.jsがインストール済みの場合（環境変数の問題）

1. Node.jsのインストール場所を確認：
   - デフォルト: `C:\Program Files\nodejs\`
   - または: `C:\Program Files (x86)\nodejs\`

2. 環境変数を設定：
   ```powershell
   # PowerShellを管理者権限で開いて実行
   $nodePath = "C:\Program Files\nodejs"
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";$nodePath", "Machine")
   ```

3. PowerShellを再起動して確認：
   ```powershell
   node --version
   npm --version
   ```

### 方法2: Node.jsがインストールされていない場合

#### A. Node.jsの公式インストーラーを使用

1. https://nodejs.org/ にアクセス
2. **LTS版**（推奨版）をダウンロード
3. インストーラーを実行
4. インストール完了後、**PowerShellを再起動**
5. 確認：
   ```powershell
   node --version
   npm --version
   ```

#### B. Chocolatey（パッケージマネージャー）を使用

```powershell
# PowerShellを管理者権限で開いて実行
choco install nodejs-lts -y
```

### 方法3: フルパスで実行する（一時的な対処）

Node.jsがインストールされているが、パスが通っていない場合：

```powershell
cd C:\Users\kings\poc_check

# フルパスでnpmを実行
& "C:\Program Files\nodejs\npm.cmd" run dev
```

## Node.js セットアップ後の手順

### 1. 依存関係のインストール（初回のみ）

```powershell
cd C:\Users\kings\poc_check
npm install
```

### 2. 開発サーバーの起動

```powershell
# プロジェクトルートで実行
npm run dev
```

または、作成した起動スクリプトを使用：

```powershell
# start-dev.bat をダブルクリック
# または
.\start-dev.bat
```

### 3. ブラウザでアクセス

起動後、以下のURLにアクセス：

- **フロントエンド**: http://localhost:5173
- **バックエンド**: http://localhost:3000/health

### 4. ログイン

- ユーザー名: `admin`
- パスワード: `admin123`

## 起動成功の確認

開発サーバーが正常に起動すると、以下のようなメッセージが表示されます：

```
> backend@1.0.0 dev
> ts-node-dev --respawn --transpile-only src/index.ts

Database connected successfully
Server is running on port 3000
Environment: development

> frontend@1.0.0 dev
> vite

  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

## トラブルシューティング

### エラー: "Cannot find module"

```powershell
# node_modulesを再インストール
cd C:\Users\kings\poc_check
Remove-Item -Recurse -Force node_modules, frontend/node_modules, backend/node_modules -ErrorAction SilentlyContinue
npm install
```

### エラー: "Port 3000 is already in use"

```powershell
# ポートを使用しているプロセスを確認
netstat -ano | findstr :3000

# プロセスIDを確認して終了
taskkill /F /PID <プロセスID>
```

### エラー: "Database connection failed"

PostgreSQLが起動していることを確認してください。

```powershell
# PostgreSQLサービスの状態を確認
Get-Service -Name postgresql*

# PostgreSQLが停止している場合は起動
Start-Service postgresql-x64-14  # バージョンに応じて変更
```

データベースが存在しない場合：

```sql
-- psqlで実行
CREATE DATABASE project_management;
```

## よくある質問

### Q: Node.jsのバージョンはどれを使えば良い？

A: LTS版（Long Term Support）の最新版を推奨します。現在は Node.js 18.x または 20.x が推奨されます。

### Q: npm install でエラーが出る

A: 以下を試してください：

```powershell
# npm キャッシュをクリア
npm cache clean --force

# 再インストール
npm install
```

### Q: Dockerを使うべき？

A: Dockerを使用すると環境構築が簡単になります。`DOCKER_SETUP.md` を参照してください。

## Dockerを使用する場合（推奨）

Node.jsのインストールが難しい場合は、Dockerを使用することをお勧めします：

```powershell
# Docker Desktopがインストール済みの場合
cd C:\Users\kings\poc_check

# コンテナを起動
docker-compose up -d

# ブラウザで http://localhost:5173 にアクセス
```

詳細は `DOCKER_SETUP.md` を参照してください。

## 次のステップ

1. ✅ Node.jsをインストール（または環境変数を設定）
2. ✅ PowerShellを再起動
3. ✅ `node --version` と `npm --version` で確認
4. ✅ `npm install` で依存関係をインストール
5. ✅ `npm run dev` で開発サーバーを起動
6. ✅ ブラウザで http://localhost:5173 にアクセス
7. ✅ admin / admin123 でログイン
8. ✅ 「新規プロジェクト」ボタンをクリック

## サポート

上記の手順で解決しない場合は、以下の情報を提供してください：

1. Node.jsのインストール状況
2. エラーメッセージ（スクリーンショット）
3. 実行したコマンドと結果
4. オペレーティングシステムのバージョン
