# 学校官网知识库导入

本次使用用户提供的 `<官网资料目录>\data\articles.jsonl` 作为去重总索引，读取对应 Markdown 正文。原抓取目录不作修改；目录中未进入总索引的文件不重复导入。

## 数据与来源

- 总索引 8,812 篇，可导入 8,811 篇；排除 1 条指向其他学校的“404错误提示”。
- 保留标题、正文、官方原文链接、站点、栏目和原始发布日期。166 篇无原日期，保持未知，导入时间单独保存。
- 661 篇标记为简短正文、图片、附件或抓取内容可能不完整。提示仅表示抓取有限，不能推断附件中未收录的内容。
- 规章制度映射为政策文件，办事流程映射为指南，学校概况/机构/领导映射为部门，常见问答映射为 FAQ，其余为通知/校园资讯；原栏目不丢失。
- 全文保存在后端数据库，AI 按问题检索并选择相关原文片段；不会在每轮对话上传全部资料。

## 管理与使用

打开 <http://127.0.0.1:8080/admin.html>，登录后进入“知识库”。支持全库搜索、类型和状态筛选，每页 50 条，并可翻页。来源处展示原始日期、站点、栏目和原文链接。

在“AI 助手设置”中开启“使用校园知识库回答”。已发布条目参与后续问答，模型实际引用的条目才会出现在小程序来源卡片中。历史通知应按原始发布日期理解，办理事项以学校最新公告为准。

小程序通过同一后端读取资料，用户无需手工登录。模拟器地址为 `http://127.0.0.1:8080`，真机使用 `miniprogram/config.js` 中手机可访问的接口地址；正式发布需配置微信允许的 HTTPS 域名。

## 后续补充抓取

在项目根目录运行，默认只校验，不写数据库：

```powershell
node scripts/import-nmu-knowledge.mjs --source '<官网资料目录>'
```

需要导入时，在当前终端临时设置管理员密码：

```powershell
$env:CAMPUS_ADMIN_PASSWORD = Read-Host '管理员密码' -MaskInput
node scripts/import-nmu-knowledge.mjs --source '<官网资料目录>' --apply
Remove-Item Env:\CAMPUS_ADMIN_PASSWORD
```

`Read-Host -MaskInput` 需要 PowerShell 7。如使用 Windows PowerShell 5.1，请以 `Read-Host -AsSecureString` 读取并仅在子进程环境中传递，不要把密码写进脚本或文件。

`CAMPUS_ADMIN_USERNAME` 默认为 `admin`。本地接口默认 `http://127.0.0.1:8080`，远程地址通过 `--base-url https://...` 指定。

每批最多 100 篇，按 `nmu-official:SHA256(规范URL)` 唯一标识。中断后可重新运行，已有条目跳过，保留管理员编辑和下架状态。相同 URL 的抓取更新不会自动覆盖旧正文；需在后台审核修改。

导入报告位于 `run/knowledge-import/nmu-import-report.json`，记录来源、数量、排除项和完成时间，不保存密码或令牌。导入前的知识表 SQL 备份也放在该目录，属于内部备份，不应作为静态资源公开。

## 接口

- `POST /api/v1/admin/knowledge/import`：仅 ADMIN，整批校验与事务写入，重复跳过。
- `GET /api/v1/admin/knowledge/page`：ADMIN / MODERATOR，可用 `q/status/type/category/site/page/size`，返回 `items/total/page/size`。
- `GET /api/v1/search?q=招生简章`：小程序与公开搜索沿用已有接口。

恢复本地服务可运行 `scripts/start-backend-local.ps1`。本轮不上传微信、不提交审核、不重建桌面压缩包。
