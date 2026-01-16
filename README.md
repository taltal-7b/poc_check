# プロジェクト管理システム

仕様書に基づいて作成されたプロジェクト管理システム（Phase 1-3実装完了）

## 📋 概要

このプロジェクト管理システムは、Redmineを参考にした機能豊富なプロジェクト管理ツールです。チケット管理、プロジェクト管理、Wiki、ドキュメント管理、時間管理などの機能を提供します。

## ✨ 主な機能

### ✅ 実装済み機能

#### Phase 1: 認証システム
- ✅ ユーザー登録・ログイン
- ✅ JWT認証
- ✅ 2段階認証（TOTP）
- ✅ セッション管理

#### Phase 2: コア機能
- ✅ ユーザー管理（CRUD、検索、ロック/アンロック）
- ✅ ロール管理（80以上の詳細権限）
- ✅ グループ管理（メンバー管理）
- ✅ 権限チェックシステム（プロジェクト/グローバル）
- ✅ プロジェクト管理（CRUD、モジュール、トラッカー）
- ✅ メンバー管理（ロール割り当て）
- ✅ 課題管理（CRUD、コピー、一括更新）
- ✅ 課題関連（リレーション管理）
- ✅ ウォッチャー（課題の監視）
- ✅ ワークフロー管理（ステータス遷移制御）
- ✅ 時間管理（作業時間記録、活動管理）

#### Phase 3: 拡張機能
- ✅ バージョン管理
- ✅ カテゴリ管理
- ✅ カスタムフィールド
- ✅ ドキュメント管理
- ✅ Wiki機能
- ✅ ニュース機能
- ✅ 添付ファイル管理（課題への添付）

## 🛠️ 技術スタック

### バックエンド
- Node.js + Express
- TypeScript
- PostgreSQL
- TypeORM
- JWT認証
- 2FA (TOTP)
- bcrypt（パスワードハッシュ化）

### フロントエンド
- React
- TypeScript
- Vite
- React Router
- Axios

### インフラ
- Docker & Docker Compose
- PostgreSQL 16

## 🚀 クイックスタート

### Docker環境（推奨）

最も簡単な起動方法です。

```bash
# 1. すべてのサービスを起動
docker-compose up -d

# 2. 初期データを投入
docker-compose exec backend npm run seed

# 3. アクセス
# フロントエンド: http://localhost:5173
# バックエンドAPI: http://localhost:3000/api
```

**初期ログイン情報:**
```
ログイン名: admin
パスワード: admin123
```

⚠️ **初回ログイン後、必ずパスワードを変更してください！**

詳細なセットアップ手順は [SETUP.md](./SETUP.md) または [DOCKER_SETUP.md](./DOCKER_SETUP.md) を参照してください。

---

### ローカル環境

#### 前提条件
- Node.js 18.x 以上
- PostgreSQL 14.x 以上
- npm または yarn

#### セットアップ手順

1. **依存関係のインストール**
```bash
npm install
```

2. **データベースの作成**
```sql
CREATE DATABASE project_management;
```

3. **環境変数の設定**

`backend/.env` ファイルを作成：
```env
NODE_ENV=development
PORT=3000
API_PREFIX=/api

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=project_management

JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

SESSION_SECRET=your-session-secret

PASSWORD_MIN_LENGTH=8
```

`frontend/.env` ファイルを作成：
```env
VITE_API_URL=http://localhost:3000/api
```

4. **初期データの投入**
```bash
cd backend
npm run seed
```

5. **アプリケーションの起動**

開発モード（推奨）:
```bash
# ルートディレクトリから
npm run dev
```

個別に起動:
```bash
# ターミナル1: バックエンド
npm run dev:backend

# ターミナル2: フロントエンド
npm run dev:frontend
```

## 🌐 アクセス

- **フロントエンド**: http://localhost:5173
- **バックエンドAPI**: http://localhost:3000/api
- **ヘルスチェック**: http://localhost:3000/health

## 📁 プロジェクト構成

```
.
├── backend/          # バックエンドAPI
│   ├── src/
│   │   ├── config/      # 設定ファイル
│   │   ├── controllers/ # コントローラー
│   │   ├── entities/    # TypeORMエンティティ
│   │   ├── middleware/  # ミドルウェア
│   │   ├── routes/      # ルート定義
│   │   ├── utils/       # ユーティリティ
│   │   └── index.ts     # エントリーポイント
│   ├── package.json
│   └── tsconfig.json
├── frontend/         # フロントエンド
│   ├── src/
│   │   ├── components/  # Reactコンポーネント
│   │   ├── pages/       # ページコンポーネント
│   │   ├── services/    # APIサービス
│   │   └── utils/       # ユーティリティ
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
└── package.json
```

## 📚 主要なAPIエンドポイント

### 認証
- `POST /api/auth/register` - ユーザー登録
- `POST /api/auth/login` - ログイン
- `POST /api/auth/logout` - ログアウト
- `GET /api/auth/me` - 現在のユーザー情報取得
- `POST /api/auth/2fa/enable` - 2FA有効化
- `POST /api/auth/2fa/verify` - 2FA検証

### ユーザー管理
- `GET /api/users` - ユーザー一覧
- `GET /api/users/:id` - ユーザー詳細
- `POST /api/users` - ユーザー作成
- `PUT /api/users/:id` - ユーザー更新
- `DELETE /api/users/:id` - ユーザー削除

