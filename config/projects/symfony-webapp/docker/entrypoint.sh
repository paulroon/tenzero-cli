#!/bin/sh
set -e

# Allow running composer as root inside container
export COMPOSER_ALLOW_SUPERUSER=1

# Install/update dependencies in dev with symlinked local packages
if [ ! -f vendor/autoload.php ] || [ composer.lock -nt vendor/autoload.php ]; then
  echo "[entrypoint] Running composer install..."
  composer install --prefer-dist --no-interaction
fi

# Generate JWT keys if missing (Lexik JWT bundle requires these at boot)
if [ ! -f config/jwt/private.pem ]; then
  echo "[entrypoint] Generating JWT keypair..."
  mkdir -p config/jwt
  openssl genrsa -out config/jwt/private.pem 2048
  openssl rsa -in config/jwt/private.pem -pubout -out config/jwt/public.pem
  chown -R www-data:www-data config/jwt 2>/dev/null || true
fi

exec "$@"
