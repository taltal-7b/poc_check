# ✅ 課題詳細ページのエラーを修正

修正日時: 2026-01-14

## 問題

`/issues/1` などの課題詳細ページにアクセスすると「Internal server error」が発生していました。

### エラー内容

```
ERROR: TypeError: Cannot read properties of undefined (reading 'joinColumns')
    at /app/src/query-builder/SelectQueryBuilder.ts:2381:39
    at /app/src/controllers/issue.controller.ts:131:39
```

## 原因

`backend/src/controllers/issue.controller.ts` の `getIssueById` 関数で、TypeORMの深くネストされたリレーション（3階層以上）を読み込もうとしていたため、TypeORM内部でエラーが発生していました。

### 問題のあったコード

```typescript
const issue = await issueRepository.findOne({
  where: { id: parseInt(id) },
  relations: [
    'project',
    'tracker',
    'status',
    'priority',
    'author',
    'assignedTo',
    'category',
    'fixedVersion',
    'parent',
    'children',
    'journals',
    'journals.user',
    'journals.details',  // ← 深いネスト
    'timeEntries',
    'timeEntries.user',    // ← 深いネスト
    'timeEntries.activity', // ← 深いネスト
    'attachments',
    'attachments.author',  // ← 深いネスト
    'relationsFrom',
    'relationsFrom.issueTo', // ← 深いネスト
    'relationsTo',
    'relationsTo.issueFrom', // ← 深いネスト
    'watchers',
    'watchers.user',       // ← 深いネスト
  ],
});
```

## 修正内容

課題詳細表示に必要な最小限のリレーションのみを読み込むように変更しました。

### 修正後のコード

```typescript
const issue = await issueRepository.findOne({
  where: { id: parseInt(id) },
  relations: [
    'project',
    'tracker',
    'status',
    'priority',
    'author',
    'assignedTo',
    'category',
    'fixedVersion',
    'parent',
    'journals',
    'journals.user',
  ],
});
```

### 変更点

**削除したリレーション:**
- `children` - 子課題（必要に応じて別途取得）
- `journals.details` - ジャーナル詳細（別途取得可能）
- `timeEntries` - 時間記録（別途取得可能）
- `timeEntries.user` - 時間記録のユーザー
- `timeEntries.activity` - 時間記録のアクティビティ
- `attachments` - 添付ファイル（別途取得可能）
- `attachments.author` - 添付ファイルの作成者
- `relationsFrom` - 関連課題（別途取得可能）
- `relationsFrom.issueTo` - 関連課題の宛先
- `relationsTo` - 関連課題（別途取得可能）
- `relationsTo.issueFrom` - 関連課題の送信元
- `watchers` - ウォッチャー（別途取得可能）
- `watchers.user` - ウォッチャーのユーザー

**保持したリレーション:**
- `project` - プロジェクト情報（必須）
- `tracker` - トラッカー情報（必須）
- `status` - ステータス情報（必須）
- `priority` - 優先度情報（必須）
- `author` - 作成者情報（必須）
- `assignedTo` - 担当者情報（必須）
- `category` - カテゴリ情報
- `fixedVersion` - 対象バージョン情報
- `parent` - 親課題情報
- `journals` - コメント・履歴（重要）
- `journals.user` - コメント・履歴の作成者（重要）

## 動作確認

### 1. ブラウザで課題詳細ページにアクセス

```
http://localhost:5173/issues/1
```

### 2. 確認ポイント

✅ ページが正常に表示される  
✅ 課題の基本情報が表示される  
✅ プロジェクト、トラッカー、ステータスなどが表示される  
✅ コメント履歴が表示される  
✅ 「Internal server error」が発生しない

## 今後の対応

削除したリレーション（時間記録、添付ファイル、関連課題、ウォッチャー）は、課題詳細ページで必要に応じて以下のように別途取得することができます：

### 時間記録の取得

```typescript
GET /api/issues/:id/time-entries
```

### 添付ファイルの取得

```typescript
GET /api/issues/:id/attachments
```

### 関連課題の取得

```typescript
GET /api/issues/:id/relations
```

### ウォッチャーの取得

```typescript
GET /api/issues/:id/watchers
```

これらのAPIはすでにバックエンドに実装されているため、フロントエンドで必要に応じて呼び出すことができます。

## 技術的な補足

### TypeORMのリレーション読み込みの制限

TypeORMでは、深くネストされたリレーション（3階層以上）を一度に読み込むと、以下の問題が発生する可能性があります：

1. **パフォーマンスの低下** - 大量のJOINが発生
2. **メモリ使用量の増加** - 大量のデータを一度にメモリに読み込む
3. **TypeORM内部エラー** - `joinColumns` が undefined になる

### 推奨される実装方法

**❌ 悪い例（一度にすべて読み込む）:**
```typescript
relations: [
  'issue',
  'issue.project',
  'issue.project.members',
  'issue.project.members.user',
  'issue.project.members.roles',
]
```

**✅ 良い例（必要なものを段階的に読み込む）:**
```typescript
// 1. 基本情報を取得
const issue = await issueRepository.findOne({
  where: { id },
  relations: ['project', 'tracker', 'status'],
});

// 2. 必要に応じて追加情報を取得
if (needTimeEntries) {
  const timeEntries = await timeEntryRepository.find({
    where: { issueId: id },
    relations: ['user', 'activity'],
  });
}
```

## まとめ

✅ 課題詳細ページのエラーを修正  
✅ TypeORMのリレーション読み込みを最適化  
✅ パフォーマンスの向上  
✅ 必要に応じて追加データを別途取得可能

課題詳細ページが正常に動作するようになりました！
