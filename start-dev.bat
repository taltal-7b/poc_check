@echo off
echo ================================
echo 開発サーバーを起動しています...
echo ================================
echo.

REM すべてのNodeプロセスを停止
echo [1/3] Nodeプロセスを停止しています...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

REM プロジェクトルートに移動
cd /d "%~dp0"

REM 開発サーバーを起動
echo.
echo [2/3] 開発サーバーを起動しています...
echo.
echo バックエンド: http://localhost:3000
echo フロントエンド: http://localhost:5173
echo.
echo [3/3] ログイン情報:
echo   ユーザー名: admin
echo   パスワード: admin123
echo.
echo ================================
echo Ctrl+C で停止できます
echo ================================
echo.

npm run dev
