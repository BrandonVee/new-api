WEB_DIR = ./web
API_DIR = .
DEV_WEB_PORT ?= 5173
DEV_COMPOSE_FILE = docker-compose.dev.yml
DEV_POSTGRES_SERVICE = postgres
DEV_API_SERVICE = ai-gateway
DEV_POSTGRES_DB = ai-gateway
DEV_POSTGRES_USER = root
# reset-setup follows backend discovery unless a database path is explicitly supplied.
DEV_SQLITE_PATH_EXPLICIT := $(if $(filter undefined,$(origin DEV_SQLITE_PATH)),false,true)
DEV_SQLITE_PATH ?= ai-gateway.db

.PHONY: all build-web build-all-web start-api dev dev-api dev-api-rebuild dev-web reset-setup test

all: build-all-web start-api

build-web:
	@echo "Building web frontend..."
	@cd $(WEB_DIR) && bun install --frozen-lockfile
	@cd $(WEB_DIR) && DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$$(cat ../VERSION) bun run build

build-all-web: build-web

start-api:
	@echo "Starting api dev server..."
	@cd $(API_DIR) && go run main.go &

dev-api:
	@echo "Starting api services (docker)..."
	@docker compose -f $(DEV_COMPOSE_FILE) up -d

dev-api-rebuild:
	@echo "Rebuilding and starting api service (docker)..."
	@docker compose -f $(DEV_COMPOSE_FILE) up -d --build $(DEV_API_SERVICE)

dev-web:
	@echo "Starting web frontend dev server..."
	@echo "Web frontend: http://localhost:$(DEV_WEB_PORT)"
	@cd $(WEB_DIR) && bun install
	@cd $(WEB_DIR) && bun run dev -- --host 0.0.0.0 --port $(DEV_WEB_PORT)

dev: dev-api dev-web

# The main package embeds the ignored web/dist output and is covered after build-web.
test:
	@echo "Testing root Go module..."
	@root_module=$$(GOWORK=off go list -m); \
		root_packages=$$(GOWORK=off go list -e ./... | grep -vxF "$$root_module"); \
		GOWORK=off go test $$root_packages
	@echo "Testing relaykit Go module..."
	@cd relaykit && GOWORK=off go test ./...
	@echo "Testing tokenkit Go module..."
	@cd tokenkit && GOWORK=off go test ./...

reset-setup:
	@echo "Resetting local setup wizard state..."
	@if docker compose -f $(DEV_COMPOSE_FILE) ps --services --status running | grep -qx "$(DEV_POSTGRES_SERVICE)"; then \
		echo "Detected running docker dev PostgreSQL. Removing setup record and root users..."; \
		docker compose -f $(DEV_COMPOSE_FILE) exec -T $(DEV_POSTGRES_SERVICE) \
			psql -U $(DEV_POSTGRES_USER) -d $(DEV_POSTGRES_DB) \
			-c 'DELETE FROM setups;' \
			-c 'DELETE FROM users WHERE role = 100;' \
			-c "DELETE FROM options WHERE key IN ('SelfUseModeEnabled', 'DemoSiteEnabled');"; \
		echo "Restarting docker dev api so setup status is recalculated..."; \
		docker compose -f $(DEV_COMPOSE_FILE) restart $(DEV_API_SERVICE); \
	else \
		db_path="$${SQLITE_PATH:-$(DEV_SQLITE_PATH)}"; \
		if [ -z "$${SQLITE_PATH:-}" ] && [ "$(DEV_SQLITE_PATH_EXPLICIT)" = false ]; then \
			found_db=; \
			for candidate in ai-gateway.db one-api.db new-api.db; do \
				for suffix in '' -wal -shm -journal; do \
					file="$$candidate$$suffix"; \
					if [ -L "$$file" ] || { [ -e "$$file" ] && [ ! -f "$$file" ]; }; then \
						echo "SQLite file $$file is not a regular file. Set SQLITE_PATH explicitly."; exit 1; \
					fi; \
					if [ -n "$$suffix" ] && [ -e "$$file" ] && [ ! -f "$$candidate" ]; then \
						echo "SQLite sidecars exist without $$candidate. Recover the database or set SQLITE_PATH explicitly."; exit 1; \
					fi; \
				done; \
				if [ -f "$$candidate" ]; then \
					if [ -n "$$found_db" ]; then \
						echo "Multiple SQLite databases found. Set SQLITE_PATH explicitly."; exit 1; \
					fi; \
					found_db="$$candidate"; \
				fi; \
			done; \
			if [ -n "$$found_db" ]; then db_path="$$found_db"; fi; \
		fi; \
		db_path="$${db_path%%\?*}"; \
		if [ ! -f "$$db_path" ]; then \
			echo "No running docker dev PostgreSQL or local SQLite database found."; \
			echo "Start the dev stack with 'make dev-api', or set SQLITE_PATH/DEV_SQLITE_PATH to your local SQLite database."; exit 1; \
		fi; \
		echo "Detected local SQLite database: $$db_path"; \
		sqlite3 "$$db_path" \
			"DELETE FROM setups; DELETE FROM users WHERE role = 100; DELETE FROM options WHERE key IN ('SelfUseModeEnabled', 'DemoSiteEnabled');" || exit $$?; \
		echo "SQLite setup state reset. Restart the local api process before testing the setup wizard."; \
	fi
