# ルーティング/API（概要）

## ルーティングの位置づけ

- ルーティングは `config/routes.rb` に定義され、controller/action へマップされる。
- `resources` 宣言により REST ルートが生成される箇所がある。

## 代表的なエンドポイント（抜粋）

- 認証: `login`, `logout`
- マイページ: `my/*`
- 課題: `issues/*`（一覧/作成/編集/一括更新等）
- プロジェクト: `projects/*`（設定/メンバー等）
- 取り込み: `mail_handler`（POST）
- 管理: `admin/*`

## 詳細一覧

- 明示ルート/`resources` 宣言: `auto_extract_sanitized/routes.md`

