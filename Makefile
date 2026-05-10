# Pluim — Makefile
# Usage: make <target>

COMPOSE  := docker compose
BACKEND  := backend
FRONTEND := frontend
DATA_VOL := canvas_pluim_data

# ── Formatting ──────────────────────────────────────────────────────────────
BOLD  := \033[1m
RESET := \033[0m
GREEN := \033[32m
CYAN  := \033[36m
YELLOW := \033[33m
RED   := \033[31m

.DEFAULT_GOAL := help
.PHONY: help setup secret build up down restart logs status \
        logs-backend logs-frontend shell-backend shell-frontend \
        restart-backend restart-frontend deploy push-deploy \
        dev-backend dev-frontend install \
        backup db clean clean-volumes nuke


# ── Help ─────────────────────────────────────────────────────────────────────

help: ## Show this help
	@printf "$(BOLD)Pluim$(RESET) — available targets\n\n"
	@awk 'BEGIN {FS = ":.*##"} \
	    /^[a-zA-Z_-]+:.*##/ { \
	        printf "  $(CYAN)%-22s$(RESET) %s\n", $$1, $$2 \
	    } \
	    /^##@/ { \
	        printf "\n$(BOLD)%s$(RESET)\n", substr($$0, 5) \
	    }' $(MAKEFILE_LIST)
	@printf "\n"


##@ Setup

setup: ## Copy .env.example → .env (skips if .env exists) and show next steps
	@if [ -f .env ]; then \
	    printf "$(YELLOW)⚠  .env already exists — skipping copy$(RESET)\n"; \
	else \
	    cp .env.example .env; \
	    printf "$(GREEN)✓  .env created$(RESET)\n"; \
	fi
	@printf "\n$(BOLD)Next steps:$(RESET)\n"
	@printf "  1. Register a GitHub OAuth App:\n"
	@printf "       Homepage URL:              http://YOUR_VM_IP\n"
	@printf "       Authorization callback URL: http://YOUR_VM_IP/api/auth/callback\n"
	@printf "  2. Edit $(BOLD).env$(RESET) with your client_id, client_secret, VM IP, and admin username\n"
	@printf "  3. Run $(BOLD)make secret$(RESET) to generate a SECRET_KEY and paste it into .env\n"
	@printf "  4. Run $(BOLD)make build && make up$(RESET)\n\n"

secret: ## Generate a random SECRET_KEY value
	@printf "$(BOLD)SECRET_KEY=$(RESET)"
	@uv run python -c "import secrets; print(secrets.token_hex(32))"

dev-env: ## Create a .env pre-configured for local dev (DEV_MODE=true, no GitHub OAuth needed)
	@if [ -f .env ]; then \
	    printf "$(YELLOW)⚠  .env already exists — skipping$(RESET)\n"; \
	    printf "   Add $(BOLD)DEV_MODE=true$(RESET) manually if you want dev login.\n"; \
	else \
	    printf "FRONTEND_URL=http://localhost:3000\n" > .env; \
	    printf "DEV_MODE=true\n" >> .env; \
	    printf "DEV_ADMIN_USERNAME=localdev\n" >> .env; \
	    printf "GITHUB_CLIENT_ID=\n" >> .env; \
	    printf "GITHUB_CLIENT_SECRET=\n" >> .env; \
	    SK=$$(uv run python -c "import secrets; print(secrets.token_hex(32))"); \
	    printf "SECRET_KEY=$$SK\n" >> .env; \
	    printf "DATABASE_URL=sqlite+aiosqlite:///./pluim-dev.db\n" >> .env; \
	    printf "UPLOAD_DIR=./uploads-dev\n" >> .env; \
	    printf "$(GREEN)✓  .env created for local dev (DEV_MODE=true, SQLite in cwd)$(RESET)\n"; \
	    printf "   Run: $(BOLD)make install && make dev-backend$(RESET) (in one terminal)\n"; \
	    printf "        $(BOLD)make dev-frontend$(RESET) (in another terminal)\n"; \
	    printf "   Then open $(BOLD)http://localhost:3000$(RESET) and click \"Dev login\"\n"; \
	fi


##@ Docker

build: _require-env ## Build all Docker images
	$(COMPOSE) build

build-backend: _require-env ## Rebuild only the backend image
	$(COMPOSE) build $(BACKEND)

build-frontend: _require-env ## Rebuild only the frontend image
	$(COMPOSE) build $(FRONTEND)

push-deploy: _require-env ## git push, SSH to server, git pull + make deploy
	@DEPLOY_HOST=$$(grep '^DEPLOY_HOST=' .env | cut -d= -f2); \
	DEPLOY_USER=$$(grep '^DEPLOY_USER=' .env | cut -d= -f2); \
	DEPLOY_PATH=$$(grep '^DEPLOY_PATH=' .env | cut -d= -f2); \
	test -n "$$DEPLOY_HOST" || (printf "$(RED)✗  DEPLOY_HOST not set in .env$(RESET)\n" && exit 1); \
	test -n "$$DEPLOY_USER" || (printf "$(RED)✗  DEPLOY_USER not set in .env$(RESET)\n" && exit 1); \
	test -n "$$DEPLOY_PATH" || (printf "$(RED)✗  DEPLOY_PATH not set in .env$(RESET)\n" && exit 1); \
	printf "$(CYAN)→  git push$(RESET)\n"; \
	git push; \
	printf "$(CYAN)→  ssh $$DEPLOY_USER@$$DEPLOY_HOST$(RESET)\n"; \
	ssh $$DEPLOY_USER@$$DEPLOY_HOST "cd $$DEPLOY_PATH && git pull && make deploy"

deploy: _require-env ## Pull, rebuild images, and restart (use this after git pull)
	$(COMPOSE) down
	$(COMPOSE) build
	$(COMPOSE) up -d
	@printf "$(GREEN)✓  Deployed at http://$(shell grep FRONTEND_URL .env | cut -d= -f2 | sed 's|http://||')$(RESET)\n"

up: _require-env ## Start all services in the background
	$(COMPOSE) up -d
	@printf "$(GREEN)✓  Running at http://$(shell grep FRONTEND_URL .env | cut -d= -f2 | sed 's|http://||')$(RESET)\n"

up-logs: _require-env ## Start all services and follow logs
	$(COMPOSE) up

down: ## Stop all services
	$(COMPOSE) down

restart: _require-env ## Restart all services
	$(COMPOSE) restart

restart-backend: _require-env ## Restart only the backend
	$(COMPOSE) restart $(BACKEND)

restart-frontend: _require-env ## Restart only the frontend
	$(COMPOSE) restart $(FRONTEND)

status: ## Show container status
	$(COMPOSE) ps

health: ## Check backend health endpoint
	@HOST=$$(grep FRONTEND_URL .env 2>/dev/null | cut -d= -f2 || echo "http://localhost"); \
	curl -sf "$$HOST/api/health" && printf " $(GREEN)✓ healthy$(RESET)\n" \
	    || printf "$(RED)✗ unhealthy or not running$(RESET)\n"


##@ Logs

logs: ## Tail logs for all services (Ctrl-C to stop)
	$(COMPOSE) logs -f

logs-backend: ## Tail backend logs
	$(COMPOSE) logs -f $(BACKEND)

logs-frontend: ## Tail frontend logs
	$(COMPOSE) logs -f $(FRONTEND)


##@ Shells

shell-backend: ## Open a shell in the backend container
	$(COMPOSE) exec $(BACKEND) /bin/bash

shell-frontend: ## Open a shell in the frontend (nginx) container
	$(COMPOSE) exec $(FRONTEND) /bin/sh

db: ## Open sqlite3 shell on the database
	$(COMPOSE) exec $(BACKEND) /bin/bash -c \
	    "sqlite3 /data/db/pluim.db"


##@ Local development (no Docker)

install: ## Install frontend npm dependencies
	cd frontend && npm install

dev-backend: ## Run the backend locally with hot-reload (needs .env)
	@test -f .env || (printf "$(RED)✗  .env not found — run make setup$(RESET)\n" && exit 1)
	@export $$(grep -v '^#' .env | xargs) && \
	    PYTHONPATH=src uv run uvicorn pluim.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend: ## Run the Vite dev server (proxies /api to localhost:8000)
	cd frontend && npm run dev


##@ Data

backup: ## Back up the data volume to ./backups/
	@mkdir -p backups
	@STAMP=$$(date +%Y%m%d-%H%M%S); \
	docker run --rm \
	    -v $(DATA_VOL):/data:ro \
	    -v "$$(pwd)/backups":/out \
	    alpine tar czf /out/pluim-$$STAMP.tar.gz /data && \
	printf "$(GREEN)✓  Saved to backups/pluim-$$STAMP.tar.gz$(RESET)\n"

restore: ## Restore from a backup: make restore FILE=backups/pluim-YYYYMMDD-HHMMSS.tar.gz
	@test -n "$(FILE)" || (printf "$(RED)✗  Specify FILE=<path-to-backup>$(RESET)\n" && exit 1)
	@$(COMPOSE) down
	docker run --rm \
	    -v $(DATA_VOL):/data \
	    -v "$$(pwd)":/src \
	    alpine sh -c "rm -rf /data/* && tar xzf /src/$(FILE) -C /"
	@printf "$(GREEN)✓  Restored from $(FILE)$(RESET)\n"
	@$(COMPOSE) up -d


##@ Cleanup

clean: ## Remove containers and built images (keeps data volume)
	$(COMPOSE) down --rmi local
	@printf "$(GREEN)✓  Containers and images removed (data volume preserved)$(RESET)\n"

clean-volumes: ## Remove containers, images AND the data volume (⚠ destructive)
	@printf "$(RED)$(BOLD)WARNING:$(RESET) This deletes all data (database + uploads).\n"
	@printf "Type 'yes' to continue: "; read ans; [ "$$ans" = "yes" ] || exit 0
	$(COMPOSE) down --rmi local -v
	@printf "$(GREEN)✓  Everything removed$(RESET)\n"

nuke: ## Full reset: remove everything Docker-related for this project (⚠ destructive)
	@printf "$(RED)$(BOLD)WARNING:$(RESET) This removes all containers, images, volumes, and build cache.\n"
	@printf "Type 'yes' to continue: "; read ans; [ "$$ans" = "yes" ] || exit 0
	$(COMPOSE) down --rmi all -v --remove-orphans
	docker builder prune -f
	@printf "$(GREEN)✓  Full reset complete$(RESET)\n"


# ── Internal ─────────────────────────────────────────────────────────────────

_require-env:
	@test -f .env || (printf "$(RED)✗  .env not found — run: make setup$(RESET)\n" && exit 1)
