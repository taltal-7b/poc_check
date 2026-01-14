# Node.js インストール詳細ガイド

## 現状

Node.jsが認識されていません。以下のいずれかの原因が考えられます：

1. ✗ Node.jsのインストーラーをダウンロードしただけで、実行していない
2. ✗ インストール中にエラーが発生して失敗した
3. ✗ インストールは完了したが、カスタムパスを指定した
4. ✗ 管理者権限が必要なのに、通常ユーザーで実行した

## 🔍 まず確認：本当にインストールしましたか？

### インストーラーの実行状況を確認

1. エクスプローラーで「ダウンロード」フォルダを開く
2. `node-v*.msi` というファイルがあるか確認
3. そのファイルをダブルクリックしましたか？
4. セットアップウィザードが表示されましたか？
5. 最後まで完了しましたか？

## 📥 正しいインストール手順

### ステップ1: インストーラーをダウンロード

1. ブラウザで https://nodejs.org/ja を開く
2. **左側の緑色のボタン「XX.X.X LTS 推奨版」**をクリック
3. ファイルがダウンロードされるのを待つ
4. ダウンロードフォルダに `node-vXX.XX.X-x64.msi` があることを確認

### ステップ2: インストーラーを実行

1. **ダウンロードしたファイルを右クリック**
2. **「管理者として実行」を選択**（重要！）
3. ユーザーアカウント制御のダイアログで「はい」をクリック

### ステップ3: セットアップウィザード

#### 画面1: Welcome
- 「Next」をクリック

#### 画面2: End-User License Agreement
- 「I accept the terms in the License Agreement」にチェック
- 「Next」をクリック

#### 画面3: Destination Folder
- **デフォルトのまま**（`C:\Program Files\nodejs\`）
- 変更しないで「Next」をクリック

#### 画面4: Custom Setup
- **すべてデフォルトのまま**
- 「Next」をクリック

#### 画面5: Tools for Native Modules
- **「Automatically install the necessary tools」にチェック**
- 「Next」をクリック

#### 画面6: Ready to install
- 「Install」をクリック
- インストールが始まります（1-2分かかります）

#### 画面7: Completed
- 「Finish」をクリック

### ステップ4: 追加ツールのインストール（自動）

「Finish」をクリックすると、黒いウィンドウ（コマンドプロンプト）が開きます：

1. 「Press any key to continue...」と表示されたら、**Enterキーを押す**
2. Python、Visual Studio Build Toolsなどがインストールされます
3. **これには5-10分かかります**
4. 完了するまで待ってください
5. 終了したら、ウィンドウを閉じる

### ステップ5: 確認

1. **すべてのPowerShellウィンドウを閉じる**
2. **新しいPowerShellウィンドウを開く**
3. 以下を実行：

```powershell
node --version
npm --version
```

成功すると：
```
v20.11.0
10.2.4
```

## 🚨 それでもエラーが出る場合

### 方法A: 環境変数を手動で設定

1. スタートメニューで「環境変数」と検索
2. 「システム環境変数の編集」を開く
3. 「環境変数」ボタンをクリック
4. システム環境変数の「Path」を選択
5. 「編集」をクリック
6. 「新規」をクリック
7. `C:\Program Files\nodejs\` を追加
8. 「OK」を何度かクリックして閉じる
9. **PCを再起動**
10. PowerShellで確認

### 方法B: 完全にアンインストールして再インストール

#### アンインストール手順

1. スタートメニューで「プログラムの追加と削除」を検索
2. 「Node.js」を探す
3. 「アンインストール」をクリック
4. 完了したら、以下のフォルダを手動で削除：
   - `C:\Program Files\nodejs`
   - `C:\Program Files (x86)\nodejs`
   - `%APPDATA%\npm`
   - `%APPDATA%\npm-cache`
5. **PCを再起動**
6. 上記の「正しいインストール手順」を再実行

### 方法C: Chocolateyを使用（推奨）

Chocolateyは Windows 用のパッケージマネージャーです。

1. PowerShellを**管理者権限**で開く
2. 以下をコピー＆ペーストして実行：

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

3. Chocolateyのインストールが完了したら：

```powershell
choco install nodejs-lts -y
```

4. インストール完了後、PowerShellを閉じて新しく開く
5. `node --version` で確認

### 方法D: nvm-windows を使用

nvm（Node Version Manager）を使うと、複数のNode.jsバージョンを管理できます。

1. https://github.com/coreybutler/nvm-windows/releases にアクセス
2. 最新の `nvm-setup.exe` をダウンロード
3. インストーラーを実行
4. PowerShellを開いて：

```powershell
nvm install lts
nvm use lts
node --version
```

## 🐳 代替案：Dockerを使用（最も簡単）

Node.jsのインストールに問題がある場合、Dockerを使用すると環境構築が簡単です。

### 前提条件

Docker Desktopがインストールされていること：
https://www.docker.com/products/docker-desktop

### 使用方法

```powershell
cd C:\Users\kings\poc_check

# コンテナを起動
docker-compose up -d

# ブラウザで http://localhost:5173 にアクセス
```

詳細は `DOCKER_SETUP.md` を参照してください。

## 📞 サポート情報の収集

上記の方法でもうまくいかない場合、以下の情報を収集してください：

### 1. Windowsのバージョン

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber
```

### 2. 管理者権限の確認

```powershell
([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

`True` なら管理者権限あり、`False` なら権限なし

### 3. インストールされているプログラム

```powershell
Get-ItemProperty HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* | Select-Object DisplayName, DisplayVersion | Where-Object {$_.DisplayName -like "*Node*"}
```

### 4. 環境変数Path

```powershell
$env:Path -split ';'
```

## ✅ インストール成功後の次のステップ

Node.jsが正常に認識されたら：

```powershell
# プロジェクトディレクトリに移動
cd C:\Users\kings\poc_check

# 依存関係をインストール
npm install

# データベースのシード
cd backend
npm run seed
cd ..

# 開発サーバーを起動
npm run dev
```

## よくあるエラーと解決方法

### エラー1: "Cannot find module"

```powershell
npm cache clean --force
Remove-Item -Recurse -Force node_modules
npm install
```

### エラー2: "Permission denied"

PowerShellを管理者権限で開いて実行してください。

### エラー3: "gyp ERR! stack Error: spawn EACCES"

```powershell
npm install --global --production windows-build-tools
```

### エラー4: ポートが使用中

```powershell
# ポート3000を使用しているプロセスを停止
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

## まとめ

1. 公式インストーラーを**管理者として実行**
2. すべてデフォルト設定でインストール
3. 追加ツールのインストールを完了させる
4. PCを再起動（推奨）
5. 新しいPowerShellで `node --version` を確認
6. うまくいかない場合は Chocolatey または Docker を検討

どの方法を試してもうまくいかない場合は、エラーメッセージのスクリーンショットと、上記のサポート情報を提供してください。
