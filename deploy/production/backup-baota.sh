#!/bin/sh
set -eu
cd "$(dirname "$0")"
. ./server-common.sh
check_docker
check_environment
task_stamp=$(date +%Y%m%d-%H%M%S)-$$
task_backup="$PWD/backups/$task_stamp"
mkdir -p "$task_backup"
chmod 700 "$task_backup"
cp .env "$task_backup/server.env"
chmod 600 "$task_backup/server.env"

task_database=$(dc ps -q postgres)
[ -n "$task_database" ] || fail '数据库未运行，无法自动备份；请先检查原数据库容器。'
dc exec -T postgres pg_dump -U campus -d campus -Fc --no-owner --no-acl > "$task_backup/campus.dump.partial" \
    || fail "数据库备份失败，已停止更新。检查目录：$task_backup"
[ -s "$task_backup/campus.dump.partial" ] || fail '数据库备份为空，停止更新。'
mv "$task_backup/campus.dump.partial" "$task_backup/campus.dump"

if docker volume inspect xiaozhe-campus_uploads >/dev/null 2>&1; then
    docker run --rm --network none --entrypoint /bin/sh \
        --mount type=volume,src=xiaozhe-campus_uploads,dst=/data,readonly \
        --mount "type=bind,src=$task_backup,dst=/backup" \
        postgis/postgis:16-3.4 -c 'tar -czf /backup/uploads.tar.gz -C /data .' \
        || fail "图片备份失败，已停止更新。检查目录：$task_backup"
fi
printf '备份完成：%s\n' "$task_backup"
