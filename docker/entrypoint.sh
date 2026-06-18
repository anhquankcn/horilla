#!/bin/bash
set -e

echo "Starting Horilla HR..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
while ! nc -z db 5432; do
  sleep 0.1
done
echo "PostgreSQL is ready!"

# NB: KHÔNG migrate ở đây — migrate được chạy MỘT lần ở bước deploy (deploy.sh /
# deploy-prod.sh). Chạy cả 2 nơi gây race "duplicate ... already exists" khi tạo
# bảng mới (migrate entrypoint + migrate deploy chạy song song).

# Compile translations
python manage.py compilemessages -l vi --ignore=node_modules --ignore=venv 2>/dev/null || true

# Collect static files
python manage.py collectstatic --noinput

echo "Starting server..."
exec "$@"