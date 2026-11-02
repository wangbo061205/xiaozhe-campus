# 小折 Web 服务部署说明

本目录用于在 Linux 服务器上通过 Docker Compose 部署小折网页、管理后台、Spring Boot 后端、PostgreSQL、校园知识库和 Caddy HTTPS。

## 1. 准备条件

- Linux x86_64/arm64 服务器，建议至少 2 核、4 GB 内存、20 GB 可用磁盘；
- 已安装 Docker Engine 与 `docker compose` 插件；
- 一个已解析到服务器公网 IP 的域名；
- 防火墙/安全组开放 TCP 22、80、443，以及 UDP 443；
- 可用的 DeepSeek API Key。

中国大陆服务器使用的域名需按实际规定完成备案。PostgreSQL 和 Java 端口不对公网开放。

## 2. 首次启动

在完整部署包根目录解压后执行：

```sh
cd deploy/production
sh init-env.sh
vi .env
```

至少填写：

```dotenv
CAMPUS_DOMAIN=你的域名
ACME_EMAIL=证书通知邮箱
DEEPSEEK_API_KEY=你的模型密钥
```

`DB_PASSWORD`、`JWT_SECRET`、`APP_ADMIN_PASSWORD` 已由脚本随机生成，不要清空或外传。仅使用独立 Web 页面和知识库时，小北云三项可以留空。

确认并启动：

```sh
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
docker compose --env-file .env ps -a
docker compose --env-file .env logs --no-log-prefix knowledge-seed
```

首次构建和导入 8,811 条知识资料需要几分钟。`knowledge-seed` 显示 `Exited (0)` 是一次性导入任务正常完成，不是故障。Caddy 会在知识导入成功后启动并自动申请 HTTPS 证书。

## 3. 访问入口

- 小折网页：`https://你的域名/` 或 `/xiaozhe.html`
- 管理后台：`https://你的域名/admin.html`
- 管理员账号：`admin`
- 管理员密码：服务器本地 `.env` 中的 `APP_ADMIN_PASSWORD`

首次登录后可在“知识库”维护资料，在“小折助手设置”调整名称、欢迎语、人设和开场建议。

## 4. 验收

```sh
curl --fail "https://你的域名/api/v1/config/public"
docker compose --env-file .env exec -T postgres \
  psql -U campus -d campus -Atc \
  "select count(*) from knowledge_item where import_key like 'nmu-official:%';"
```

第二条命令应输出 `8811`。随后用无痕窗口测试小折问答、知识来源详情、后台登录、知识库翻页与助手设置保存。

## 5. 日常维护

查看日志：

```sh
docker compose --env-file .env logs -f --tail=200 backend
```

更新代码后重建：

```sh
docker compose --env-file .env up -d --build backend
```

备份数据库：

```sh
mkdir -p backups
docker compose --env-file .env exec -T postgres \
  pg_dump -U campus -d campus -Fc --no-owner --no-acl > "backups/campus-$(date +%Y%m%d-%H%M%S).dump"
```

备份文件包含账号和业务数据，应加密保存。不要执行 `docker compose down -v`，该命令会删除数据库和上传文件卷。

## 6. 常见问题

- HTTPS 申请失败：检查域名 A/AAAA 记录、80/443 端口和服务器时间。
- 对话提示模型不可用：检查 `.env` 中的 API Key、账户额度和服务器到模型 API 的网络。
- 知识导入失败：运行 `docker compose --env-file .env logs knowledge-seed`；修正后执行 `docker compose --env-file .env up knowledge-seed`。
- 后台无法登录：确认账号为 `admin`，密码取自当前服务器的 `.env`，不要使用本地开发密码。
- 需要重置全新环境：先备份，再明确确认数据可删除后处理卷；不要在不清楚数据后果时执行删卷操作。
