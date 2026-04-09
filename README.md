# TaskNova

TypeScript製のプロジェクト管理システム。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| バックエンド | Express + TypeScript + Prisma |
| フロントエンド | React 18 + Vite + TailwindCSS |
| データベース | PostgreSQL 16 |
| 認証 | JWT + TOTP (2FA) |
| 実行環境 | Node.js 20 |

## 機能一覧

1. **プロジェクト管理** — 作成・編集・削除・コピー・アーカイブ・サブプロジェクト
2. **チケット管理** — CRUD・一括編集・リレーション・ジャーナル・リアクション
3. **トラッカー・ステータス・ワークフロー** — 柔軟なチケット分類と遷移制御
4. **カスタムフィールド** — 各種オブジェクトへの自由項目追加
5. **工数管理** — 記録・一括編集・レポート・作業分類
6. **ガントチャート** — 横棒タイムライン表示
7. **カレンダー** — 月別チケット表示
8. **Wiki** — Markdown・バージョン管理・保護・エクスポート
9. **文書管理** — カテゴリ別文書管理
10. **ファイル管理** — アップロード・ダウンロード
11. **ニュース** — 投稿・コメント
12. **フォーラム** — 掲示板・トピック・返信・引用
13. **リポジトリ連携** — Git/SVN 等の登録
14. **バージョン/ロードマップ** — マイルストーン・進捗集計
15. **検索** — 横断検索（チケット・Wiki・ニュース・文書・メッセージ）
16. **カスタムクエリ** — フィルタ保存・共有
17. **レポート** — チケット集計・工数集計
18. **アクティビティ** — 全操作の履歴タイムライン
19. **ユーザー管理** — CRUD・一括操作・グループ・ロール
20. **認証・セキュリティ** — JWT・2FA(TOTP)・OAuth2・LDAP・APIキー
21. **マイページ** — 個人ダッシュボード
22. **通知** — メール通知
23. **インポート/エクスポート** — CSV入出力・PDF出力
24. **テーマ** — カスタムテーマ対応
25. **プラグイン** — プラグイン管理基盤
26. **REST API** — 全リソースのAPIアクセス
27. **多言語対応** — 日本語 / 英語（拡張可能）

## クイックスタート

### Docker Compose（推奨）

```bash
docker compose up -d
```

- フロントエンド: http://localhost:5173
- バックエンドAPI: http://localhost:3000/api/v1
- 初期ログイン: `admin` / `admin`

### ローカル開発

```bash
# 依存関係のインストール
npm install

# PostgreSQL を起動（Docker で）
docker compose up db -d

# 環境変数の設定
cp .env.example backend/.env

# データベースのセットアップ
cd backend
npx prisma migrate dev
npx tsx prisma/seed.ts

# 開発サーバーの起動
cd ..
npm run dev
```

- フロントエンド: http://localhost:5173
- バックエンド: http://localhost:3000

## 環境変数

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `DATABASE_URL` | PostgreSQL接続URL | (必須) |
| `JWT_SECRET` | JWTアクセストークン署名鍵 | (必須) |
| `JWT_REFRESH_SECRET` | JWTリフレッシュトークン署名鍵 | (必須) |
| `PORT` | バックエンドポート | `3000` |
| `FRONTEND_URL` | フロントエンドURL（CORS） | `http://localhost:5173` |
| `SMTP_HOST` | SMTPホスト | `localhost` |
| `SMTP_PORT` | SMTPポート | `1025` |
| `UPLOAD_DIR` | ファイルアップロード先 | `./uploads` |

## ディレクトリ構成

```
├── backend/
│   ├── prisma/          # スキーマ・マイグレーション・シード
│   └── src/
│       ├── config/      # 設定
│       ├── i18n/        # 翻訳 (ja/en)
│       ├── middleware/   # 認証・エラーハンドリング・ファイルアップロード
│       ├── routes/      # 全APIルート
│       └── utils/       # DB・エラー・レスポンスヘルパー
├── frontend/
│   └── src/
│       ├── api/         # APIクライアント・フック
│       ├── i18n/        # 翻訳JSON (ja/en)
│       ├── layouts/     # メインレイアウト
│       ├── pages/       # 全ページコンポーネント
│       │   └── admin/   # 管理者ページ
│       ├── stores/      # Zustandストア
│       └── types/       # 型定義
├── docker-compose.yml
├── claude.md            # バイブコーディングルール
└── README.md
```

## ライセンス

MIT
