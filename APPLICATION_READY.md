# 🎉 アプリケーション起動完了！

## ✅ 起動状態

すべてのコンテナが正常に起動しています：

- ✅ **データベース（PostgreSQL）**: ポート 5432
- ✅ **バックエンドAPI**: ポート 3001
- ✅ **フロントエンド**: ポート 5173

## 🌐 アクセス方法

### ブラウザでアクセス

以下のURLをブラウザで開いてください：

**http://localhost:5173**

### ログイン情報

```
ユーザー名: admin
パスワード: admin123
```

## 🚀 使用方法

### 1. ログイン

1. ブラウザで http://localhost:5173 を開く
2. ユーザー名 `admin` とパスワード `admin123` を入力
3. 「ログイン」ボタンをクリック

### 2. プロジェクトを作成

1. 左メニューから「プロジェクト」をクリック
2. 右上の「新規プロジェクト」ボタンをクリック
3. 以下の情報を入力：
   - プロジェクト名: `テストプロジェクト`
   - 識別子: `test-project`（自動生成）
   - 説明: 任意
   - 公開: チェックを入れる
4. 「作成」ボタンをクリック

### 3. 課題（チケット）を作成

1. 左メニューから「課題」をクリック
2. 右上の「新規課題」ボタンをクリック
3. 以下の情報を入力：
   - プロジェクト: 作成したプロジェクトを選択
   - トラッカー: バグ / 機能 / サポート / タスク から選択
   - 件名: `テスト課題1`
   - 説明: 任意
   - その他の項目: 任意
4. 「作成」ボタンをクリック

### 4. 課題を編集

1. 課題一覧から課題番号（#1など）をクリック
2. 課題詳細ページが表示される
3. 右上の「編集」ボタンをクリック
4. 内容を変更して「更新」ボタンをクリック

### 5. コメントを追加

1. 課題詳細ページの「コメント」セクションまでスクロール
2. テキストエリアにコメントを入力
3. 「コメントを追加」ボタンをクリック

## 🔧 Docker コマンド

### コンテナの状態を確認

```powershell
docker ps
```

### ログを確認

```powershell
# バックエンドのログ
docker logs pm_backend -f

# フロントエンドのログ
docker logs pm_frontend -f

# データベースのログ
docker logs pm_db -f
```

### コンテナを停止

```powershell
cd C:\Users\kings\poc_check
docker-compose down
```

### コンテナを再起動

```powershell
cd C:\Users\kings\poc_check
docker-compose restart
```

### コンテナを完全に削除して再起動

```powershell
cd C:\Users\kings\poc_check
docker-compose down -v
docker-compose up -d
```

## 🐛 トラブルシューティング

### 問題1: ブラウザで「接続できません」と表示される

**確認:**
```powershell
docker ps
```

すべてのコンテナが `Up` 状態か確認してください。

**解決方法:**
```powershell
docker-compose restart
```

### 問題2: ログインできない

**デフォルトユーザーが作成されているか確認:**
```powershell
docker exec pm_backend npm run seed
```

エラーが出ても、「既に存在する」というエラーなら正常です。

### 問題3: ポートが使用中

**エラー:** `port is already allocated`

**解決方法:**
```powershell
# 使用中のポートを確認
netstat -ano | findstr :5173
netstat -ano | findstr :3001

# Dockerコンテナを停止
docker-compose down

# もう一度起動
docker-compose up -d
```

### 問題4: データベース接続エラー

**ログを確認:**
```powershell
docker logs pm_db
docker logs pm_backend
```

**解決方法:**
```powershell
# データベースコンテナを再起動
docker restart pm_db

# 30秒待ってからバックエンドを再起動
Start-Sleep -Seconds 30
docker restart pm_backend
```

### 問題5: フロントエンドが更新されない

**ブラウザのキャッシュをクリア:**
- `Ctrl + Shift + R` でハードリロード

**コンテナを再起動:**
```powershell
docker restart pm_frontend
```

## 📊 APIエンドポイント

バックエンドAPIには以下のエンドポイントがあります：

### 認証
- `POST http://localhost:3001/api/auth/login` - ログイン
- `POST http://localhost:3001/api/auth/register` - 登録
- `GET http://localhost:3001/api/auth/me` - 現在のユーザー

### プロジェクト
- `GET http://localhost:3001/api/projects` - プロジェクト一覧
- `POST http://localhost:3001/api/projects` - プロジェクト作成
- `GET http://localhost:3001/api/projects/:id` - プロジェクト詳細
- `PUT http://localhost:3001/api/projects/:id` - プロジェクト更新
- `DELETE http://localhost:3001/api/projects/:id` - プロジェクト削除

### 課題
- `GET http://localhost:3001/api/issues` - 課題一覧
- `POST http://localhost:3001/api/issues` - 課題作成
- `GET http://localhost:3001/api/issues/:id` - 課題詳細
- `PUT http://localhost:3001/api/issues/:id` - 課題更新
- `DELETE http://localhost:3001/api/issues/:id` - 課題削除

### マスターデータ
- `GET http://localhost:3001/api/trackers` - トラッカー一覧
- `GET http://localhost:3001/api/issue-statuses` - ステータス一覧
- `GET http://localhost:3001/api/issue-priorities` - 優先度一覧

## 🔒 セキュリティ注意事項

**この設定は開発環境用です。本番環境では以下を変更してください：**

- JWT_SECRET
- JWT_REFRESH_SECRET
- SESSION_SECRET
- データベースのパスワード
- 環境変数 `NODE_ENV=production`

## 📝 次のステップ

1. ✅ ブラウザで http://localhost:5173 を開く
2. ✅ admin / admin123 でログイン
3. ✅ プロジェクトを作成
4. ✅ 課題を作成
5. ✅ 課題を編集
6. ✅ コメントを追加

すべての機能が動作しています！
プロジェクト管理システムをお楽しみください。

## 📞 サポート

問題が発生した場合は、以下のコマンドでログを確認してください：

```powershell
# すべてのコンテナのログ
docker-compose logs

# 特定のコンテナのログ
docker logs pm_backend
docker logs pm_frontend
docker logs pm_db
```
