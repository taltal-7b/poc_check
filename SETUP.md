# セットアップ手順書

## 📋 前提条件

### Docker環境（推奨）

以下がインストールされている必要があります：

- **Docker Desktop** (Windows/Mac) または **Docker Engine + Docker Compose** (Linux)
- Docker Compose v2.0以降

### ローカル環境

以下のソフトウェアがインストールされている必要があります：

- **Node.js** 18.x 以上
- **PostgreSQL** 14.x 以上
- **npm** または **yarn**

## 🚀 セットアップ手順

### 🐳 Docker環境（推奨）

Docker環境でのセットアップは非常に簡単です！

#### 1. サービスを起動

```bash
# すべてのサービスを起動
docker-compose up -d

# または Makefile を使用
make up
```

#### 2. 初期データを投入

```bash
# 初期データ（管理者ユーザー、ロール等）を投入
docker-compose exec backend npm run seed

# または Makefile を使用
make seed
```

#### 3. アクセス

- **フロントエンド**: http://localhost:5173
- **バックエンドAPI**: http://localhost:3000/api
- **ヘルスチェック**: http://localhost:3000/health

#### 4. 初期ログイン

```
ログイン名: admin
パスワード: admin123
```

**完了！🎉** 詳細は [DOCKER_SETUP.md](./DOCKER_SETUP.md) を参照してください。

---

### 💻 ローカル環境

#### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd poc_check
```

### 2. 依存関係のインストール

```bash
# ルートディレクトリで
npm install
```

### 3. データベースのセットアップ

PostgreSQLにログインし、データベースを作成します：

```sql
CREATE DATABASE project_management;
CREATE USER pm_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE project_management TO pm_user;
```

### 4. 環境変数の設定

#### バックエンド

`backend/.env` ファイルを作成：

```env
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=pm_user
DB_PASSWORD=your_password
DB_DATABASE=project_management

# JWT
JWT_SECRET=your-jwt-secret-key-change-this
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this
JWT_REFRESH_EXPIRES_IN=7d

# Session
SESSION_SECRET=your-session-secret-key-change-this

# Two-Factor Authentication
TWOFA_ENABLED=1
APP_NAME=Project Management System

# Email
MAIL_FROM=noreply@example.com

# Password Policy
PASSWORD_MIN_LENGTH=8

# Application
HOST_NAME=localhost:3000
PROTOCOL=http
APP_TITLE=Project Management System
DEFAULT_LANGUAGE=ja
```

#### フロントエンド

`frontend/.env` ファイルを作成：

```env
VITE_API_URL=http://localhost:3000/api
```

### 5. データベースマイグレーション

TypeORMの`synchronize: true`設定により、初回起動時に自動的にテーブルが作成されます。

本番環境では、マイグレーションファイルを作成して使用してください：

```bash
cd backend
npm run migration:generate -- -n InitialMigration
npm run migration:run
```

### 5.5. 初期データの投入

基本的なロール、ステータス、優先度などの初期データを投入します：

```bash
cd backend
npm run seed
```

これにより以下が作成されます：
- デフォルト管理者ユーザー（login: `admin`, password: `admin123`）
- 3つのロール（管理者、開発者、報告者）
- 6つの課題ステータス（新規、進行中、レビュー中、完了、却下、保留）
- 5つの優先度（低、通常、高、緊急、至急）
- 4つのトラッカー（バグ、機能、サポート、タスク）
- 7つの作業時間活動（設計、開発、テスト、レビュー、ドキュメント作成、会議、調査）

**⚠️ 初回ログイン後、必ずパスワードを変更してください！**

### 6. アプリケーションの起動

#### 開発モード（推奨）

ルートディレクトリから両方を同時に起動：

```bash
npm run dev
```

または、個別に起動：

```bash
# ターミナル1: バックエンド
npm run dev:backend

# ターミナル2: フロントエンド
npm run dev:frontend
```

#### 本番モード

```bash
# ビルド
npm run build

# 起動
npm start
```

## 🌐 アクセス

- **フロントエンド**: http://localhost:5173
- **バックエンドAPI**: http://localhost:3000/api
- **ヘルスチェック**: http://localhost:3000/health

## 👤 初期ログイン

初期データを投入した場合、以下の管理者アカウントでログインできます：

- **ログイン名**: `admin`
- **パスワード**: `admin123`

1. ブラウザで http://localhost:5173/login にアクセス
2. 上記の認証情報でログイン
3. **初回ログイン後、必ずパスワードを変更してください**

## 新規ユーザーの登録

管理者としてログインしていない場合、登録ページから新規ユーザーを作成できます：

1. http://localhost:5173/register にアクセス
2. 必要な情報を入力して登録

## 🔐 管理者権限の付与（追加ユーザー用）

既存のユーザーに管理者権限を付与する場合：

```sql
-- ユーザーIDを確認
SELECT id, login, admin FROM users;

-- 管理者権限を付与（user_id は適宜変更）
UPDATE users SET admin = true WHERE id = 2;
```

## 📝 トラブルシューティング

### データベース接続エラー

1. PostgreSQLが起動しているか確認
2. `.env`の接続情報が正しいか確認
3. データベースとユーザーが作成されているか確認

```bash
# PostgreSQLの起動確認
sudo systemctl status postgresql  # Linux
brew services list                # macOS
```

### ポートが既に使用されている

```bash
# ポート3000を使用しているプロセスを確認
lsof -i :3000

# プロセスを終了
kill -9 <PID>
```

### TypeORMのエラー

`synchronize: false`に設定している場合、マイグレーションを実行：

```bash
cd backend
npm run migration:run
```

## 🧪 追加のテストデータ

`npm run seed` で基本データが投入されます。さらに開発用のサンプルプロジェクトや課題を作成する場合は、管理画面から手動で作成するか、以下のようなSQLを実行してください：

```sql
-- サンプルプロジェクトの作成
INSERT INTO projects (name, identifier, description, status, is_public, author_id, created_at, updated_at)
VALUES 
('サンプルプロジェクト', 'sample', 'テスト用のプロジェクトです', 1, true, 1, NOW(), NOW());

-- プロジェクトメンバーの追加
INSERT INTO members (user_id, project_id, created_at, updated_at)
VALUES (1, 1, NOW(), NOW());

-- メンバーロールの割り当て
INSERT INTO member_roles (member_id, role_id)
VALUES (1, 1);
```

## 📚 実装状況

**Phase 2まで完了しました！** 以下の機能が利用可能です：

### ✅ 完了した機能

**Phase 1: 認証システム**
- ✅ ユーザー登録・ログイン
- ✅ JWT認証
- ✅ 2段階認証（TOTP）
- ✅ セッション管理

**Phase 2: コア機能**
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

### 🚧 今後の実装予定

**Phase 3:**
- カスタムフィールド
- カスタムクエリ
- Wiki機能
- ドキュメント管理

**Phase 4:**
- リポジトリ連携（Git/SVN）
- 掲示板・ニュース機能
- メール通知システム
- カレンダー・ガントチャート

## 🆘 サポート

問題が発生した場合は、以下を確認してください：

1. ログファイルの確認
2. 環境変数の設定
3. データベース接続
4. ポート番号の競合

詳細は [README.md](./README.md) を参照してください。
