# 小折 / 折丹agent · 微信云托管部署

后端、Web 聊天页和管理后台在微信云托管运行，电脑关机不影响使用。所有用户数据、配置、聊天、课表及图片保存到独立 PostgreSQL；服务容器重启、扩容和发新版不会清空这些数据。

## 控制台现在如何选择

选择 **Spring Boot**。模板只用于创建环境和服务，后续用本项目替换模板代码。不要将模板的计数器页面视为小折已部署，也不要把模板 MySQL 的连接信息填入下面的 PostgreSQL 配置。

本次用户已确认的环境为 `prod-d7gp7wlfv45ac7541`，服务为 `springboot-7661`，上海地域。默认域名为 `https://springboot-7661-341227-6-1521776463.sh.run.tcloudbase.com`；当前计数器模板可访问，不表示小折业务已上线。非敏感连接信息也记录在 `service.json`。

## 数据库

需要独立的 **PostgreSQL 14+**，建议与云托管处于同一腾讯云账号、地域和可互通的 VPC。可在腾讯云购买托管 PostgreSQL，具体规格和费用在购买页面确认；本代码包不会自动购买资源。已有可用的 PostgreSQL 也可以接入。

创建 `campus` 数据库和专用账号，为该数据库启用 `pg_trgm` 扩展。首次启动会执行 Flyway 迁移，因此账号需要建表、建索引和建触发器权限。若该账号不能创建扩展，请先由数据库管理员在 `campus` 中执行：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

在云托管「设置 → 环境设置 → 资源互联」接入数据库 VPC，并确保数据库安全组允许云托管所属网段到 5432 的连接。不要为了连接方便将数据库开放给整个公网。数据库不应安装在会被替换或缩容的业务容器中。

## 上传与构建

有两种等价方式：

1. 绑定 GitHub 仓库 `wangbo061205/xiaozhe-campus`，分支 `main`，目标目录留空（仓库根目录），Dockerfile 文件选“有”，名称填 `Dockerfile`。根目录与 `deploy/wxcloudrun/` 的构建文件一致，适配控制台同级路径要求。
2. 使用专门生成的「微信云托管上传包.zip」，选择「手动上传代码包」。包内根目录的 `Dockerfile` 会从该 GitHub 仓库下载**固定提交**的源码和知识库、核对 SHA256，再编译，不需要在你的电脑上构建镜像。上传包保持在官方 2 MiB 限制内，不要上传约 92 MB 的 Debian/宝塔服务器包。

两种方式的容器端口均为 **8080**。建议首次联调采用 1 GB 内存、最小 1 个实例；具体可选规格及费用以控制台为准。启用公网访问，才能打开 Web 页面及完成现有 HTTPS 上传。健康检查可配置为 HTTP GET `/api/v1/config/public`，为首次迁移和知识库导入预留至少 180 秒启动时间。

## 环境变量

把 `env.example` 的变量填写到服务的环境变量设置中：

| 变量 | 内容 |
| --- | --- |
| `PORT` | `8080` |
| `SPRING_PROFILES_ACTIVE` | `production,wxcloudrun` |
| `DB_JDBC_URL` | `jdbc:postgresql://数据库地址:5432/campus?sslmode=require`，TLS 参数按数据库要求调整 |
| `DB_USER` / `DB_PASSWORD` | PostgreSQL 账号及密码，密码至少 20 位 |
| `JWT_SECRET` | 至少 48 位随机字符串；部署后保持不变 |
| `APP_ADMIN_PASSWORD` | 16–64 位的后台密码；后台用户名 `admin` |
| `DEEPSEEK_API_KEY` | 现有 AI 模型密钥 |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | 默认 `https://api.deepseek.com` / `deepseek-chat` |
| `XIAOBEI_CLIENT_ID` / `XIAOBEI_CLIENT_SECRET` | 如需校园数据，填已有应用凭证 |
| `COURSE_VISION_BASE_URL` / `COURSE_VISION_API_KEY` / `COURSE_VISION_MODEL` | 云端照片课表识别所需的视觉模型配置；不配置时仍可用 Excel/CSV 和教务导入 |

不要将真实值写进 Dockerfile、GitHub 或代码上传包。`JWT_SECRET` 和数据库密码不能每次发版重新生成；已有管理员账号沿用原密码，环境变量不会重置已修改的密码。

云托管是 Linux，无法沿用本机的 Windows OCR。照片导入需要上述视觉模型的三项配置，普通文字聊天模型密钥不能自动代表它支持图片。

## 知识库与图片

云托管模式首次启动自动导入 8811 篇官方资料，保留原发布时间、链接和来源，重复启动跳过已导入条目，不覆盖管理员编辑。导入在一个事务里执行，失败回滚；并发启动的实例通过数据库锁串行检查，避免互相重复导入。

该模式把处理后的失物招领图片存入 PostgreSQL 的 `lost_found_image_content` 表。图片上传仍剥离 EXIF，未审核图片仍只对上传者和管理员可读。容器临时磁盘不作为图片的最终存储，无需额外购买挂载盘。图片会占用数据库空间，数据库备份同时包含这些图片。

新建云环境包含官方知识种子，不包含你电脑上的旧聊天、课表和私人图片。若要迁移已有服务器的用户数据，需要先备份和迁移 PostgreSQL，并单独迁移原文件模式的图片；不要直接删除旧服务。

## 小程序和 Web 连接

部署成功后，使用控制台给出的真实 HTTPS 域名。浏览器应可以打开：

```text
https://实际服务域名/api/v1/config/public
https://实际服务域名/xiaozhe.html
https://实际服务域名/admin.html
```

本项目保留 HTTPS 请求以支持 AI 长请求、图片和课表文件上传。微信官方文档列出的 `wx.cloud.callContainer` 超时上限为 15 秒，直接把现有同步 AI 请求换成它会造成截断，因此本版本不盲目替换。

在微信公众平台配置该域名为 `request`、`uploadFile`、`downloadFile` 合法域名。按控制台当前规则绑定正式自有域名后，可继续使用原 `xiaozhe.mxqi.cn`。若更换地址，在项目根目录执行：

```sh
node scripts/configure-wxcloudrun.mjs --url https://实际服务域名
```

该命令备份并同步 `miniprogram/config.js` 的真机和模拟器地址，避免模拟器仍偷偷连接 `localhost`。现有微信工程可加 `--config "C:/Users/wangbo/WeChatProjects/miniprogram-2/config.js"`，然后重新编译、上传小程序。

最后用手机流量验证聊天、校园地点、课表文件和图片上传。地图仍是「选目的地 → 出发 → 微信地图的导航菜单」，由手机上的地图应用完成路线规划。

## 发布后

不需要每天重新部署，也不需要用户电脑开机。只有修改代码或服务配置时才发新版本。数据库必须持续保留；不要将删除环境或数据库当作重启。规格调整、环境套餐及数据库费用由平台按实际规则收取。

## 官方依据

- [部署发布与代码包限制](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/service/online.html)
- [小程序调用及超时限制](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/call/mini.html)
- [Web 通过公网 HTTPS 访问](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/call/web.html)
- [资源互联排查](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/scene/noun/vpc.html)
