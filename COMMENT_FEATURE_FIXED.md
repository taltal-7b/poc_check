# ✅ コメント追加機能のエラーを修正

修正日時: 2026-01-14

## 問題

課題詳細ページでコメントを追加しようとすると「コメントの追加に失敗しました」というエラーが発生していました。

### エラー内容

```
ERROR: code: '23502'
detail: 'Failing row contains (3, null, null, 1, あ, 2026-01-14 06:33:10.082, f, null, null).'
schema: 'public'
table: 'journals'
column: 'journalized_id'
```

データベースの NOT NULL 制約違反で、`journals` テーブルの `journalized_id` カラムが NULL になっていました。

## 原因

`Journal` エンティティには `journalizedId` と `journalizedType` というカラムがありますが、コントローラーでは存在しない `issueId` プロパティを設定していました。

### Journalエンティティの構造

```typescript
@Entity('journals')
export class Journal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'journalized_id' })
  journalizedId: number;  // ← 課題のID

  @Column({ name: 'journalized_type', length: 30 })
  journalizedType: string;  // ← 'Issue' という文字列

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // ...
}
```

これは、Redmineのポリモーフィックな設計を踏襲したもので、`journals` テーブルは課題以外のオブジェクト（Wiki、プロジェクトなど）にも対応できるようになっています。

### 問題のあったコード

```typescript
const journal = journalRepository.create({
  issueId: parseInt(issueId),  // ← エンティティに issueId プロパティは存在しない
  userId: req.user!.id,
  notes,
  privateNotes,
  createdOn: new Date(),
});
```

## 修正内容

コントローラーで正しいプロパティ名（`journalizedId` と `journalizedType`）を使用するように修正しました。

### 1. コメント追加（addJournalEntry）

**修正前:**
```typescript
const journal = journalRepository.create({
  issueId: parseInt(issueId),
  userId: req.user!.id,
  notes,
  privateNotes,
  createdOn: new Date(),
});
```

**修正後:**
```typescript
const journal = journalRepository.create({
  journalizedId: parseInt(issueId),
  journalizedType: 'Issue',
  userId: req.user!.id,
  notes,
  privateNotes,
  createdOn: new Date(),
});
```

### 2. コメント取得（getIssueJournals）

**修正前:**
```typescript
const journals = await journalRepository.find({
  where: { issueId: parseInt(issueId) },
  relations: ['user', 'details'],
  order: { createdOn: 'ASC' },
});
```

**修正後:**
```typescript
const journals = await journalRepository.find({
  where: { 
    journalizedId: parseInt(issueId),
    journalizedType: 'Issue'
  },
  relations: ['user', 'details'],
  order: { createdOn: 'ASC' },
});
```

### 3. コメント更新（updateJournalEntry）

**修正前:**
```typescript
const journal = await journalRepository.findOne({
  where: { id: parseInt(journalId), issueId: parseInt(issueId) },
});
```

**修正後:**
```typescript
const journal = await journalRepository.findOne({
  where: { 
    id: parseInt(journalId), 
    journalizedId: parseInt(issueId),
    journalizedType: 'Issue'
  },
});
```

### 4. コメント削除（deleteJournalEntry）

同様に修正しました。

## 動作確認

### 1. 課題詳細ページにアクセス

```
http://localhost:5173/issues/1
```

### 2. コメントを追加

1. ページ下部の「コメント」セクションまでスクロール
2. テキストエリアにコメントを入力（例: "テストコメント"）
3. 「コメントを追加」ボタンをクリック
4. ✅ コメントが追加される
5. ✅ コメント一覧に表示される
6. ✅ エラーが発生しない

### 3. 既存のコメント確認

課題にコメントがある場合、以下が表示されます：
- コメント作成者の名前
- コメント内容
- 作成日時

## 技術的な補足

### ポリモーフィック関連とは

Redmineでは、`journals` テーブルは複数の異なるタイプのオブジェクトに対するコメント・履歴を格納します：

- **Issue** - 課題のコメント・変更履歴
- **Wiki** - Wikiページの変更履歴
- **News** - ニュースのコメント
- **Message** - フォーラムメッセージ

このため、以下の2つのカラムを使用します：

1. `journalized_id` - 対象オブジェクトのID
2. `journalized_type` - 対象オブジェクトのタイプ（'Issue', 'Wiki' など）

### TypeORMでの実装

TypeORMは標準でポリモーフィック関連をサポートしていないため、手動でこれらのカラムを管理する必要があります。

```typescript
// コメント追加時
journal.journalizedId = issueId;
journal.journalizedType = 'Issue';

// コメント検索時
where: {
  journalizedId: issueId,
  journalizedType: 'Issue'
}
```

## まとめ

✅ コメント追加機能のエラーを修正  
✅ `journalizedId` と `journalizedType` を正しく設定  
✅ コメントの取得・更新・削除も修正  
✅ コメント機能が正常に動作するようになりました

課題にコメントを追加できるようになりました！🎉
