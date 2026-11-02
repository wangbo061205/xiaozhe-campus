#!/bin/sh
set -eu

: "${DB_PASSWORD:?缺少 DB_PASSWORD}"

db_host=${DB_HOST:-postgres}
db_name=${DB_NAME:-campus}
db_user=${DB_USER:-campus}
expected_count=8811
export PGPASSWORD=$DB_PASSWORD

attempt=0
while [ "$attempt" -lt 120 ]; do
    if psql -X -h "$db_host" -U "$db_user" -d "$db_name" -Atqc \
        "select to_regclass('public.knowledge_item') is not null" 2>/dev/null | grep -qx t; then
        break
    fi
    attempt=$((attempt + 1))
    sleep 2
done

if [ "$attempt" -ge 120 ]; then
    echo '等待知识库表创建超时。' >&2
    exit 1
fi

current_count=$(psql -X -h "$db_host" -U "$db_user" -d "$db_name" -Atqc \
    "select count(*) from knowledge_item where import_key like 'nmu-official:%'")

if [ "$current_count" -ge "$expected_count" ]; then
    echo "官方知识库已就绪：$current_count 条，无需重复导入。"
    exit 0
fi

echo "开始恢复官方知识库，当前 $current_count 条，目标 $expected_count 条。"
psql -X -h "$db_host" -U "$db_user" -d "$db_name" -v ON_ERROR_STOP=1 -f /seed/import.sql

restored_count=$(psql -X -h "$db_host" -U "$db_user" -d "$db_name" -Atqc \
    "select count(*) from knowledge_item where import_key like 'nmu-official:%'")

if [ "$restored_count" -lt "$expected_count" ]; then
    echo "知识库恢复不完整：实际 $restored_count 条，预期至少 $expected_count 条。" >&2
    exit 1
fi

echo "官方知识库恢复完成：$restored_count 条。"
