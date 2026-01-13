# プロジェクト管理システム

仕様書に基づいて作成されたプロジェクト管理システム（Phase 1実装）

## 技術スタック

### バックエンド
- Node.js + Express
- TypeScript
- PostgreSQL
- TypeORM
- JWT認証
- 2FA (TOTP)

### フロントエンド
- React
- TypeScript
- Vite

## プロジェクト構成

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
└── frontend/         # フロントエンド（準備中）
```

## セットアップ

### 前提条件
- Node.js 18.x 以上
- PostgreSQL 14.x 以上
- npm または yarn

### インストール

1. リポジトリのクローン後、依存関係をインストール：

```bash
npm install
```

2. PostgreSQLデータベースの作成：

```sql
CREATE DATABASE project_management;
```

3. 環境変数の設定：

backend/.env ファイルを作成し、以下を設定：

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

### 起動方法

開発モード：

```bash
npm run dev
```

本番モード：

```bash
npm run build
npm start
```

## Phase 1 実装内容

### ✅ 完了
- ✅ プロジェクト基盤セットアップ（package.json, tsconfig等）
- ✅ データベーススキーマ設計（TypeORMエンティティ定義）
- ✅ 認証システム実装（JWT, セッション, 2FA）
- ✅ React フロントエンド基盤セットアップ
- ✅ 認証UI（ログイン, 登録, 2FA）
- ✅ プロジェクト一覧・詳細UI
- ✅ 課題一覧・詳細UI
- ✅ 課題作成・編集UI

### 🚧 Phase 2（次回実装予定）
- ユーザー管理API（CRUD, ロール, グループ）
- プロジェクト管理API（CRUD, メンバー, モジュール）
- 課題管理API（CRUD, ステータス, トラッカー）
- 権限・ロールシステム実装

## API エンドポイント

### 認証
- `POST /api/auth/register` - ユーザー登録
- `POST /api/auth/login` - ログイン
- `POST /api/auth/logout` - ログアウト
- `GET /api/auth/me` - 現在のユーザー情報取得
- `POST /api/auth/2fa/enable` - 2FA有効化
- `POST /api/auth/2fa/confirm` - 2FA確認
- `POST /api/auth/2fa/verify` - 2FA検証
- `POST /api/auth/2fa/disable` - 2FA無効化

### ユーザー（準備中）
- `GET /api/users` - ユーザー一覧
- `GET /api/users/:id` - ユーザー詳細
- `POST /api/users` - ユーザー作成（管理者のみ）
- `PUT /api/users/:id` - ユーザー更新
- `DELETE /api/users/:id` - ユーザー削除（管理者のみ）

### プロジェクト（準備中）
- `GET /api/projects` - プロジェクト一覧
- `GET /api/projects/:id` - プロジェクト詳細
- `POST /api/projects` - プロジェクト作成
- `PUT /api/projects/:id` - プロジェクト更新
- `DELETE /api/projects/:id` - プロジェクト削除

### 課題（準備中）
- `GET /api/issues` - 課題一覧
- `GET /api/issues/:id` - 課題詳細
- `POST /api/issues` - 課題作成
- `PUT /api/issues/:id` - 課題更新
- `DELETE /api/issues/:id` - 課題削除

## データベーススキーマ

主要なエンティティ：
- User - ユーザー
- Group - グループ
- Project - プロジェクト
- Role - ロール
- Member - メンバーシップ
- Issue - 課題
- Tracker - トラッカー
- IssueStatus - ステータス
- Journal - 更新履歴
- TimeEntry - 作業時間
- Attachment - 添付ファイル
- WorkflowRule - ワークフロールール

## ライセンス

MIT
