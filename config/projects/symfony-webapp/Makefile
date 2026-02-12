.PHONY: initial-build
initial-build: down clean build-php up composer-install db-rebuild

# Full restart with all necessary services
.PHONY: restart
restart: down up composer-install db-rebuild

.PHONY: nuke
nuke: down clean
	@$(call colorred, "\n ========== Nuke EVERYTHING ========== \n")
	docker system prune -af --volumes

.PHONY: status
status:
	@$(call coloryellow, "\n ========== Infrastructure ========== \n")
	@git status

# Build containers
.PHONY: build
build:
	@$(call coloryellow, "\n ========== Docker Build ========== \n")
	docker compose build

.PHONY: build-php
build-php:
	@$(call coloryellow, "\n ========== Docker Build PHP ========== \n")
	docker compose build php


.PHONY: db-rebuild
db-rebuild: db-drop db-create db-migrate

.PHONY: db-clean
db-clean: db-drop db-create db-migrate

.PHONY: db-drop
db-drop: db-wait
	@$(call coloryellow, "\n ========== Drop Database ========== \n")
	docker compose exec app bin/console doctrine:database:drop --force --if-exists

.PHONY: db-create
db-create: db-wait
	@$(call coloryellow, "\n ========== Create Database ========== \n")
	docker compose exec app bin/console doctrine:database:create


.PHONY: db-make-migration
db-make-migration:
	@$(call coloryellow, "\n ========== Make Migration ========== \n")
	docker compose exec app bin/console make:migration

.PHONY: db-wait
db-wait:
	@$(call coloryellow, "\n ========== Waiting for Database ========== \n")
	@until docker compose exec -T db sh -c 'pg_isready -U "$${POSTGRES_USER:-app}" -d "$${POSTGRES_DB:-app}"' >/dev/null 2>&1; do \
		echo "Waiting for PostgreSQL..."; \
		sleep 2; \
	done
	@echo "Database is ready."

.PHONY: db-migrate
db-migrate: db-wait
	@$(call coloryellow, "\n ========== Migrate Database ========== \n")
	docker compose exec app bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration

.PHONY: generate-jwt-keys
generate-jwt-keys:
	@$(call coloryellow, "\n ========== Generate JWT Keys ========== \n")
	docker compose exec app sh -c "mkdir -p config/jwt && openssl genpkey -algorithm RSA -out config/jwt/private.pem -pkeyopt rsa_keygen_bits:4096 && openssl pkey -in config/jwt/private.pem -pubout -out config/jwt/public.pem && chmod 600 config/jwt/private.pem && chmod 644 config/jwt/public.pem"

# Start the development environment
.PHONY: up
up:
	@$(call coloryellow, "\n ========== Docker Up ========== \n")
	docker compose up -d
	@$(MAKE) db-migrate
	@$(MAKE) cc
	@$(call coloryellow, "\n ========== http://localhost:8000 ========== \n")

# Stop the development environment
.PHONY: down
down:
	@$(call coloryellow, "\n ========== Docker Down ========== \n")
	docker compose down

# Run Composer commands (usage: make composer require symfony/mailer)
.PHONY: composer
composer:
	composer $(filter-out $@,$(MAKECMDGOALS))

.PHONY: composer-install
composer-install:
	@$(call coloryellow, "\n ========== Composer Install ========== \n")
	docker compose exec app composer install

.PHONY: composer-update
composer-update:
	@$(call coloryellow, "\n ========== Composer Update ========== \n")
	docker compose exec app composer update

# Run bin/console
.PHONY: console
console:
	 docker compose exec app bin/console $(filter-out $@,$(MAKECMDGOALS))

# Shortcut for cache:clear
.PHONY: cc
cc:
	docker compose exec app bin/console cache:clear

# Clean up Docker resources
.PHONY: clean
clean:
	@$(call coloryellow, "\n ========== Docker Clean (Prune) ========== \n")
	docker compose down -v --remove-orphans
	docker system prune -f

.PHONY: test
test:
	@$(call coloryellow, "\n ========== PHPUnit (Auth Bundle) ========== \n")
	docker compose exec app bin/phpunit --configuration tenzero-auth/phpunit.xml --display-notices

.PHONY: cs-fix
cs-fix:
	@$(call coloryellow, "\n ========== PHP-CS (Fix) ========== \n")
	docker compose exec app tenzero-auth/vendor/bin/php-cs-fixer fix -v


.PHONY: standards-check
standards-check:
	@$(call coloryellow, "\n ========== PHP-Standards (Check) ========== \n")
	docker compose exec app tenzero-auth/vendor/bin/phpstan analyse -c tenzero-auth/phpstan.neon tenzero-auth/src --memory-limit=512M

.PHONY: help
help:
	@echo "Available targets:"
	@echo "  initial-build       - Build, start, install deps, and migrate DB"
	@echo "  restart             - Restart services and rebuild DB"
	@echo "  nuke                - Prune all Docker data/volumes"
	@echo "  status              - Show git status"
	@echo "  build               - Build all containers"
	@echo "  build-php           - Build only PHP container"
	@echo "  db-rebuild          - Drop/create/migrate DB"
	@echo "  db-clean            - Drop/create/migrate DB"
	@echo "  db-drop             - Drop database"
	@echo "  db-create           - Create database"
	@echo "  db-make-migration   - Create a migration"
	@echo "  db-migrate          - Run migrations"
	@echo "  generate-jwt-keys   - Generate JWT keypair in config/jwt"
	@echo "  up                  - Start the development environment"
	@echo "  down                - Stop the development environment"
	@echo "  composer            - Run composer (pass args)"
	@echo "  composer-install    - Install dependencies"
	@echo "  composer-update     - Update dependencies"
	@echo "  console             - Run Symfony console (pass args)"
	@echo "  cc                  - Cache clear"
	@echo "  clean               - Prune docker resources"
	@echo "  test                - Run auth bundle PHPUnit tests"
	@echo "  standards-check     - Run PHPStan for auth bundle"
	@echo "  cs-fix              - Run PHP-CS fixer for auth bundle"

# Catch-all target to allow passing arguments to composer
.PHONY: %
%:
	@:

define coloryellow
	@tput -T xterm setaf 3
	@shopt -s xpg_echo && echo $1
	@tput -T xterm sgr0
endef

define colorred
	@tput -T xterm setaf 1
	@shopt -s xpg_echo && echo $1
	@tput -T xterm sgr0
endef

define colorblue
	@tput -T xterm setaf 4
	@shopt -s xpg_echo && echo $1
	@tput -T xterm sgr0
endef

define colorcyan
	@tput -T xterm setaf 6
	@shopt -s xpg_echo && echo $1
	@tput -T xterm sgr0
endef

define colorgreen
	@tput -T xterm setaf 2
	@shopt -s xpg_echo && echo $1
	@tput -T xterm sgr0
endef
