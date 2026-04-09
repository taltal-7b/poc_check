# TaskNova - バイブコーディングルール

## プロジェクト概要

TaskNovaはTypeScript製のプロジェクト管理システムである。
「Redmine」という単語はコード・ドキュメント・UIのいずれにおいても使用禁止。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| バックエンド | Express + TypeScript |
| ORM | Prisma |
| データベース | PostgreSQL |
| フロントエンド | React 18 + Vite + TypeScript |
| CSS | TailwindCSS |
| 状態管理 | Zustand |
| サーバー状態 | TanStack Query (React Query) |
| 認証 | JWT (access + refresh token) |
| i18n | react-i18next (frontend), カスタム (backend) |

## ディレクトリ構造

```
/
├── backend/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.ts          # エントリポイント
│       ├── app.ts            # Express設定
│       ├── config/           # 設定
│       ├── middleware/        # ミドルウェア
│       ├── routes/           # ルート定義
│       ├── services/         # ビジネスロジック
│       ├── utils/            # ユーティリティ
│       └── i18n/             # 翻訳ファイル
└── frontend/
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/              # APIクライアント
        ├── components/       # 共通コンポーネント
        ├── features/         # 機能別モジュール
        ├── hooks/            # カスタムフック
        ├── i18n/             # 翻訳ファイル
        ├── layouts/          # レイアウト
        ├── pages/            # ページ
        ├── stores/           # Zustandストア
        └── types/            # 型定義
```

## コーディング規約

### 全般
- 言語: TypeScript (strict mode)
- インデント: スペース2つ
- セミコロン: あり
- クォート: シングルクォート
- 末尾カンマ: あり
- 改行コード: LF

### 命名規則
- ファイル名: kebab-case (`user-service.ts`)
- コンポーネント: PascalCase (`UserProfile.tsx`)
- 関数・変数: camelCase
- 定数: UPPER_SNAKE_CASE
- 型・インターフェース: PascalCase (接頭辞なし)
- DBカラム: snake_case (Prismaで変換)

### バックエンド
- ルートハンドラは `routes/` に機能単位でまとめる
- ビジネスロジックは `services/` に分離する
- エラーは `AppError` クラスをthrowし、グローバルハンドラで処理する
- バリデーションは Zod を使用する
- レスポンス形式: `{ success: boolean, data?: T, error?: { code: string, message: string } }`

### フロントエンド
- ページコンポーネントは `pages/` に配置
- 再利用可能なUIは `components/` に配置
- 機能固有のコンポーネント・フック・型は `features/機能名/` にまとめる
- APIコールは TanStack Query のカスタムフックとして `api/` に定義
- グローバル状態は Zustand で管理、サーバー状態は TanStack Query で管理

### i18n (国際化)
- デフォルト言語: 日本語 (ja)
- 対応言語: 日本語 (ja), 英語 (en)
- 翻訳キーはドット記法のネスト構造: `projects.create.title`
- 新しい言語追加は翻訳ファイルを追加するだけで可能にする
- UIテキストのハードコードは禁止。必ずi18n経由にする

### データベース
- テーブル名: 複数形snake_case
- 主キー: `id` (UUID)
- タイムスタンプ: `created_at`, `updated_at`
- 論理削除が必要な場合: `deleted_at`
- 外部キー: `テーブル名単数_id`

### API設計
- RESTful設計に従う
- バージョニング: `/api/v1/`
- 一覧取得: `GET /api/v1/resources?page=1&per_page=25`
- ページネーション: offset-based (`page`, `per_page`)
- レスポンスにページネーション情報を含める: `{ data: [], pagination: { total, page, per_page, total_pages } }`

### セキュリティ
- パスワードは bcrypt でハッシュ化
- JWT の有効期限: access=15min, refresh=7days
- CORS は設定ファイルで制御
- SQLインジェクション対策: Prismaのパラメタライズドクエリを使用
- XSS対策: ユーザー入力のサニタイズ

### テスト
- テストフレームワーク: Vitest
- テストファイル: `*.test.ts` / `*.test.tsx`
- 配置: ソースファイルと同階層

## 禁止事項

1. 「Redmine」の使用 (コード、コメント、ドキュメント、UIすべて)
2. `any` 型の使用 (やむを得ない場合は `unknown` + 型ガード)
3. `console.log` の本番コードでの使用 (loggerを使用)
4. 未処理の Promise rejection
5. ハードコードされた設定値 (環境変数 or 設定ファイルを使用)
