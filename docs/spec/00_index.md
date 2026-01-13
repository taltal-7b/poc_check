# 対象アプリケーション v5.1.11 現状仕様書（core）

生成日時: `2026-01-13`

## 目的

- 本ドキュメントは、リポジトリ内のコードおよび設定ファイルから読み取れる **現状仕様** を、開発・運用エンジニア向けに整理したものです。
- DB上の運用設定（ワークフローやロールの実値など）は前提にせず、コードと同梱設定（例: `config/settings.yml`）を根拠にします。

## スコープ

- 対象: core（`app/`, `lib/`, `config/`, `db/migrate/`, `public/`, `doc/`）
- 除外: `plugins/` 配下（要望により除外）

## 目次

- `01_overview.md`: 概要 / 前提 / 非機能の観点
- `02_architecture.md`: アーキテクチャ / 初期化 / リクエスト処理
- `03_domain_model.md`: ドメインモデル（概念ER）
- `04_features.md`: 機能一覧（入口・主要フロー）
- `05_permissions_roles.md`: 権限/ロール/アクセス制御
- `06_workflow_status.md`: ステータス/ワークフロー/トラッカー
- `07_notifications_mail.md`: 通知/メール送信/メール取り込み
- `08_api_and_routes.md`: ルーティング/API（概要）
- `09_ui_views.md`: 画面/テンプレート/アセット
- `10_jobs_background.md`: ジョブ/非同期処理
- `11_config_ops.md`: 設定/運用/バックアップ/アップグレード観点
- `12_security.md`: セキュリティ（認証/2FA/CSRF/APIキー等）
- `13_extension_points.md`: 拡張ポイント（core側提供）
- `14_ai_assist.md`: AIアシスト機能（想定仕様）

## 付録（自動抽出）

自動抽出の“生データ”はノイズが多いので、本体仕様書では要点のみ利用します。必要な場合は以下（サニタイズ済み）を参照してください。

- `auto_extract_sanitized/00_index.md`
- `auto_extract_sanitized/routes.md`
- `auto_extract_sanitized/settings_keys.md`
- `auto_extract_sanitized/domain_relations.md`
- `auto_extract_sanitized/permissions_definitions.md`
- `auto_extract_sanitized/permissions_checks.md`
- `auto_extract_sanitized/jobs_and_mail.md`

