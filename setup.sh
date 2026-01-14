#!/bin/bash

echo "================================"
echo "プロジェクト管理システム セットアップ"
echo "================================"
echo ""

# Check if .env file exists in backend
if [ ! -f backend/.env ]; then
    echo "backend/.env ファイルを作成しています..."
    cat > backend/.env << 'EOF'
# Application
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=project_management

# JWT
JWT_SECRET=your-jwt-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-token-secret-change-this-in-production
JWT_REFRESH_EXPIRES_IN=30d

# Session
SESSION_SECRET=your-session-secret-change-this-in-production

# 2FA
TOTP_ISSUER=ProjectManager
EOF
    echo "✅ backend/.env ファイルを作成しました"
else
    echo "⚠️  backend/.env ファイルは既に存在します"
fi

# Check if .env file exists in frontend
if [ ! -f frontend/.env ]; then
    echo "frontend/.env ファイルを作成しています..."
    cat > frontend/.env << 'EOF'
VITE_API_URL=http://localhost:3000/api
EOF
    echo "✅ frontend/.env ファイルを作成しました"
else
    echo "⚠️  frontend/.env ファイルは既に存在します"
fi

echo ""
echo "================================"
echo "次の手順:"
echo "================================"
echo "1. PostgreSQLデータベースを作成してください:"
echo "   psql -U postgres -c 'CREATE DATABASE project_management;'"
echo ""
echo "2. 必要に応じて backend/.env のDB_PASSWORD を変更してください"
echo ""
echo "3. 依存関係をインストールしてください:"
echo "   npm install"
echo ""
echo "4. データベースにシードデータを投入してください:"
echo "   cd backend && npm run seed && cd .."
echo ""
echo "5. アプリケーションを起動してください:"
echo "   npm run dev"
echo ""
echo "デフォルトログイン情報:"
echo "  ユーザー名: admin"
echo "  パスワード: admin123"
echo "================================"
