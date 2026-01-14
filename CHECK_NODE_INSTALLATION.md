# Node.jsインストール確認ガイド

## ⚠️ 重要：新しいPowerShellウィンドウを開いてください

現在のPowerShellセッションでは、インストールしたNode.jsが認識されません。
**新しいPowerShellウィンドウを開く必要があります。**

## 確認手順

### 1. 新しいPowerShellを開く

1. スタートメニューを開く
2. 「PowerShell」と入力
3. **Windows PowerShell**を選択
4. 新しいウィンドウが開いたら、以下のコマンドを実行：

```powershell
node --version
npm --version
```

### 2. 結果の確認

#### ✅ 成功した場合（バージョンが表示される）

以下のような表示が出ます：

```
v20.11.0
10.2.4
```

→ **次のステップ**に進んでください。

#### ❌ エラーが出る場合

```
'node' は、内部コマンドまたは外部コマンド...として認識されていません。
```

→ Node.jsのインストールが完了していないか、インストールに失敗しています。

## Node.jsのインストール手順（再確認）

### インストーラーのダウンロード

1. https://nodejs.org/ja にアクセス
2. **LTS版**（推奨版）の緑色のボタンをクリック
3. `node-vXX.XX.X-x64.msi` がダウンロードされる

### インストーラーの実行

1. ダウンロードしたファイルをダブルクリック
2. セットアップウィザードで「Next」をクリック
3. ライセンスに同意
4. インストール先はデフォルトのまま（`C:\Program Files\nodejs\`）
5. **重要**: 「Automatically install the necessary tools」にチェック
6. 「Install」をクリック
7. 完了まで待つ（数分かかる場合があります）
8. 「Finish」をクリック

### インストール完了後

1. **すべてのPowerShellウィンドウを閉じる**
2. 新しいPowerShellウィンドウを開く
3. `node --version` を実行

## トラブルシューティング

### 問題1: まだ「認識されていません」と表示される

**解決方法**:

1. コントロールパネル → システム → システムの詳細設定
2. 「環境変数」ボタンをクリック
3. 「システム環境変数」の「Path」を確認
4. 以下のパスが含まれているか確認：
   - `C:\Program Files\nodejs\`
5. 含まれていない場合は追加

または、PowerShellで以下を実行：

```powershell
# PowerShellを管理者権限で開いて実行
$nodePath = "C:\Program Files\nodejs"
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$nodePath", "Machine")
```

### 問題2: インストーラーがエラーで失敗する

**解決方法A**: インストーラーを管理者権限で実行

1. ダウンロードした `.msi` ファイルを右クリック
2. 「管理者として実行」を選択

**解決方法B**: 古いバージョンをアンインストール

1. コントロールパネル → プログラムと機能
2. 「Node.js」を探してアンインストール
3. 再起動
4. 新しいインストーラーを実行

### 問題3: どこにインストールされたかわからない

PowerShellで以下を実行して検索：

```powershell
Get-ChildItem -Path C:\ -Filter node.exe -Recurse -ErrorAction SilentlyContinue | Select-Object FullName
```

## 次のステップ（Node.jsが認識された後）

### 1. プロジェクトディレクトリに移動

```powershell
cd C:\Users\kings\poc_check
```

### 2. 依存関係をインストール

```powershell
npm install
```

これには数分かかります。以下のようなメッセージが表示されます：

```
added 1234 packages in 2m
```

### 3. データベースのシードを実行

```powershell
cd backend
npm run seed
cd ..
```

成功すると、以下のメッセージが表示されます：

```
Database seeding completed successfully!

=== Default Credentials ===
Username: admin
Password: admin123
===========================
```

### 4. 開発サーバーを起動

```powershell
npm run dev
```

または、簡単に起動するには：

```powershell
# start-dev.bat をダブルクリック
```

### 5. ブラウザでアクセス

起動後、以下のURLを開いてください：

**http://localhost:5173**

ログイン情報：
- ユーザー名: `admin`
- パスワード: `admin123`

## 起動の確認

正常に起動すると、PowerShellに以下のようなメッセージが表示されます：

```
> backend@1.0.0 dev
> ts-node-dev --respawn --transpile-only src/index.ts

Database connected successfully
Server is running on port 3000

> frontend@1.0.0 dev
> vite

  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

## よくある質問

### Q: PostgreSQLも必要ですか？

A: はい、データベースとしてPostgreSQLが必要です。インストール方法は別途提供します。

### Q: 既にnvmやyarnを使っている場合は？

A: そのまま使用できます：

```powershell
# nvmの場合
nvm use 20

# yarnの場合
yarn install
yarn dev
```

### Q: Dockerを使いたい

A: `DOCKER_SETUP.md` を参照してください。Dockerを使えばNode.jsのインストールは不要です。

## まとめ

✅ 新しいPowerShellウィンドウを開く  
✅ `node --version` で確認  
✅ `cd C:\Users\kings\poc_check`  
✅ `npm install`  
✅ `cd backend; npm run seed; cd ..`  
✅ `npm run dev`  
✅ ブラウザで http://localhost:5173 を開く  
✅ admin / admin123 でログイン

これで「新規プロジェクト」ボタンが動作するはずです！
