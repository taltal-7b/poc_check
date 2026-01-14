# ✅ 重複ロールの修正完了

修正日時: 2026-01-14

## 問題

メンバー追加モーダルのロール選択で、「管理者」「開発者」「報告者」が2回ずつ表示されていました。

### 原因

シードスクリプト (`backend/src/seeds/initial-data.ts`) が複数回実行されたため、ロールが重複して登録されていました。

### 重複していたロール

| ID | 名前 | 状態 |
|----|------|------|
| 1 | 管理者 | ✅ 保持 |
| 2 | 開発者 | ✅ 保持 |
| 3 | 報告者 | ✅ 保持 |
| 4 | 管理者 | ❌ 削除 |
| 5 | 開発者 | ❌ 削除 |
| 6 | 報告者 | ❌ 削除 |

## 修正内容

### 1. 重複ロールの削除

データベースから ID 4, 5, 6 のロールを削除しました。

```sql
DELETE FROM roles WHERE id IN (4, 5, 6);
```

### 2. 確認結果

削除後、ロールは以下の3つのみになりました：

```json
[
  { "id": 1, "name": "管理者" },
  { "id": 2, "name": "開発者" },
  { "id": 3, "name": "報告者" }
]
```

## 今後の対策

### シードスクリプトの改善案

重複実行を防ぐために、シードスクリプトにチェックロジックを追加することを推奨：

```typescript
// backend/src/seeds/initial-data.ts
export async function seedInitialData() {
  console.log('Starting database seeding...');

  try {
    // 1. Create default roles (重複チェック付き)
    console.log('Creating default roles...');
    const roleRepository = AppDataSource.getRepository(Role);

    // 既存のロールを確認
    const existingRoles = await roleRepository.find();
    if (existingRoles.length > 0) {
      console.log('Roles already exist, skipping role creation');
    } else {
      const adminRole = roleRepository.create({
        name: '管理者',
        // ... 省略
      });
      // ... 以下同様
      await roleRepository.save([adminRole, developerRole, reporterRole]);
      console.log('Roles created successfully');
    }

    // 他のシード処理も同様にチェックを追加
    // ...
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}
```

## 動作確認

### 1. ブラウザをリロード

```
Ctrl + Shift + R
```

### 2. メンバー追加モーダルを開く

1. プロジェクト詳細ページにアクセス
2. 「メンバー」タブをクリック
3. 「メンバーを追加」ボタンをクリック
4. ロール選択欄を確認

### 3. 確認ポイント

✅ 「管理者」「開発者」「報告者」が1回ずつしか表示されない  
✅ すべてのロールが正常に選択できる  
✅ メンバー追加が正常に機能する

## まとめ

✅ 重複したロールを削除  
✅ ロールは3つのみ（管理者、開発者、報告者）  
✅ メンバー追加モーダルで正常に表示されるようになりました

ブラウザをリロードして、メンバー追加モーダルを開いて確認してください！
