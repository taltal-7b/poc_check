# アーキテクチャ

## 全体像

- Ruby on Rails ベースの MVC 構成。
- `app/controllers/` が HTTP の入口、`app/models/` がドメイン/永続化、`app/views/` が HTML/API 表現、`lib/` が共通部品・拡張機構。

## リクエスト処理（概略）

- ルーティング定義: `config/routes.rb`
- 認証/セッション/ローカライズ等の横断前処理: `ApplicationController` の `before_action`
- 権限: `authorize` / `allowed_to?` 系でチェックされ、プロジェクト文脈（所属・ロール）により判定

## 初期化と設定

- `config/application.rb` / `config/environment.rb`
- `config/initializers/*` でフレームワーク・拡張・パッチ適用・ロード制御
- デフォルト設定キー: `config/settings.yml`（DB側で上書きされる前提のキーも含む）

## 表示層

- レイアウト: `app/views/layouts/`
- 主要画面テンプレ: `app/views/**`
- 静的アセット: `public/stylesheets/`, `public/javascripts/`, `public/themes/`

## 非同期処理

- `app/jobs/` に ActiveJob ベースのジョブが存在（例: プロジェクト削除系）

## メール

- 送信: `Mailer`（イベントごとの deliver_* API）
- 受信（取り込み）: `MailHandler` + `MailHandlerController`（APIキー等で保護）

## 拡張

- `lib/**/hook` などに view hook / listener の仕組みがあり、core側が拡張ポイントを提供

