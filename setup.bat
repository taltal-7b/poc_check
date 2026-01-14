@echo off
echo ================================
echo プロジェクト管理システム セットアップ
echo ================================
echo.

REM Check if .env file exists in backend
if not exist backend\.env (
    echo backend\.env ファイルを作成しています...
    (
        echo # Application
        echo NODE_ENV=development
        echo PORT=3000
        echo FRONTEND_URL=http://localhost:5173
        echo.
        echo # Database
        echo DB_HOST=localhost
        echo DB_PORT=5432
        echo DB_USERNAME=postgres
        echo DB_PASSWORD=postgres
        echo DB_DATABASE=project_management
        echo.
        echo # JWT
        echo JWT_SECRET=your-jwt-secret-key-change-this-in-production
        echo JWT_EXPIRES_IN=7d
        echo JWT_REFRESH_SECRET=your-refresh-token-secret-change-this-in-production
        echo JWT_REFRESH_EXPIRES_IN=30d
        echo.
        echo # Session
        echo SESSION_SECRET=your-session-secret-change-this-in-production
        echo.
        echo # 2FA
        echo TOTP_ISSUER=ProjectManager
    ) > backend\.env
    echo ✓ backend\.env ファイルを作成しました
) else (
    echo ⚠ backend\.env ファイルは既に存在します
)

REM Check if .env file exists in frontend
if not exist frontend\.env (
    echo frontend\.env ファイルを作成しています...
    echo VITE_API_URL=http://localhost:3000/api > frontend\.env
    echo ✓ frontend\.env ファイルを作成しました
) else (
    echo ⚠ frontend\.env ファイルは既に存在します
)

echo.
echo ================================
echo 次の手順:
echo ================================
echo 1. PostgreSQLデータベースを作成してください:
echo    psql -U postgres -c "CREATE DATABASE project_management;"
echo.
echo 2. 必要に応じて backend\.env のDB_PASSWORD を変更してください
echo.
echo 3. 依存関係をインストールしてください:
echo    npm install
echo.
echo 4. データベースにシードデータを投入してください:
echo    cd backend
echo    npm run seed
echo    cd ..
echo.
echo 5. アプリケーションを起動してください:
echo    npm run dev
echo.
echo デフォルトログイン情報:
echo   ユーザー名: admin
echo   パスワード: admin123
echo ================================
pause
