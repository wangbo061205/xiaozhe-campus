#!/bin/sh
# Shared by scripts launched from deploy/production; never execute .env as shell code.
set -eu
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "缺少命令 $1，请服务器管理员安装后重试。"; }
dc() { docker compose --project-name xiaozhe-campus --env-file .env -f compose.server.yml "$@"; }

check_docker() {
    need docker
    docker compose version >/dev/null 2>&1 || fail '需要 Docker Compose 插件（docker compose），可在宝塔 Docker 管理中安装。'
    docker info >/dev/null 2>&1 || fail 'Docker 尚未运行，或当前用户无 Docker 访问权限。'
}

check_environment() {
    [ -f .env ] || fail '缺少服务器 .env。已有部署必须恢复原文件，不可重新生成数据库密码。'
    [ -f compose.server.yml ] || fail '缺少 compose.server.yml，请完整解压部署包。'
    dc config --quiet || fail '.env 配置不完整，请在服务器本地填写；不要把密钥贴进公开日志。'
}

# Discard response bodies after checking a public readiness endpoint.
api_ready() {
    task_body=$(mktemp)
    task_code=$(curl --silent --show-error --connect-timeout 3 --max-time 8 \
        --output "$task_body" --write-out '%{http_code}' "$1/api/v1/config/public") || task_code=000
    if [ "$task_code" = 200 ] && grep -Eq '"code"[[:space:]]*:[[:space:]]*0[[:space:]]*[,}]' "$task_body" \
        && grep -q '"assistant"' "$task_body"; then
        rm -f "$task_body"
        return 0
    fi
    rm -f "$task_body"
    return 1
}

public_origin() {
    # A hostname is configuration, not executable shell text. Reject malformed values.
    task_domain=$(sed -n 's/^CAMPUS_DOMAIN=//p' .env | tail -n 1 | tr -d '\r' | sed "s/^[\"']//;s/[\"']$//")
    [ -n "$task_domain" ] || task_domain=xiaozhe.mxqi.cn
    case "$task_domain" in *[!A-Za-z0-9.-]*|.*|*..*|-*|*-) fail 'CAMPUS_DOMAIN 只填写域名，不含协议、端口、空格或路径。';; esac
    printf 'https://%s\n' "$task_domain"
}
