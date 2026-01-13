# Docker セットアップガイド

## 🐳 Docker環境での起動方法

### 前提条件

以下がインストールされている必要があります：
- Docker Desktop (Windows/Mac) または Docker Engine + Docker Compose (Linux)
- Docker Compose v2.0以降

### クイックスタート

#### 1. リポジトリのクローン（既に完了している場合はスキップ）

```bash
cd poc_check
```

#### 2. Docker Composeでサービスを起動

```bash
# すべてのサービスを起動（初回はビルドに時間がかかります）
docker-compose up -d

# または、ログを表示しながら起動
docker-compose up
```

初回起動時は以下のプロセスが実行されます：
- PostgreSQLコンテナの起動
- バックエンドのビルドと起動
- フロントエンドのビルドと起動
- データベースの初期化（自動）

#### 3. データベースの初期データ投入

```bash
# バックエンドコンテナに入る
docker-compose exec backend sh

# シードスクリプトを実行
npm run seed

# コンテナから抜ける
exit
```

#### 4. アクセス

- **フロントエンド**: http://localhost:5173
- **バックエンドAPI**: http://localhost:3000/api
- **ヘルスチェック**: http://localhost:3000/health

#### 5. 初期ログイン情報

```
ログイン名: admin
パスワード: admin123
```

**⚠️ 初回ログイン後、必ずパスワードを変更してください！**

---

## 📋 Docker Compose サービス構成

### サービス一覧

1. **db** - PostgreSQL 16
   - ポート: 5432
   - データベース: `projectmanager`
   - ユーザー: `pm_user`
   - パスワード: `pm_password`

2. **backend** - Node.js API
   - ポート: 3000
   - 開発モード（ホットリロード）
   - TypeORM同期有効

3. **frontend** - React App
   - ポート: 5173
   - 開発モード（ホットリロード）
   - Vite開発サーバー

---

## 🛠️ 便利なコマンド

### サービスの管理

```bash
# すべてのサービスを起動
docker-compose up -d

# すべてのサービスを停止
docker-compose stop

# すべてのサービスを削除（データは保持）
docker-compose down

# すべてのサービスとデータを削除
docker-compose down -v

# 特定のサービスのみ再起動
docker-compose restart backend
docker-compose restart frontend

# サービスの状態確認
docker-compose ps

# ログの確認
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db
```

### コンテナ内での作業

```bash
# バックエンドコンテナに入る
docker-compose exec backend sh

# フロントエンドコンテナに入る
docker-compose exec frontend sh

# データベースコンテナに入る
docker-compose exec db psql -U pm_user -d projectmanager

# バックエンドでコマンド実行
docker-compose exec backend npm run seed
docker-compose exec backend npm run typeorm migration:run

# npmパッケージの追加（バックエンド）
docker-compose exec backend npm install <package-name>

# npmパッケージの追加（フロントエンド）
docker-compose exec frontend npm install <package-name>
```

### データベース操作

```bash
# データベースに接続
docker-compose exec db psql -U pm_user -d projectmanager

# データベースのバックアップ
docker-compose exec db pg_dump -U pm_user projectmanager > backup.sql

# データベースのリストア
docker-compose exec -T db psql -U pm_user projectmanager < backup.sql

# テーブル一覧確認
docker-compose exec db psql -U pm_user -d projectmanager -c "\dt"
```

---

## 🔧 トラブルシューティング

### ポートが既に使用されている

```bash
# 使用中のポートを確認（Windows）
netstat -ano | findstr :3000
netstat -ano | findstr :5173
netstat -ano | findstr :5432

# 使用中のポートを確認（Mac/Linux）
lsof -i :3000
lsof -i :5173
lsof -i :5432

# docker-compose.ymlのポート番号を変更
# 例: "3001:3000" に変更
```

### コンテナが起動しない

```bash
# ログを確認
docker-compose logs backend
docker-compose logs frontend
docker-compose logs db

# コンテナを再ビルド
docker-compose up --build

# すべてクリーンアップして再起動
docker-compose down -v
docker-compose up --build
```

