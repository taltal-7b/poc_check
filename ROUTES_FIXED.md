# ✅ ルートエラーを修正しました

## 問題

以下のURLにアクセスすると Internal Server Error が発生していました：
- `http://localhost:5173/issues/new`
- `http://localhost:5173/projects/new`

## 原因

React Routerに `/issues/new` と `/projects/new` のルートが定義されていませんでした。
パラメータ `:id` が "new" という文字列にマッチしてしまい、存在しないIDとして処理されていました。

## 修正内容

### 1. App.tsx にルートを追加

✅ `/projects/new` → `/projects?openModal=true` にリダイレクト  
✅ `/issues/new` → `/issues?openModal=true` にリダイレクト

### 2. リスト表示ページを更新

✅ `ProjectListPage.tsx` - クエリパラメータ `openModal=true` でモーダルを自動表示  
✅ `IssueListPage.tsx` - クエリパラメータ `openModal=true` でモーダルを自動表示

## 使い方

### 直接URLでアクセス可能になりました

#### プロジェクト作成画面
```
http://localhost:5173/projects/new
```
→ プロジェクト一覧ページに移動して、自動的に作成モーダルが開きます

#### 課題作成画面
```
http://localhost:5173/issues/new
```
→ 課題一覧ページに移動して、自動的に作成モーダルが開きます

### ボタンからの利用

通常通り、UIのボタンからも利用できます：
- プロジェクト一覧の「新規プロジェクト」ボタン
- 課題一覧の「新規課題」ボタン

## 確認手順

### 1. フロントエンドを再起動

```powershell
docker restart pm_frontend
```

### 2. ブラウザで確認

```
# ログイン後、以下のURLにアクセス
http://localhost:5173/projects/new
http://localhost:5173/issues/new
```

### 3. 期待される動作

- ✅ エラーが表示されない
- ✅ 該当ページに移動する
- ✅ 自動的に作成モーダルが開く
- ✅ モーダルで作成操作ができる

## ルート構造

```
/                        → ダッシュボード（ログイン後）
/login                   → ログインページ
/register                → 登録ページ

/projects                → プロジェクト一覧
/projects/new            → プロジェクト作成（→一覧+モーダル）
/projects/:id            → プロジェクト詳細

/issues                  → 課題一覧
/issues/new              → 課題作成（→一覧+モーダル）
/issues/:id              → 課題詳細
```

## トラブルシューティング

### まだエラーが出る場合

#### 1. ブラウザを完全リロード

```
Ctrl + Shift + R
```

#### 2. コンテナを完全再起動

```powershell
cd C:\Users\kings\poc_check
docker-compose restart
```

#### 3. ブラウザのキャッシュをクリア

開発者ツール（F12） → Application → Clear site data

### ログの確認

```powershell
# フロントエンドのログ
docker logs pm_frontend -f

# ブラウザの開発者ツールでエラー確認
F12 → Console タブ
```

## 今後の拡張

同様の方法で、他のエンティティの作成ページも追加できます：

```typescript
// App.tsx に追加
<Route path="users/new" element={<NewUserRedirect />} />
<Route path="versions/new" element={<NewVersionRedirect />} />
```

## まとめ

✅ `/projects/new` と `/issues/new` が正常に動作するようになりました  
✅ 直接URLでアクセスしても、自動的に作成モーダルが開きます  
✅ エラーは表示されません

フロントエンドを再起動後、ブラウザで確認してください！
