# 環境変数設定例

バックエンドの `.env` ファイルに以下の内容を設定してください：

```env
# Application
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=projectmanager

# JWT
JWT_SECRET=your-jwt-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-token-secret-change-this-in-production
JWT_REFRESH_EXPIRES_IN=30d

# Session
SESSION_SECRET=your-session-secret-change-this-in-production

# 2FA
TOTP_ISSUER=ProjectManager
```

## 注意事項

- 本番環境では必ず強力なシークレットキーを使用してください
- DB_PASSWORDは実際のPostgreSQLパスワードに変更してください
- JWT_SECRET、JWT_REFRESH_SECRET、SESSION_SECRETは長く複雑なランダム文字列を使用してください
