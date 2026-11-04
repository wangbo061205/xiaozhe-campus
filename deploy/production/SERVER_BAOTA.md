# 给服务器管理员：小折 / 折丹agent 部署

目标域名：`xiaozhe.mxqi.cn`。本包服务于已上传的小程序 `wx85bd8cd2e616d9cc`，也提供小折聊天网页和管理员后台。

## 已有服务器直接更新

1. 把服务器包内容解压到 `/www/wwwroot/xiaozhe.mxqi.cn/`，目录下应直接看到 `runtime/`、`knowledge/`、`deploy/`。覆盖包内同名程序文件即可。包内不含 `.env`，已有 `deploy/production/.env` 必须保留，数据库密码、JWT 和管理员密码均沿用原值。
2. 宝塔终端执行：

```sh
cd /www/wwwroot/xiaozhe.mxqi.cn/deploy/production
sh deploy-baota.sh
```

脚本会校验文件，沿用 `xiaozhe-campus_postgres_data` 与 `xiaozhe-campus_uploads`，更新前备份原库及图片，启动后端，再幂等导入 8811 篇校园官网资料。备份在本目录的 `backups/时间戳/`，含私人配置，不要对外分享。

如果数据库未使用预期的命名卷，脚本会停止，避免误启动空数据库。若原数据库已运行但 `.env` 遗失，必须找回原配置，不能随意新建密码；仅修改 `.env` 不会修改已存在的 PostgreSQL 密码。

## 宝塔反向代理（解决当前 404）

仅设置 `xiaozhe.mxqi.cn` 这个站点，保留其他站点配置和 Nginx。

在「网站 → xiaozhe.mxqi.cn → 反向代理」添加或修改：

- 名称：`xiaozhe-backend`。
- 代理目录：`/`，即整站转发，不能只代理 `/api`。
- 目标 URL：`http://127.0.0.1:18080`。
- 发送域名：`$host`。
- 代理缓存：关闭。
- 保留站点现有 SSL，证书须包含 `xiaozhe.mxqi.cn`。

如果站点配置中还有图片、JS、CSS 等静态缓存 `location`，它们可能抢先返回 404。可以由管理员参考同目录 `baota-proxy.conf.example`，把本网站的根代理配置为 `location ^~ /`；先备份站点配置，已有同路径 `location` 应替换，不能重复添加。只在本网站的 `server {}` 内修改，不覆盖整个全局 `nginx.conf`，不改其他站点或证书。

应用配置前在宝塔点击检查配置，检查成功后重载 Nginx。保留 ACME / `.well-known` 证书续签相关配置。

本包不启动 Caddy，后端只映射 `127.0.0.1:18080:8080`，数据库不映射公网端口。原来处于 `Created` 的 `https` 容器可以留着，不要执行旧方案的无参数 `docker compose up -d`，以免再次抢占 80/443。

## 公网验收

```sh
cd /www/wwwroot/xiaozhe.mxqi.cn/deploy/production
sh check-baota.sh
```

应通过：本机接口、公网 HTTPS 接口、聊天网页、管理后台、至少 8811 篇官网资料、校园地点接口。检查脚本不调用付费模型，不创建测试对话或测试帖子。

手工打开：

- `https://xiaozhe.mxqi.cn/api/v1/config/public`：HTTP 200，JSON 的 `code` 为 `0`。
- `https://xiaozhe.mxqi.cn/xiaozhe.html`：小折聊天网页。
- `https://xiaozhe.mxqi.cn/admin.html`：管理员后台。

管理员账号 `admin`。新环境密码取服务器本地 `.env` 的 `APP_ADMIN_PASSWORD`；已有管理员保留原密码，修改这个变量不会强行重置已使用的管理员账号。

随后用手机流量测试：小折实际问答和知识来源、选目的地后通过微信地图跳转导航、失物招领图片、课表文件与照片导入。小程序不再规划校园路网或获取用户当前位置，只把所选地点交给微信地图；可选的高德、百度、腾讯等应用以手机安装情况和微信实际列表为准。基础健康检查通过不代表模型账户和所有业务均可用。

如果服务器上访问域名正常而手机仍失败，检查域名 DNS、IPv6 AAAA 是否指向错误服务器、证书链、安全组的 80/443，以及公众平台的合法域名。仅开启了开发工具“不校验合法域名”不等于正式版本已配置。

## 全新安装分支

需要 Linux 服务器（建议 2 核 4GB）、Docker Engine、Compose 插件、curl、openssl、sha256sum；依赖缺失时由管理员安装，脚本不会自动安装系统软件。服务器还需能拉取 `eclipse-temurin:21-jre-alpine` 和 `postgis/postgis:16-3.4` 镜像，包内不含离线 Docker 镜像。

首次运行 `sh deploy-baota.sh` 会生成随机密码并停下，让管理员编辑 `.env`，填写：

```dotenv
CAMPUS_DOMAIN=xiaozhe.mxqi.cn
DEEPSEEK_API_KEY=模型服务密钥
XIAOBEI_CLIENT_ID=校园开放平台应用ID
XIAOBEI_CLIENT_SECRET=校园开放平台密钥
```

已有环境不需要重新执行 `init-env.sh`。校园凭证来自小北云开放平台，是校园数据源配置；小程序本身已移除需要单独申请的微信定位接口。聊天网页和知识库可独立工作；校园实时内容和更新点位需要有效校园凭证。已保存地点可直接交给微信地图导航，不依赖校园路线接口。

## 维护与故障定位

```sh
# 状态、最近后端日志（不要公开包含私人数据的完整日志）
docker compose --env-file .env -f compose.server.yml ps -a
docker compose --env-file .env -f compose.server.yml logs --tail=80 backend

# 另做一份数据库和图片备份
sh backup-baota.sh

# 更新文件后重复此命令，会先备份再替换程序
sh deploy-baota.sh
```

本机 `18080` 通过、公网 `404/403`：优先修宝塔站点域名和反向代理。两边都失败：看数据库、后端状态和配置。`knowledge-seed` 显示 `Exited (0)` 表示一次性导入正常完成。

不要运行 `docker compose down -v` 或删除原卷。升级后的数据库可能已执行结构迁移，需要回退时先由管理员查看本次备份及迁移，不能随意覆盖旧库。

## 微信侧由小程序管理员完成

「开发管理 → 开发设置 → 服务器域名」中，把 `https://xiaozhe.mxqi.cn` 配到 request、uploadFile、downloadFile 对应合法域名。第三方远程图片如需直接在小程序展示，也应按实际来源配置平台要求的域名。先设体验版并加体验成员，手机流量验收后再提交微信审核、正式发布。

## 包的内容

- `runtime/campus-agent.jar`：已编译 Java 21 后端，含小折 Web 页面与后台。
- `knowledge/`：8811 篇官网知识种子及幂等导入程序。
- `src/`、`pom.xml`：对应源码；本次安装直接用预编译 JAR，不需要服务器安装 JDK 或 Maven。
- `deploy/production/`：本部署脚本、Docker 配置和宝塔代理示例。
- `BUILD-INFO.json`、`runtime/SHA256SUMS`：版本与校验记录。

包内没有真实密钥、服务器原库、个人上传图片或微信客户端工程。密钥只在服务器本地配置。
