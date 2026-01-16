# メール通知機能のセットアップ

## 概要

メール通知機能が実装されました。課題の作成、更新、コメント追加時に、ウォッチャーや関係者にメール通知が送信されます。

## 機能

- **課題作成時の通知**: 新しい課題が作成されると、ウォッチャー、プロジェクトメンバー（メール通知有効）、担当者に通知が送信されます
- **課題更新時の通知**: 課題が更新されると、関係者に通知が送信されます
- **コメント追加時の通知**: 課題にコメントが追加されると、関係者に通知が送信されます

## 通知対象者

以下のユーザーが通知を受け取ります：

1. **ウォッチャー**: 課題をウォッチしているユーザー
2. **作成者**: 課題の作成者（自分自身は除外）
3. **担当者**: 課題の担当者（自分自身は除外）
4. **プロジェクトメンバー**: プロジェクトのメンバーで、メール通知が有効なユーザー

## SMTP設定

メール送信にはSMTPサーバーの設定が必要です。`docker-compose.yml`に環境変数を設定してください。

### 環境変数

- `SMTP_HOST`: SMTPサーバーのホスト名（例: `smtp.gmail.com`）
- `SMTP_PORT`: SMTPサーバーのポート（例: `587`）
- `SMTP_SECURE`: SSL/TLSを使用するか（`true` または `false`）
- `SMTP_USER`: SMTP認証のユーザー名
- `SMTP_PASS`: SMTP認証のパスワード
- `SMTP_FROM`: 送信元メールアドレス（デフォルト: `noreply@example.com`）

### 設定例

#### Gmailを使用する場合

```yaml
SMTP_HOST: smtp.gmail.com
SMTP_PORT: 587
SMTP_SECURE: false
SMTP_USER: your-email@gmail.com
SMTP_PASS: your-app-password  # Gmailのアプリパスワードを使用
SMTP_FROM: your-email@gmail.com
```

**注意**: Gmailを使用する場合は、アプリパスワードを生成する必要があります。通常のパスワードでは動作しません。

#### Mailtrapを使用する場合（開発・テスト用）

1. [Mailtrap](https://mailtrap.io/)に無料アカウントを作成
2. **ダッシュボードで「Sandboxes」を選択**
   - 左サイドバーの「Transactional」セクション内の「**Sandboxes**」をクリック
   - または、メインコンテンツエリア下部の「**Email Sandbox**」セクションからアクセス
3. **「My Inbox」またはデフォルトのSandboxを選択**
   - Sandbox一覧から「My Inbox」を選択
4. **「SMTP Settings」タブを開く**
   - Sandboxの詳細ページで「SMTP Settings」タブを選択
   - または、Sandboxカードの「Show Credentials」をクリック
5. **接続情報を取得**
   - `Host`: `sandbox.smtp.mailtrap.io`
   - `Port`: `2525`
   - `Username`: 表示されているユーザー名
   - `Password`: 表示されているパスワード
6. `docker-compose.yml`の`backend`サービスの環境変数に設定：

```yaml
SMTP_HOST: sandbox.smtp.mailtrap.io
SMTP_PORT: 2525
SMTP_SECURE: false
SMTP_USER: your-mailtrap-username  # Mailtrapから取得
SMTP_PASS: your-mailtrap-password  # Mailtrapから取得
SMTP_FROM: noreply@example.com  # 任意のドメインでOK
```

**送信元ドメイン（SMTP_FROM）の候補：**
- `noreply@example.com` - 一般的な通知用（推奨）
- `notifications@example.com` - 通知専用
- `noreply@test.com` - テスト用
- `project-manager@example.com` - プロジェクト管理システム用
- `system@example.com` - システム通知用

**注意**: Mailtrapは開発・テスト用のサービスなので、実際のメールは送信されません。そのため、`SMTP_FROM`には任意のドメインを指定できます（実際のドメインの所有権確認などは不要です）。

**メールの確認方法：**
- Sandboxを選択すると、受信したメールの一覧が表示されます
- メールをクリックすると、内容、HTML、テキスト版、ヘッダー情報などを確認できます

#### 環境変数ファイル（.env）を使用する場合

プロジェクトルートに`.env`ファイルを作成し、以下のように設定できます：

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

その後、`docker-compose.yml`で環境変数を読み込むように設定してください。

## 動作確認

1. SMTP設定を完了します
2. バックエンドを再起動します: `docker-compose restart backend`
3. 課題を作成、更新、またはコメントを追加します
4. 通知対象者のメールボックスを確認します

## トラブルシューティング

### メールが送信されない

1. **SMTP設定を確認**: 環境変数が正しく設定されているか確認してください
2. **ログを確認**: バックエンドのログに `[Email]` で始まるメッセージを確認してください
3. **SMTP接続を確認**: `verifyEmailConfig()` 関数を使用してSMTP接続をテストできます

### 開発環境でのテスト

開発環境では、実際のメールを送信せずにテストしたい場合、以下の方法があります：

1. **Mailtrapを使用**: メールを実際に送信せずに、Mailtrapのダッシュボードで確認できます
2. **SMTP設定を空にする**: SMTP設定を空にすると、メール送信はスキップされます（ログに警告が表示されます）

## 実装ファイル

- `backend/src/utils/email.util.ts`: メール送信ユーティリティ
- `backend/src/services/notification.service.ts`: 通知サービス
- `backend/src/controllers/issue.controller.ts`: 課題作成・更新時の通知
- `backend/src/controllers/journal.controller.ts`: コメント追加時の通知
