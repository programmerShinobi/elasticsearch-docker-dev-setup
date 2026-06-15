# Convenience targets for the local Elasticsearch dev setup.
# Run `make help` to list available commands.

.DEFAULT_GOAL := help

.PHONY: help setup up down restart logs health status ps clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

setup: ## One-time host prep (sets vm.max_map_count)
	./scripts/setup-host.sh

up: ## Start Elasticsearch in the background
	docker compose up -d

down: ## Stop and remove the container (data volume kept)
	docker compose down

restart: ## Restart the container
	docker compose restart

logs: ## Follow Elasticsearch logs
	docker compose logs -f elasticsearch

ps: ## Show container status
	docker compose ps

health: ## Print cluster health (status should be green/yellow)
	@curl -s http://localhost:9200/_cluster/health?pretty

status: ## Print cluster info (version, name)
	@curl -s http://localhost:9200?pretty

clean: ## Stop AND delete the data volume (DESTRUCTIVE)
	docker compose down -v
