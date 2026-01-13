# API リファレンス

## 📝 概要

このドキュメントはPhase 2で実装されたすべてのAPIエンドポイントのリファレンスです。

**ベースURL**: `http://localhost:3000/api`

---

## 🔐 認証

すべてのAPIは`Authorization`ヘッダーにJWTトークンが必要です（一部公開エンドポイントを除く）。

```
Authorization: Bearer <JWT_TOKEN>
```

---

## 1. 認証 API

### POST /api/auth/register
ユーザー登録

**Request:**
```json
{
  "login": "testuser",
  "email": "test@example.com",
  "firstname": "太郎",
  "lastname": "山田",
  "password": "password123"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "ユーザーを登録しました",
  "data": {
    "user": { "id": 1, "login": "testuser", ... }
  }
}
```

### POST /api/auth/login
ログイン

**Request:**
```json
{
  "login": "testuser",
  "password": "password123"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "ログインしました",
  "data": {
    "user": { ... },
    "token": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

---

## 2. ユーザー管理 API

### GET /api/users
ユーザー一覧取得

**Query Parameters:**
- `page` (number): ページ番号
- `limit` (number): 1ページあたりの件数
- `search` (string): 検索キーワード
- `status` (string): ステータスフィルタ
- `admin` (boolean): 管理者フィルタ

**Response:**
```json
{
  "status": "success",
  "data": {
    "users": [...],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 100,
      "pages": 4
    }
  }
}
```

### GET /api/users/:id
ユーザー詳細取得

### POST /api/users
ユーザー作成（管理者のみ）

**Request:**
```json
{
  "login": "newuser",
  "email": "new@example.com",
  "firstname": "花子",
  "lastname": "田中",
  "password": "password123",
  "admin": false
}
```

### PUT /api/users/:id
ユーザー更新

### DELETE /api/users/:id
ユーザー削除（ステータス変更）

### PUT /api/users/:id/lock
ユーザーロック

### PUT /api/users/:id/unlock
ユーザーアンロック

---

## 3. ロール管理 API

### GET /api/roles
ロール一覧取得

**Response:**
```json
{
  "status": "success",
  "data": {
    "roles": [
      {
        "id": 1,
        "name": "管理者",
        "isBuiltin": true,
        "permissions": ["add_project", "edit_project", ...]
      }
    ]
  }
}
```

### POST /api/roles
ロール作成

**Request:**
```json
{
  "name": "カスタムロール",
  "permissions": ["view_issues", "add_issues"],
  "isAssignable": true
}
```

---

## 4. グループ管理 API

### GET /api/groups
グループ一覧取得

### POST /api/groups
グループ作成

**Request:**
```json
{
  "name": "開発チーム",
  "userIds": [1, 2, 3]
}
```

### POST /api/groups/:id/users
グループにユーザー追加

**Request:**
```json
{
  "userId": 4
}
```

---

## 5. プロジェクト管理 API

### GET /api/projects
プロジェクト一覧取得

**Query Parameters:**
- `page` (number): ページ番号
- `limit` (number): 1ページあたりの件数
- `search` (string): 検索キーワード
- `status` (number): ステータスフィルタ

**Response:**
```json
{
  "status": "success",
  "data": {
    "projects": [
      {
        "id": 1,
        "name": "サンプルプロジェクト",
        "identifier": "sample",
        "description": "...",
        "status": 1,
        "isPublic": true,
        "author": { ... },
        "members": [...],
        "trackers": [...]
      }
    ],
    "pagination": { ... }
  }
}
```

### GET /api/projects/:id
プロジェクト詳細取得

### POST /api/projects
プロジェクト作成

**Request:**
```json
{
  "name": "新規プロジェクト",
  "identifier": "newproject",
  "description": "プロジェクトの説明",
  "isPublic": true,
  "parentId": null,
  "trackerIds": [1, 2],
  "moduleNames": ["issue_tracking", "time_tracking"]
}
```

### PUT /api/projects/:id
プロジェクト更新

### DELETE /api/projects/:id
プロジェクト削除

---

## 6. メンバー管理 API

### GET /api/projects/:projectId/members
プロジェクトメンバー一覧

**Response:**
```json
{
  "status": "success",
  "data": {
    "members": [
      {
        "id": 1,
        "user": { ... },
        "roles": [
          { "id": 1, "name": "管理者" }
        ]
      }
    ]
  }
}
```

### POST /api/projects/:projectId/members
メンバー追加

**Request:**
```json
{
  "userId": 2,
  "roleIds": [2, 3]
}
```

### PUT /api/projects/:projectId/members/:memberId
メンバーロール更新

**Request:**
```json
{
  "roleIds": [1, 2]
}
```

### DELETE /api/projects/:projectId/members/:memberId
メンバー削除

---

## 7. 課題管理 API

### GET /api/issues
課題一覧取得

**Query Parameters:**
- `page` (number): ページ番号
- `limit` (number): 1ページあたりの件数
- `search` (string): 検索キーワード
- `projectId` (number): プロジェクトフィルタ
- `statusId` (number): ステータスフィルタ
- `trackerId` (number): トラッカーフィルタ
- `priorityId` (number): 優先度フィルタ
- `assignedToId` (number): 担当者フィルタ
- `authorId` (number): 作成者フィルタ

**Response:**
```json
{
  "status": "success",
  "data": {
    "issues": [
      {
        "id": 1,
        "subject": "バグ修正",
        "description": "...",
        "project": { ... },
        "tracker": { ... },
        "status": { ... },
        "priority": { ... },
        "author": { ... },
        "assignedTo": { ... }
      }
    ],
    "pagination": { ... }
  }
}
```

### GET /api/issues/:id
課題詳細取得

**Response:**
```json
{
  "status": "success",
  "data": {
    "issue": {
      "id": 1,
      "subject": "...",
      "journals": [...],
      "timeEntries": [...],
      "attachments": [...],
      "relationsFrom": [...],
      "relationsTo": [...],
      "watchers": [...]
    }
  }
}
```

### POST /api/issues
課題作成

**Request:**
```json
{
  "projectId": 1,
  "trackerId": 1,
  "subject": "新しい課題",
  "description": "詳細説明",
  "statusId": 1,
  "priorityId": 2,
  "assignedToId": 3,
  "startDate": "2026-01-01",
  "dueDate": "2026-01-31",
  "estimatedHours": 10.5,
  "isPrivate": false
}
```

### PUT /api/issues/:id
課題更新

### DELETE /api/issues/:id
課題削除

### POST /api/issues/:id/copy
課題コピー

**Request:**
```json
{
  "projectId": 2,
  "copyWatchers": true,
  "copyAttachments": false
}
```

### PUT /api/issues/bulk
課題一括更新

**Request:**
```json
{
  "issueIds": [1, 2, 3],
  "updates": {
    "statusId": 2,
    "priorityId": 3,
    "assignedToId": 4
  }
}
```

---

## 8. 課題関連 API

### GET /api/issues/:issueId/relations
課題関連一覧取得

**Response:**
```json
{
  "status": "success",
  "data": {
    "relationsFrom": [
      {
        "id": 1,
        "relationType": "blocks",
        "issueTo": { ... }
      }
    ],
    "relationsTo": [...]
  }
}
```

### POST /api/issues/:issueId/relations
課題関連作成

**Request:**
```json
{
  "issueToId": 5,
  "relationType": "relates",
  "delay": null
}
```

**リレーションタイプ:**
- `relates`: 関連する
- `duplicates`: 重複する
- `duplicated`: 重複される
- `blocks`: ブロックする
- `blocked`: ブロックされる
- `precedes`: 先行する
- `follows`: 後続する
- `copied_to`: コピー先
- `copied_from`: コピー元

### DELETE /api/issues/:issueId/relations/:relationId
課題関連削除

---

## 9. ウォッチャー API

### GET /api/issues/:issueId/watchers
ウォッチャー一覧取得

### POST /api/issues/:issueId/watchers
ウォッチャー追加（管理者用）

**Request:**
```json
{
  "userId": 3
}
```

### DELETE /api/issues/:issueId/watchers/:userId
ウォッチャー削除

### POST /api/issues/:issueId/watch
自分でウォッチ

### DELETE /api/issues/:issueId/watch
自分でアンウォッチ

---

## 10. ワークフロー API

### GET /api/workflows
ワークフロールール一覧取得

**Query Parameters:**
- `roleId` (number): ロールフィルタ
- `trackerId` (number): トラッカーフィルタ

**Response:**
```json
{
  "status": "success",
  "data": {
    "rules": [
      {
        "id": 1,
        "role": { ... },
        "tracker": { ... },
        "oldStatus": { ... },
        "newStatus": { ... },
        "author": false,
        "assignee": true,
        "fieldPermissions": "{...}"
      }
    ]
  }
}
```

### POST /api/workflows
ワークフロールール作成

**Request:**
```json
{
  "roleId": 1,
  "trackerId": 1,
  "oldStatusId": 1,
  "newStatusId": 2,
  "author": false,
  "assignee": true,
  "fieldPermissions": "{\"subject\": \"readonly\"}"
}
```

### POST /api/workflows/copy
ワークフロールールコピー

**Request:**
```json
{
  "sourceTrackerId": 1,
  "targetTrackerId": 2,
  "sourceRoleId": null,
  "targetRoleId": null
}
```

### POST /api/workflows/check-transition
ステータス遷移チェック

**Request:**
```json
{
  "issueId": 1,
  "newStatusId": 3
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "allowed": true,
    "reason": "担当者として許可"
  }
}
```

---

## 11. 時間管理 API

### GET /api/time-entries
作業時間一覧取得

**Query Parameters:**
- `page` (number): ページ番号
- `limit` (number): 1ページあたりの件数
- `projectId` (number): プロジェクトフィルタ
- `issueId` (number): 課題フィルタ
- `userId` (number): ユーザーフィルタ
- `from` (string): 開始日（YYYY-MM-DD）
- `to` (string): 終了日（YYYY-MM-DD）

**Response:**
```json
{
  "status": "success",
  "data": {
    "timeEntries": [...],
    "totalHours": "45.50",
    "pagination": { ... }
  }
}
```

### POST /api/time-entries
作業時間記録

**Request:**
```json
{
  "projectId": 1,
  "issueId": 5,
  "hours": 3.5,
  "comments": "バグ修正作業",
  "activityId": 2,
  "spentOn": "2026-01-13"
}
```

### GET /api/time-entries/activities/list
活動種別一覧取得

**Response:**
```json
{
  "status": "success",
  "data": {
    "activities": [
      { "id": 1, "name": "設計", "isDefault": false },
      { "id": 2, "name": "開発", "isDefault": true },
      { "id": 3, "name": "テスト", "isDefault": false }
    ]
  }
}
```

---

## 📊 共通レスポンス形式

### 成功レスポンス
```json
{
  "status": "success",
  "message": "操作が成功しました",
  "data": { ... }
}
```

### エラーレスポンス
```json
{
  "status": "error",
  "message": "エラーメッセージ"
}
```

### HTTPステータスコード
- `200 OK`: 成功
- `201 Created`: 作成成功
- `400 Bad Request`: 不正なリクエスト
- `401 Unauthorized`: 認証エラー
- `403 Forbidden`: 権限エラー
- `404 Not Found`: リソースが見つからない
- `500 Internal Server Error`: サーバーエラー

---

## 🔒 権限一覧

### プロジェクト管理
- `add_project`: プロジェクト作成
- `edit_project`: プロジェクト編集
- `close_project`: プロジェクトクローズ
- `delete_project`: プロジェクト削除
- `manage_members`: メンバー管理
- `manage_versions`: バージョン管理

### 課題管理
- `view_issues`: 課題閲覧
- `add_issues`: 課題作成
- `edit_issues`: 課題編集
- `delete_issues`: 課題削除
- `manage_issue_relations`: 課題関連管理
- `add_issue_watchers`: ウォッチャー追加
- `delete_issue_watchers`: ウォッチャー削除

### 時間管理
- `view_time_entries`: 作業時間閲覧
- `log_time`: 作業時間記録
- `edit_time_entries`: 作業時間編集
- `log_time_for_other_users`: 他ユーザーの作業時間記録

### システム管理
- `manage_users`: ユーザー管理
- `manage_groups`: グループ管理
- `manage_roles`: ロール管理
- `manage_workflows`: ワークフロー管理
- `manage_enumerations`: 列挙値管理

---

## 📌 注意事項

1. **認証**: ほとんどのエンドポイントは認証が必須です
2. **権限**: 操作には適切な権限が必要です
3. **ページネーション**: 一覧取得APIはページネーション対応
4. **日付フォーマット**: ISO 8601形式（YYYY-MM-DD）
5. **文字コード**: UTF-8
6. **Content-Type**: application/json

---

## 🔗 関連ドキュメント

- [SETUP.md](./SETUP.md) - セットアップ手順
- [PHASE2_COMPLETION.md](./PHASE2_COMPLETION.md) - Phase 2完了報告
- [PHASE2_REVIEW.md](./PHASE2_REVIEW.md) - 実装レビュー
