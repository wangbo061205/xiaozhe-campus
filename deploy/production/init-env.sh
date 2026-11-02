#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -e .env ]; then
    echo '已存在 .env，保留原配置。' >&2
    exit 1
fi
command -v openssl >/dev/null 2>&1 || { echo '需要 openssl 生成部署密码。' >&2; exit 1; }
[ -f .env.example ] || { echo '缺少 .env.example，部署包可能不完整。' >&2; exit 1; }
umask 077
task_db_password=$(openssl rand -hex 24)
task_jwt_secret=$(openssl rand -hex 48)
task_admin_password=$(openssl rand -hex 16)
sed -e "s/^DB_PASSWORD=$/DB_PASSWORD=$task_db_password/" \
    -e "s/^JWT_SECRET=$/JWT_SECRET=$task_jwt_secret/" \
    -e "s/^APP_ADMIN_PASSWORD=$/APP_ADMIN_PASSWORD=$task_admin_password/" .env.example > .env
chmod 600 .env
echo '已生成 .env。请填写域名、邮箱和 DEEPSEEK_API_KEY；随机密码保存在该文件中。'
