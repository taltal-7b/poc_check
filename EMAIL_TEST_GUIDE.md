# メール通知機能のテストガイド

## テスト方法

メール通知機能をテストするには、以下の手順に従ってください。

## 1. SMTP設定（開発環境用）

### オプションA: Mailtrapを使用（推奨 - 実際のメールを送信しない）

Mailtrapは開発環境用のメールテストサービスで、実際のメールを送信せずにメールの内容を確認できます。

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
6. `docker-compose.yml`または環境変数に設定：

```yaml
SMTP_HOST: sandbox.smtp.mailtrap.io
SMTP_PORT: 2525
SMTP_SECURE: false
SMTP_USER: your-mailtrap-username  # Mailtrapから取得
SMTP_PASS: your-mailtrap-password  # Mailtrapから取得
SMTP_FROM: noreply@example.com
```

**メールの確認方法：**
- Sandboxを選択すると、受信したメールの一覧が表示されます
- メールをクリックすると、内容、HTML、テキスト版、ヘッダー情報などを確認できます

### オプションB: Gmailを使用

1. Gmailアカウントで「アプリパスワード」を生成
   - Googleアカウント設定 → セキュリティ → 2段階認証プロセス → アプリパスワード
2. `docker-compose.yml`に設定：

```yaml
SMTP_HOST: smtp.gmail.com
SMTP_PORT: 587
SMTP_SECURE: false
SMTP_USER: your-email@gmail.com
SMTP_PASS: your-app-password
SMTP_FROM: your-email@gmail.com
```

### オプションC: ローカルSMTPサーバー（MailHogなど）

Docker ComposeにMailHogを追加して、ローカルでメールをテストできます。

## 2. 環境変数の設定

### 方法1: docker-compose.ymlに直接記述

`docker-compose.yml`の`backend`サービスの`environment`セクションに追加：

```yaml
SMTP_HOST: sandbox.smtp.mailtrap.io
SMTP_PORT: 2525
SMTP_SECURE: false
SMTP_USER: your-username
SMTP_PASS: your-password
SMTP_FROM: noreply@example.com
```

### 方法2: .envファイルを使用

プロジェクトルートに`.env`ファイルを作成：

```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASS=your-password
SMTP_FROM=noreply@example.com
```

`docker-compose.yml`で環境変数を読み込む：

```yaml
environment:
  SMTP_HOST: ${SMTP_HOST}
  SMTP_PORT: ${SMTP_PORT}
  # ... など
```

## 3. バックエンドの再起動

設定を変更した後、バックエンドを再起動：

```bash
docker-compose restart backend
```

## 4. テスト手順

### テスト1: 課題作成時の通知

1. プロジェクトにメンバーを追加（メール通知を有効にする）
2. 課題を作成
3. メールが送信されるか確認

### テスト2: 課題更新時の通知

1. 既存の課題を更新
2. ウォッチャーや関係者にメールが送信されるか確認

### テスト3: コメント追加時の通知

1. 課題にコメントを追加
2. 関係者にメールが送信されるか確認

## 5. ログの確認

### バックエンドログ

```bash
docker-compose logs -f backend
```

以下のログが表示されることを確認：

- `[Email] Email sent successfully:` - メール送信成功
- `[Notification] Issue created notification sent to X recipients` - 通知送信成功
- `[Email] Failed to send email:` - エラー（SMTP設定が間違っている可能性）

### フロントエンドコンソール

ブラウザの開発者ツールのコンソールで、エラーがないか確認してください。

## 6. トラブルシューティング

### メールが送信されない

1. **SMTP設定を確認**
   - 環境変数が正しく設定されているか
   - バックエンドを再起動したか

2. **ログを確認**
   - `[Email] Email transporter not available` - SMTP設定が不足
   - `[Email] Failed to send email` - SMTP接続エラー

3. **SMTP接続をテスト**
   - Mailtrapの場合、ダッシュボードでメールが受信されているか確認
   - Gmailの場合、アプリパスワードが正しいか確認

### 通知が送信されない

1. **通知対象者を確認**
   - ウォッチャーが設定されているか
   - プロジェクトメンバーのメール通知が有効か
   - ユーザーにメールアドレスが設定されているか

2. **ログを確認**
   - `[Notification] No recipients for issue created notification` - 通知対象者がいない

## 7. MailHogを使用したローカルテスト（オプション）

MailHogをDocker Composeに追加して、ローカルでメールをテストできます。

`docker-compose.yml`に追加：

```yaml
  mailhog:
    image: mailhog/mailhog:latest
    container_name: pm_mailhog
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI
```

設定：

```yaml
SMTP_HOST: mailhog
SMTP_PORT: 1025
SMTP_SECURE: false
SMTP_USER: 
SMTP_PASS: 
SMTP_FROM: noreply@example.com
```

Web UI: http://localhost:8025 でメールを確認できます。

## 8. テストチェックリスト

- [ ] SMTP設定が完了
- [ ] バックエンドが再起動済み
- [ ] ユーザーにメールアドレスが設定されている
- [ ] プロジェクトメンバーのメール通知が有効
- [ ] 課題作成時にメールが送信される
- [ ] 課題更新時にメールが送信される
- [ ] コメント追加時にメールが送信される
- [ ] メールの内容が正しい（日本語、リンクなど）
