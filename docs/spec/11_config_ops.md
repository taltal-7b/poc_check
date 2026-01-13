# 設定/運用

## 設定の所在

- 同梱設定キー定義: `config/settings.yml`
- 環境別設定: `config/environments/*`
- 初期化/ロード制御: `config/initializers/*`
- ルーティング: `config/routes.rb`

## 代表的な運用観点

- セッション/自動ログイン: 有効化、期限、トークン検証
- 添付: 最大サイズ、許可/拒否拡張子、サムネイル
- メール: 送信元、通知フッタ/ヘッダ、取り込みAPIキー
- API: REST API 有効化、システムAPIキー（存在する設定キーに依存）

## 添付・ストレージ

- 添付の保存先や削除方針は、環境設定/運用手順に依存（ファイルストレージ前提の設計）。

## 参考（設定キー一覧）

- `auto_extract_sanitized/settings_keys.md`

## AIアシスト（想定の設定項目）

- 全体有効化: `ai_assist_enabled`（bool）
- プロジェクト単位の有効化: `ai_assist_enabled_projects`（list）
- 期限接近判定: `ai_due_soon_days`（int）
- 停滞判定: `ai_stale_days`（int）、スコア閾値 `ai_stale_score_threshold`（int）
- 通知抑制: `ai_notify_cooldown_hours`（int）
- 週次レポート: `ai_weekly_report_day_of_week`、`ai_weekly_report_hour`（int）
- 外部送信（利用する場合）: `ai_external_send_enabled`（bool）、マスキング設定 `ai_redaction_enabled`（bool）
- 保持期間: `ai_cache_retention_days`（int）

注: 上記は想定仕様であり、現状の同梱設定キーには含まれない。
