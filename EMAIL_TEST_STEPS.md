# メール通知テスト手順

## 現在の設定

- **SMTP Host**: `sandbox.smtp.mailtrap.io`
- **SMTP Port**: `2525`
- **SMTP User**: `dcf048baac6763`
- **SMTP Pass**: `44a4aa0411dba9`
- **SMTP From**: `noreply@example.com`

## テスト手順

### 1. バックエンドログの監視

新しいターミナルで以下を実行して、バックエンドのログをリアルタイムで監視します：

```bash
docker-compose logs -f backend | Select-String -Pattern "Email|Notification|SMTP"
```

### 2. Mailtrapダッシュボードを開く

1. [Mailtrap](https://mailtrap.io/)にログイン
2. 左サイドバーの「**Sandboxes**」をクリック
3. 「**My Inbox**」を選択
4. メールが受信されるのを待ちます

### 3. テストケース

#### テスト1: 課題作成時の通知

1. ブラウザで `http://localhost:5173` にアクセス
2. ログイン（Admin User または 山田たろう）
3. プロジェクトを選択または作成
4. プロジェクトの「メンバー」タブで、メール通知を受け取りたいユーザーを追加
   - メンバー追加時に「メール通知」を有効にする（`mailNotification: true`）
5. 「課題」ページに移動
6. 新しい課題を作成
7. バックエンドログで以下を確認：
   - `[Notification] Sending issue created notification for issue #X`
   - `[Email] Email sent successfully:`
8. Mailtrapダッシュボードでメールを確認

#### テスト2: 課題更新時の通知

1. 既存の課題を開く
2. 課題の内容を更新（タイトル、説明、ステータスなど）
3. 「保存」をクリック
4. バックエンドログで以下を確認：
   - `[Notification] Sending issue updated notification for issue #X`
   - `[Email] Email sent successfully:`
5. Mailtrapダッシュボードでメールを確認

#### テスト3: コメント追加時の通知

1. 課題詳細ページを開く
2. 「コメント」セクションでコメントを追加
3. 「送信」をクリック
4. バックエンドログで以下を確認：
   - `[Notification] Sending comment added notification for issue #X`
   - `[Email] Email sent successfully:`
5. Mailtrapダッシュボードでメールを確認

### 4. 確認ポイント

#### バックエンドログで確認すべき内容

- ✅ `[Email] SMTP transporter initialized:` - SMTP設定が正しく初期化された
- ✅ `[Notification] Sending issue created notification for issue #X` - 通知送信開始
- ✅ `[Email] Email sent successfully:` - メール送信成功
- ✅ `[Notification] Issue created notification sent to X recipients` - 通知送信完了

#### Mailtrapで確認すべき内容

- ✅ メールが受信されている
- ✅ 送信者: `noreply@example.com`
- ✅ 件名が正しい（例: `[プロジェクト名] 新しい課題: #1 - 課題タイトル`）
- ✅ メール本文が日本語で正しく表示されている
- ✅ 課題へのリンクが正しく機能する

### 5. トラブルシューティング

#### メールが送信されない場合

1. **SMTP設定の確認**
   ```bash
   docker-compose exec backend env | Select-String -Pattern "SMTP"
   ```

2. **バックエンドログでエラーを確認**
   - `[Email] No SMTP credentials configured` - SMTP設定が不足
   - `[Email] Failed to create transporter` - SMTP設定エラー
   - `[Email] Failed to send email` - メール送信エラー

3. **通知対象者の確認**
   - `[Notification] No recipients for issue created notification` - 通知対象者がいない
   - プロジェクトメンバーのメール通知が有効か確認
   - ユーザーにメールアドレスが設定されているか確認

#### メールは送信されるが受信されない場合

1. **Mailtrapの設定を確認**
   - 正しいSandboxを選択しているか
   - SMTP認証情報が正しいか

2. **メールアドレスの確認**
   - ユーザーのメールアドレスが正しく設定されているか
   - メールアドレスが有効な形式か

### 6. 期待される動作

- ✅ 課題作成時に、ウォッチャー、作成者、担当者、プロジェクトメンバー（メール通知有効）にメールが送信される
- ✅ 課題更新時に、関係者にメールが送信される
- ✅ コメント追加時に、関係者にメールが送信される
- ✅ メール本文は日本語で表示される
- ✅ メールには課題へのリンクが含まれる
- ✅ 自分が行った操作については、自分にはメールが送信されない（自己通知除外）

## 次のステップ

テストが成功したら、本番環境用のSMTP設定（Gmail、SendGrid、AWS SESなど）に切り替えることができます。
