#!/bin/sh
set -eu
cd "$(dirname "$0")"
. ./server-common.sh
need curl
check_docker
check_environment
task_failed=0
printf '%s\n' '=== 容器状态 ==='
dc ps -a
if api_ready http://127.0.0.1:18080; then
    printf '%s\n' '[通过] 本机校园服务 http://127.0.0.1:18080'
else
    printf '%s\n' '[未通过] 本机服务不可用。先检查 backend/postgres 状态和 backend 日志。'
    task_failed=1
fi
task_count=$(dc exec -T postgres psql -X -U campus -d campus -Atqc \
    "select count(*) from knowledge_item where import_key like 'nmu-official:%'" 2>/dev/null) || task_count=0
case "$task_count" in ''|*[!0-9]*) task_count=0;; esac
if [ "$task_count" -ge 8811 ]; then
    printf '[通过] 官网知识库 %s 篇\n' "$task_count"
else
    printf '[未通过] 官网知识库仅 %s 篇，预期至少 8811 篇。\n' "$task_count"
    task_failed=1
fi
task_origin=$(public_origin)
if api_ready "$task_origin"; then
    printf '[通过] 公网 HTTPS 校园接口 %s\n' "$task_origin"
else
    printf '[未通过] 公网接口 %s/api/v1/config/public\n' "$task_origin"
    printf '%s\n' '本机通过而公网 404/403：检查宝塔网站域名、反向代理、SSL、静态缓存规则和 DNS。'
    task_failed=1
fi
for task_page in xiaozhe.html admin.html; do
    task_status=$(curl --silent --show-error --connect-timeout 5 --max-time 12 \
        --output /dev/null --write-out '%{http_code}' "$task_origin/$task_page") || task_status=000
    if [ "$task_status" = 200 ]; then
        printf '[通过] %s/%s\n' "$task_origin" "$task_page"
    else
        printf '[未通过] %s/%s，HTTP %s\n' "$task_origin" "$task_page" "$task_status"
        task_failed=1
    fi
done
# This public read only checks campus credentials; it never starts an AI conversation.
task_campus_status=$(curl --silent --show-error --connect-timeout 5 --max-time 65 \
    --output /dev/null --write-out '%{http_code}' 'http://127.0.0.1:18080/api/v1/campus/campus.list') || task_campus_status=000
if [ "$task_campus_status" = 200 ]; then
    printf '%s\n' '[通过] 校园地点数据接口。第三方导航交接还需用手机实测。'
else
    printf '[未通过] 校园数据 HTTP %s：检查 .env 的 XIAOBEI_CLIENT_ID/SECRET 和平台授权。\n' "$task_campus_status"
    task_failed=1
fi
if [ "$task_failed" -ne 0 ]; then
    printf '%s\n' '尚有未通过项目，请按上述结果修复后再验收。'
    exit 1
fi
printf '%s\n' '基础部署检查通过。请用手机流量验证聊天、地图导航跳转、图片发布和课表导入；微信还需配置合法域名并审核发布。'
