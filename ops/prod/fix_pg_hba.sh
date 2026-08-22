#!/usr/bin/env bash
# Cho phép standby (100.112.134.39) nối lại streaming replication.
# Docker userland-proxy trên prod che IP nguồn Tailscale thành gateway bridge
# 172.20.0.1 → pg_hba chỉ có 100.64.0.0/10 nên replication bị FATAL từ 07/08/2026.
# Thêm 1 dòng + reload (KHÔNG restart Postgres).
set -euo pipefail

HBA=/var/lib/postgresql/data/pg_hba.conf
RULE="host replication replicator 172.20.0.1/32 md5"

echo "== truoc =="
docker exec horilla-db-1 grep -c replication "$HBA"

if docker exec horilla-db-1 grep -qF "172.20.0.1/32" "$HBA"; then
  echo "Rule da ton tai — bo qua buoc them."
else
  docker exec horilla-db-1 cp "$HBA" "$HBA.bak.20260822"
  docker exec horilla-db-1 sh -c "echo '$RULE' >> $HBA"
  echo "Da them rule."
fi

echo "== 4 dong cuoi pg_hba =="
docker exec horilla-db-1 tail -4 "$HBA"

echo "== reload config (khong restart) =="
docker exec horilla-db-1 psql -U horilla -d horilla_prod -c "SELECT pg_reload_conf();"