### プロジェクト管理
- `GET /api/projects` - プロジェクト一覧
- `GET /api/projects/:id` - プロジェクト詳細
- `POST /api/projects` - プロジェクト作成
- `PUT /api/projects/:id` - プロジェクト更新
- `DELETE /api/projects/:id` - プロジェクト削除

### 課題管理
- `GET /api/issues` - 課題一覧
- `GET /api/issues/:id` - 課題詳細
- `POST /api/issues` - 課題作成
- `PUT /api/issues/:id` - 課題更新
- `DELETE /api/issues/:id` - 課題削除
- `POST /api/issues/:id/copy` - 課題コピー

### Wiki
- `GET /api/projects/:projectId/wiki` - Wiki取得
- `GET /api/projects/:projectId/wiki/pages` - Wikiページ一覧
- `PUT /api/projects/:projectId/wiki/:title` - Wikiページ作成/更新
- `DELETE /api/projects/:projectId/wiki/:title` - Wikiページ削除

### その他
- `GET /api/roles` - ロール一覧
- `GET /api/groups` - グループ一覧
- `GET /api/time-entries` - 作業時間一覧
- `GET /api/documents` - ドキュメント一覧
- `GET /api/news` - ニュース一覧

詳細なAPIリファレンスは [API_REFERENCE.md](./API_REFERENCE.md) を参照してください。

## 🔒 セキュリティ機能

- ✅ JWT認証
- ✅ 2段階認証（TOTP）
- ✅ パスワードハッシュ化（bcrypt）
- ✅ ロールベース権限制御（81権限）
- ✅ プロジェクト単位の権限分離
- ✅ プライベート課題の保護
- ✅ Rate limiting
- ✅ CSRF対策（helmet）

## 📊 実装状況

### 完了したフェーズ
- ✅ **Phase 1**: 認証システム（100%）
- ✅ **Phase 2**: コア機能（100%）
- ✅ **Phase 3**: 拡張機能（75% - 6/8項目）

### 実装済み機能
- ✅ ユーザー・ロール・グループ管理
- ✅ プロジェクト管理とメンバーシップ
- ✅ 課題管理システム（関連、ウォッチャー含む）
- ✅ 柔軟なワークフロー制御
- ✅ 作業時間トラッキング
- ✅ バージョン・カテゴリ管理
- ✅ カスタムフィールド
- ✅ ドキュメント管理
- ✅ Wiki機能
- ✅ ニュース機能
- ✅ 添付ファイル管理

### 今後の実装予定
- ⏳ カスタムクエリ
- ⏳ ガントチャート機能
- ⏳ メール通知システム
- ⏳ リポジトリ連携（Git/SVN）
- ⏳ カレンダー機能

詳細は [FEATURE_STATUS_REPORT.md](./FEATURE_STATUS_REPORT.md) を参照してください。

## 🐳 Dockerコマンド

### 基本的な操作
```bash
# 起動
docker-compose up -d

# 停止
docker-compose stop

# 再起動
docker-compose restart

# 削除（データ保持）
docker-compose down

# 完全削除（データも削除）
docker-compose down -v
```

### ログ確認
```bash
# すべてのログ
docker-compose logs -f

# 特定のサービスのログ
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db
```

### コンテナ内での作業
```bash
# バックエンドコンテナに入る
docker-compose exec backend sh

# 初期データ投入
docker-compose exec backend npm run seed

# データベースに接続
docker-compose exec db psql -U pm_user -d projectmanager
```

詳細は [DOCKER_SETUP.md](./DOCKER_SETUP.md) を参照してください。

## 🐛 トラブルシューティング

### よくある問題

#### ポートが使用中
```bash
# Windows
netstat -ano | findstr :5173
netstat -ano | findstr :3000

# コンテナを停止
docker-compose down
```

#### データベース接続エラー
```bash
# データベースの状態確認
docker-compose ps db

# データベースを再起動
docker-compose restart db
```

#### ログインできない
```bash
# 初期データを再投入
docker-compose exec backend npm run seed
```

詳細なトラブルシューティングは [SETUP.md](./SETUP.md) または [APPLICATION_READY.md](./APPLICATION_READY.md) を参照してください。

## 📖 ドキュメント

- [SETUP.md](./SETUP.md) - セットアップ手順（詳細）
- [DOCKER_SETUP.md](./DOCKER_SETUP.md) - Docker環境のセットアップ
- [API_REFERENCE.md](./API_REFERENCE.md) - APIリファレンス
- [APPLICATION_READY.md](./APPLICATION_READY.md) - アプリケーション起動ガイド
- [PHASE2_COMPLETION.md](./PHASE2_COMPLETION.md) - Phase 2実装完了報告
- [PHASE3_COMPLETION.md](./PHASE3_COMPLETION.md) - Phase 3実装完了報告
- [FEATURE_STATUS_REPORT.md](./FEATURE_STATUS_REPORT.md) - 機能実装状況レポート

## 🔐 セキュリティ注意事項

**この設定は開発環境用です。本番環境では以下を変更してください：**

- JWT_SECRET
- JWT_REFRESH_SECRET
- SESSION_SECRET
- データベースのパスワード
- 環境変数 `NODE_ENV=production`
- HTTPSの設定
- ファイアウォール設定

## 📝 ライセンス

MIT

## 🤝 サポート

問題が発生した場合は、以下を確認してください：

1. ログファイルの確認
2. 環境変数の設定
3. データベース接続
4. ポート番号の競合

詳細は各ドキュメントファイルを参照してください。