### データベース接続エラー

```bash
# データベースの状態確認
docker-compose ps db

# データベースのヘルスチェック
docker-compose exec db pg_isready -U pm_user -d projectmanager

# データベースを再起動
docker-compose restart db

# データベースログを確認
docker-compose logs db
```

### フロントエンドが表示されない

```bash
# フロントエンドのログ確認
docker-compose logs frontend

# ブラウザのキャッシュをクリア
# または、シークレットモードで開く

# APIのURLを確認
# frontend/.env に VITE_API_URL=http://localhost:3000/api が設定されているか
```

### バックエンドAPIが応答しない

```bash
# バックエンドのログ確認
docker-compose logs backend

# ヘルスチェック
curl http://localhost:3000/health

# データベース接続確認
docker-compose exec backend npm run typeorm migration:show
```

### ホットリロードが効かない

```bash
# Windowsの場合、WSL2を使用することを推奨
# または、polling modeを有効化

# backend/vite.config.ts に追加
watch: {
  usePolling: true
}
```

### node_modulesの問題

```bash
# コンテナ内で再インストール
docker-compose exec backend npm ci
docker-compose exec frontend npm ci

# または、ボリュームをクリア
docker-compose down -v
docker-compose up --build
```

---

## 🚀 本番環境向けビルド

### 本番用Dockerfile作成

#### backend/Dockerfile.prod

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

#### frontend/Dockerfile.prod

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 本番用docker-compose.prod.yml

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${DB_DATABASE}
      POSTGRES_USER: ${DB_USERNAME}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    environment:
      NODE_ENV: production
      # 環境変数は .env から読み込む
    depends_on:
      - db
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres_data:
```

---

## 📊 リソース使用状況の確認

```bash
# コンテナのリソース使用状況
docker stats

# ディスク使用量
docker system df

# 不要なリソースのクリーンアップ
docker system prune -a --volumes
```

---

## 🔐 セキュリティ注意事項

### 開発環境
- デフォルトのパスワードは開発専用です
- ローカル開発のみで使用してください

### 本番環境
1. **環境変数を変更**
   - すべての秘密鍵を強力なランダム文字列に
   - データベースパスワードを変更

2. **Docker Secrets使用**
   ```yaml
   secrets:
     db_password:
       file: ./secrets/db_password.txt
   ```

3. **HTTPS設定**
   - リバースプロキシ（Nginx/Traefik）を使用
   - SSL証明書を設定

4. **ファイアウォール**
   - 必要なポートのみ公開
   - データベースは内部ネットワークのみ

---

## 📝 環境変数一覧

### バックエンド

| 変数名 | 説明 | デフォルト値 | 必須 |
|--------|------|--------------|------|
| NODE_ENV | 環境 | development | ✅ |
| PORT | ポート番号 | 3000 | ✅ |
| DB_HOST | DBホスト | db | ✅ |
| DB_PORT | DBポート | 5432 | ✅ |
| DB_USERNAME | DBユーザー | pm_user | ✅ |
| DB_PASSWORD | DBパスワード | - | ✅ |
| DB_DATABASE | DB名 | projectmanager | ✅ |
| JWT_SECRET | JWT秘密鍵 | - | ✅ |
| JWT_REFRESH_SECRET | リフレッシュ秘密鍵 | - | ✅ |
| SESSION_SECRET | セッション秘密鍵 | - | ✅ |
| FRONTEND_URL | フロントURL | http://localhost:5173 | ✅ |

### フロントエンド

| 変数名 | 説明 | デフォルト値 | 必須 |
|--------|------|--------------|------|
| VITE_API_URL | API URL | http://localhost:3000/api | ✅ |

---

## 🎯 まとめ

Docker環境でのセットアップが完了しました！

```bash
# 1. 起動
docker-compose up -d

# 2. 初期データ投入
docker-compose exec backend npm run seed

# 3. アクセス
# http://localhost:5173
```

問題が発生した場合は、ログを確認してください：
```bash
docker-compose logs -f
```
