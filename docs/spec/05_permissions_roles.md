# 権限/ロール（アクセス制御）

## 権限定義の考え方

- 権限は「permission 名」単位で定義され、controller/action の集合にマップされる。
- 権限はプロジェクトモジュール単位（例: 課題、時間、Wiki、リポジトリ等）で束ねられ、プロジェクト側でモジュール有効/無効の影響を受ける。

## 要求レベル（典型）

- public: 匿名でも利用可能（公開設定・対象アクションに依存）
- loggedin: ログイン必須
- member: プロジェクトメンバー必須（ロール付与が前提）

## チェック方法（典型）

- controller 側: `authorize` / `authorize_global` 等でブロック
- view/補助: `allowed_to?` により表示/操作の出し分け
- API/取り込み等: APIキー、管理者、専用キー等の追加条件が付与される場合がある

## ロールとメンバーシップ

- プロジェクトへの参加（Member）に Role が紐づき、Role が permission の集合となる。
- 同一ユーザーが複数ロールを持つ場合の扱いは、権限判定ロジックに依存（一般に OR 合成）。

## 根拠（自動抽出）

- 権限定義（静的抽出）: `auto_extract_sanitized/permissions_definitions.md`
- 権限チェック出現箇所（静的抽出）: `auto_extract_sanitized/permissions_checks.md`

