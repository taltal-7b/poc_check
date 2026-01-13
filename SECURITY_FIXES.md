# セキュリティ修正レポート

## 📋 概要

Codexによるセキュリティレビューで指摘された11件の脆弱性をすべて修正しました。

---

## ✅ 修正完了（11/11項目）

### 🔴 重大（2件）

#### 1. 2FA回避の脆弱性 ✅
**問題:** 2FA有効ユーザーのログインが通常のアクセストークンと同じtempTokenを返し、2FA検証なしで保護APIにアクセス可能

**修正内容:**
- `generateTwoFactorToken()`を新規実装（5分間のみ有効、`twoFactorPending`フラグ付き）
- `authenticate`ミドルウェアで`twoFactorPending`トークンを拒否
- 2FA必須ユーザーは`twoFactorVerified`フラグ付きトークンのみ受理
- `verifyTwoFA`エンドポイントで一時トークンの検証を実装

**影響ファイル:**
- `backend/src/utils/jwt.util.ts`
- `backend/src/middleware/auth.middleware.ts`
- `backend/src/controllers/auth.controller.ts`

#### 2. 課題閲覧の認可欠如 ✅
**問題:** `GET /issues/:id`が認証のみで権限チェックがなく、ID推測で非プライベート課題を閲覧可能

**修正内容:**
- `canViewIssue`ミドルウェアを実装
- プロジェクトのpublic/private判定
- プロジェクトメンバーシップの確認
- `view_issues`権限のチェック
- プライベート課題の特別な権限チェック

**影響ファイル:**
- `backend/src/middleware/permission.middleware.ts`
- `backend/src/routes/issue.routes.ts`

---

### 🟡 高（3件）

#### 3. checkIssuePermissionが未定義 ✅
**問題:** ルートでインポートしているが実装が存在せず、ビルドエラー発生

**修正内容:**
- `checkIssuePermission`ミドルウェアを完全実装
- 課題作成時のプロジェクト権限チェック
- 課題更新/削除時の課題プロジェクトメンバーシップチェック
- 一括操作対応

**影響ファイル:**
- `backend/src/middleware/permission.middleware.ts`

#### 4. 時間入力の権限判定エラー ✅
**問題:** `checkProjectPermission`が`req.params.id`をプロジェクトIDとして扱うため、`/time-entries/:id`で誤判定

**修正内容:**
- `checkTimeEntryAccess`ミドルウェアを新規実装
- 作業時間のプロジェクトを取得してメンバーシップを確認
- 作成者本人または`edit_time_entries`権限を持つユーザーのみ編集可能
- 作業時間作成時に`log_time`権限をチェック

**影響ファイル:**
- `backend/src/routes/time-entry.routes.ts`
- `backend/src/controllers/time-entry.controller.ts`

#### 5. ユーザー情報の無制限公開 ✅
**問題:** ユーザー一覧/詳細がすべての認証ユーザーに公開され、メール等の個人情報が漏洩

**修正内容:**
- ユーザー一覧を管理者のみに制限
- ユーザー詳細は管理者または本人のみアクセス可能
- `checkUserAccess`ミドルウェアを実装
- 他人のメールアドレス等の機密情報を除外

**影響ファイル:**
- `backend/src/routes/user.routes.ts`
- `backend/src/controllers/user.controller.ts`

---

### 🟠 中（5件）

#### 6. プロジェクト作成権限の破綻 ✅
**問題:** `checkProjectPermission`で`add_project`を判定するが、projectIdがないため非管理者は作成不可

**修正内容:**
- プロジェクト作成を`checkGlobalPermission`に変更
- グローバルな`add_project`権限を持つユーザーが作成可能

**影響ファイル:**
- `backend/src/routes/project.routes.ts`

#### 7. 管理者専用APIの認証欠如 ✅
**問題:** `requireAdmin`の前に`authenticate`がないため`req.user`が未定義で拒否

**修正内容:**
- 管理者専用ルートに`authenticate`を追加
- 削除、アーカイブ、アンアーカイブエンドポイントを修正

**影響ファイル:**
- `backend/src/routes/project.routes.ts`

#### 8. 時間入力詳細のアクセス制御なし ✅
**問題:** `getTimeEntryById`に権限チェックがなく、他人の時間入力を取得可能

**修正内容:**
- `checkTimeEntryAccess`ミドルウェアを適用
- 作成者本人または編集権限を持つプロジェクトメンバーのみアクセス可能

**影響ファイル:**
- `backend/src/routes/time-entry.routes.ts`

#### 9. 2FAバックアップコード未実装 ✅
**問題:** 生成するだけで保存/検証がなく、実運用で使えない

**修正内容:**
- `User`エンティティに`twofaBackupCodes`カラム追加
- `hashBackupCodes()`と`verifyBackupCode()`を実装
- 2FA有効化時に10個のバックアップコードを生成・保存
- ログイン時にTOTP失敗時はバックアップコードを試行
- 使用済みコードを削除

