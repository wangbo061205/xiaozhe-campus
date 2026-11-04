#!/bin/sh
set -eu
cd "$(dirname "$0")"
. ./server-common.sh
need curl
need sha256sum
check_docker
task_existing=false
if docker volume inspect xiaozhe-campus_postgres_data >/dev/null 2>&1; then task_existing=true; fi
task_containers=$(docker ps -aq --filter label=com.docker.compose.project=xiaozhe-campus)
if [ ! -f .env ]; then
    if [ "$task_existing" = true ] || [ -n "$task_containers" ]; then
        fail '发现已有小折服务，但此目录没有原 .env。请在原目录解压，或先恢复原 .env；已停止，未修改已有服务。'
    fi
    sh ./init-env.sh
    printf '%s\n' '首次部署配置已生成。请编辑本目录 .env：填写 CAMPUS_DOMAIN=xiaozhe.mxqi.cn、模型密钥和校园数据凭证，然后再次运行本脚本。'
    exit 2
fi
check_environment
[ -f ../../runtime/campus-agent.jar ] || fail '缺少预编译后端 runtime/campus-agent.jar，请完整解压服务器包。'
[ -f ../../runtime/SHA256SUMS ] || fail '缺少文件校验清单。'
(cd ../.. && sha256sum --check runtime/SHA256SUMS) || fail '文件校验未通过，请重新传输完整服务器包。'

# An old database must use the same named volume before any replacement starts.
task_database=$(dc ps -a -q postgres)
if [ -n "$task_database" ]; then
    task_mounts=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$task_database")
    [ "$task_mounts" = xiaozhe-campus_postgres_data ] \
        || fail '原数据库使用了不同的数据目录；为防止误建空库，已停止，请由管理员确认原卷。'
fi

printf '%s\n' '1/4 启动或确认原 PostgreSQL 服务。'
dc up -d postgres
task_attempt=0
until dc exec -T postgres pg_isready -U campus -d campus >/dev/null 2>&1; do
    task_attempt=$((task_attempt + 1))
    [ "$task_attempt" -lt 60 ] || fail '数据库启动超时，请执行 docker compose --env-file .env -f compose.server.yml logs --tail=80 postgres。'
    sleep 2
done
if [ "$task_existing" = true ] || [ -n "$task_database" ]; then
    printf '%s\n' '2/4 备份原数据库、配置及上传图片。'
    sh ./backup-baota.sh
else
    printf '%s\n' '2/4 全新数据库，无需迁移旧数据。'
fi

printf '%s\n' '3/4 启动预编译后端；仅监听 127.0.0.1:18080，不占用公网 80/443。'
dc up -d --build backend
task_attempt=0
until api_ready http://127.0.0.1:18080; do
    task_attempt=$((task_attempt + 1))
    [ "$task_attempt" -lt 90 ] || fail '后端启动超时。请运行 sh check-baota.sh，并在服务器查看 backend 日志；原数据卷已保留。'
    sleep 2
done
printf '%s\n' '4/4 恢复或补全 8811 篇校园知识；已有文章保持不变。'
dc run --rm --no-deps knowledge-seed
printf '\n%s\n' '后端和知识库已启动。还需完成宝塔反向代理及公网验收：'
printf '%s\n' '宝塔网站 xiaozhe.mxqi.cn → 反向代理 → 代理目录 / → 目标 http://127.0.0.1:18080。'
printf '%s\n' '保留宝塔现有 HTTPS，不启动 Caddy，不删除数据库卷。'
printf '%s\n' '设置完成后执行：sh check-baota.sh'
