# 小折校园 AI 助手

折丹队项目：原生微信小程序、小折 Web 聊天页、管理员后台及 Spring Boot 服务。

## 目录

- miniprogram/：实际微信小程序；
- src/main/resources/static/：小折 Web 页与管理后台；
- src/main/java/、src/main/resources/db/migration/：后端与数据库迁移；
- knowledge/：官网公开知识资料的压缩种子和导入脚本；
- deploy/production/：正式部署与宝塔 Nginx 方案；
- src/test/、tests/：Java 和小程序逻辑测试；
- docs/：功能和第三方许可说明。

## 本地开发

需要 JDK 21+、Maven 3.9+、Node.js、PostgreSQL 16 和微信开发者工具。
先运行 docker compose up -d postgres，再运行 mvn test 和 mvn spring-boot:run。
Web 聊天页：http://127.0.0.1:8080/xiaozhe.html；后台：http://127.0.0.1:8080/admin.html。
微信开发者工具打开 miniprogram/。模拟器默认连接本机；真机默认连接 https://xiaozhe.mxqi.cn，服务器需正确部署后端并配置微信合法域名。其他部署可修改 miniprogram/config.js。
小程序逻辑测试：node --test tests/*.test.cjs。

生产部署详见 deploy/production/README.md。宝塔 Nginx 已占用 80/443 时，可使用 deploy/production/compose.baota.yml，由宝塔反向代理到 http://127.0.0.1:18080。

## 地图无需位置接口申请

地图改为先选目的地，再从校园地点列表或长按地图选择起点，点击“出发”查看校园和路线全览。小程序不获取设备位置，已移除定位及持续定位接口和权限声明。此版本不提供实时位置跟随；路线仍需已部署的校园接口服务。详见 docs/MAP_NAVIGATION.md。

## 安全与来源

仓库不含真实 API 密钥、后台密码、访客凭证、数据库、私有上传图片和日志。部署时使用 deploy/production/.env.example 在服务器本地生成 .env，勿提交。
此前截图中暴露过的密钥应由持有者撤销并轮换。
小折 Web 页参考 Trianon，图标使用 Lucide；许可见 docs/THIRD_PARTY_NOTICES.md。官网资料保留学校来源与版权归属。