**影響ファイル:**
- `backend/src/entities/User.ts`
- `backend/src/utils/twofa.util.ts`
- `backend/src/controllers/auth.controller.ts`

#### 10. JWT秘密鍵のデフォルト値 ✅
**問題:** 環境変数未設定時に既知の固定値を使用

**修正内容:**
- `JWT_SECRET`と`JWT_REFRESH_SECRET`が未設定の場合にエラーを投げる
- 本番環境では起動時に必須チェック
- デフォルト値を完全削除

**影響ファイル:**
- `backend/src/utils/jwt.util.ts`

---

### 🔵 低（1件）

#### 11. フロントエンドの存在しないAPI呼び出し ✅
**問題:** 課題の`time-entries`と`journals`エンドポイントがバックエンドに未実装

**修正内容:**
- `journal.controller.ts`を新規実装（CRUD操作）
- `/api/issues/:issueId/journals`エンドポイントを追加
- `/api/issues/:issueId/time-entries`エンドポイントを追加
- プライベートノートの権限チェックを実装

**影響ファイル:**
- `backend/src/controllers/journal.controller.ts`（新規）
- `backend/src/routes/issue.routes.ts`

---

## 📝 修正内容の詳細

### JWT認証の強化

```typescript
// Before: 2FA有効時でも通常トークン発行
const tempToken = generateAccessToken(user.id);

// After: 専用の一時トークン（5分間のみ有効）
const tempToken = generateTwoFactorToken(user.id);
```

```typescript
// トークンに2FA状態を含める
export const generateAccessToken = (
  userId: number, 
  twoFactorVerified: boolean = false
): string => {
  return jwt.sign({ userId, twoFactorVerified }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};
```

### 権限チェックの追加

```typescript
// Before: 認証のみ
router.get('/:id', authenticate, getIssueById);

// After: 課題閲覧権限チェック
router.get('/:id', authenticate, canViewIssue, getIssueById);
```

### 2FAバックアップコード

```typescript
// 有効化時にバックアップコードを生成
const backupCodes = generateBackupCodes(10);
const hashedCodes = await hashBackupCodes(backupCodes);
user.twofaBackupCodes = JSON.stringify(hashedCodes);

// ログイン時にTOTP失敗時はバックアップコードを試行
if (!isValid && user.twofaBackupCodes) {
  const codeIndex = await verifyBackupCode(token, hashedCodes);
  if (codeIndex >= 0) {
    isValid = true;
    hashedCodes.splice(codeIndex, 1); // 使用済みコードを削除
  }
}
```

---

## 🛡️ セキュリティ強化の結果

### Before
- ❌ 2FA回避可能
- ❌ 課題の無制限閲覧
- ❌ ユーザー情報の漏洩
- ❌ 時間入力の不正アクセス
- ❌ JWT秘密鍵の脆弱性

### After
- ✅ 2FA必須ユーザーは完全な2要素認証
- ✅ 課題閲覧は権限ベース
- ✅ ユーザー情報は制限付きアクセス
- ✅ 時間入力は作成者または権限保持者のみ
- ✅ JWT秘密鍵は必須設定

---

## 🧪 テスト推奨項目

1. **2FA認証フロー**
   - 一時トークンでの保護API拒否を確認
   - 2FA検証後の正常アクセスを確認
   - バックアップコードでのログインを確認

2. **課題閲覧権限**
   - 非メンバーが非公開プロジェクトの課題を閲覧できないことを確認
   - プライベート課題の制限を確認

3. **ユーザー情報保護**
   - 非管理者がユーザー一覧を取得できないことを確認
   - 他人の詳細情報が取得できないことを確認

4. **時間入力権限**
   - 他人の時間入力を編集できないことを確認
   - プロジェクトメンバーのみが時間入力できることを確認

5. **JWT秘密鍵**
   - 環境変数未設定時に起動エラーになることを確認

---

## 📚 追加ドキュメント

### 環境変数の必須化

以下の環境変数は必須です（`.env.example`を更新済み）:

```env
JWT_SECRET=your-strong-secret-key-change-this
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this
```

### 2FAバックアップコード

2FA有効化時にユーザーに表示されるバックアップコードを必ず保存してください:

```json
{
  "status": "success",
  "message": "2FAが有効化されました",
  "data": {
    "backupCodes": [
      "ABC123XY",
      "DEF456ZW",
      ...
    ]
  }
}
```

---

## ✅ 結論

**全11件の脆弱性を修正完了しました。**

- 重大な脆弱性（2件）: ✅ 修正完了
- 高優先度（3件）: ✅ 修正完了
- 中優先度（5件）: ✅ 修正完了
- 低優先度（1件）: ✅ 修正完了

システムのセキュリティレベルが大幅に向上しました。本番環境への展開前に、上記のテスト項目を必ず実施してください。
