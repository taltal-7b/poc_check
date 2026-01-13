.PHONY: help up down restart logs seed clean build

help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

up: ## Docker環境を起動
	docker-compose up -d
	@echo "✅ サービスを起動しました"
	@echo "フロントエンド: http://localhost:5173"
	@echo "バックエンドAPI: http://localhost:3000/api"

down: ## Docker環境を停止
	docker-compose down
	@echo "✅ サービスを停止しました"

restart: ## Docker環境を再起動
	docker-compose restart
	@echo "✅ サービスを再起動しました"

logs: ## ログを表示
	docker-compose logs -f

logs-backend: ## バックエンドのログを表示
	docker-compose logs -f backend

logs-frontend: ## フロントエンドのログを表示
	docker-compose logs -f frontend

logs-db: ## データベースのログを表示
	docker-compose logs -f db

seed: ## 初期データを投入
	docker-compose exec backend npm run seed
	@echo "✅ 初期データを投入しました"
	@echo "ログイン名: admin"
	@echo "パスワード: admin123"

clean: ## すべてのコンテナとボリュームを削除
	docker-compose down -v
	@echo "✅ すべてのデータを削除しました"

build: ## イメージを再ビルド
	docker-compose build --no-cache
	@echo "✅ イメージを再ビルドしました"

rebuild: ## クリーンビルドして起動
	docker-compose down -v
	docker-compose build --no-cache
	docker-compose up -d
	@echo "✅ 完全に再構築しました"

ps: ## コンテナの状態を表示
	docker-compose ps

shell-backend: ## バックエンドコンテナに入る
	docker-compose exec backend sh

shell-frontend: ## フロントエンドコンテナに入る
	docker-compose exec frontend sh

shell-db: ## データベースに接続
	docker-compose exec db psql -U pm_user -d projectmanager

backup: ## データベースをバックアップ
	docker-compose exec db pg_dump -U pm_user projectmanager > backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "✅ バックアップを作成しました"

restore: ## データベースをリストア (usage: make restore FILE=backup.sql)
	docker-compose exec -T db psql -U pm_user projectmanager < $(FILE)
	@echo "✅ データベースをリストアしました"
