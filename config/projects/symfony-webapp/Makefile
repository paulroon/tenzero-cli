include Makefile.include

.PHONY: up down migrations migrate cc composer console help

# Start the development environment
up:
	@$(call coloryellow, "\n ========== Docker Up ========== \n")
	docker compose up -d
	@$(MAKE) db-migrate
	@$(MAKE) cc
	@$(call coloryellow, "\n ========== http://localhost:8000 ========== \n")

# Stop the development environment
down:
	@$(call coloryellow, "\n ========== Docker Down ========== \n")
	docker compose down

# Create a new migration
migrations:
	@$(call coloryellow, "\n ========== Make Migration ========== \n")
	docker compose exec app bin/console make:migration

# Run migrations
migrate: db-migrate

# Shortcut for cache:clear
cc:
	docker compose exec app bin/console cache:clear

# Run Composer (usage: make composer require symfony/mailer)
composer:
	docker compose exec app composer $(filter-out $@,$(MAKECMDGOALS))

# Run Symfony console (usage: make console doctrine:migrations:status)
console:
	docker compose exec app bin/console $(filter-out $@,$(MAKECMDGOALS))

help:
	@echo "Available targets:"
	@echo "  up        - Start the development environment"
	@echo "  down      - Stop the development environment"
	@echo "  migrations - Create a new migration"
	@echo "  migrate   - Run migrations"
	@echo "  cc        - Clear cache"
	@echo "  composer  - Run composer (pass args: make composer require pkg)"
	@echo "  console   - Run Symfony console (pass args: make console cmd)"
