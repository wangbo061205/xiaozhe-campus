# 小折校园 AI 助手

折丹队项目：原生微信小程序、小折 Web 聊天页、管理员后台及 Spring Boot 服务。

## 目录

- miniprogram/：实际微信小程序；
- src/main/resources/static/：小折 Web 页与管理后台；
- src/main/java/、src/main/resources/db/migration/：后端与数据库迁移；
- knowledge/：官网公开知识资料的压缩种子和导入脚本；
- deploy/production/：正式部署与宝塔 Nginx 方案；
- deploy/wxcloudrun/：微信云托管的构建文件、PostgreSQL 接入及操作说明；
- src/test/、tests/：Java 和小程序逻辑测试；
- docs/：功能和第三方许可说明。

## 本地开发

需要 JDK 21+、Maven 3.9+、Node.js、PostgreSQL 16 和微信开发者工具。
先运行 docker compose up -d postgres，再运行 mvn test 和 mvn spring-boot:run。
Web 聊天页：http://127.0.0.1:8080/xiaozhe.html；后台：http://127.0.0.1:8080/admin.html。
微信开发者工具打开 miniprogram/。模拟器默认连接本机；真机默认连接 https://xiaozhe.mxqi.cn，服务器需正确部署后端并配置微信合法域名。其他部署可修改 miniprogram/config.js。
小程序逻辑测试：node --test tests/*.test.cjs。

生产部署详见 deploy/production/README.md。宝塔 Nginx 已占用 80/443 时，可使用 deploy/production/compose.baota.yml，由宝塔反向代理到 http://127.0.0.1:18080。

提供给服务器管理员的预编译包说明见 deploy/production/SERVER_BAOTA.md。运行 Maven 打包后，可用 `python scripts/package-server.py --output 小折服务器部署包.zip` 生成包含 JAR、知识库、备份与验收脚本的部署包；启动时使用包内 `sh deploy/production/deploy-baota.sh`。

微信云托管部署见 [deploy/wxcloudrun/README.md](deploy/wxcloudrun/README.md)。启用 `production,wxcloudrun` 后，8811 篇官方知识自动导入 PostgreSQL，图片也存入数据库，容器重启不依赖原机器的磁盘。需要独立 PostgreSQL，不能直接使用模板 MySQL。云端正常运行后，电脑关机不影响访问。

## 地图无需位置接口申请

地图只需选择目的地，点击“出发”打开微信内置地图，再点“导航”选择手机上可用的地图应用。小程序只传公开目的地坐标，不获取设备位置，不再请求校园路线；支持已保存地点的导航交接。实际地图应用列表由微信及手机系统提供，详见 docs/MAP_NAVIGATION.md。

## 安全与来源

仓库不含真实 API 密钥、后台密码、访客凭证、数据库、私有上传图片和日志。部署时使用 deploy/production/.env.example 在服务器本地生成 .env，勿提交。
此前截图中暴露过的密钥应由持有者撤销并轮换。
小折 Web 页参考 Trianon，图标使用 Lucide；许可见 docs/THIRD_PARTY_NOTICES.md。官网资料保留学校来源与版权归属。
