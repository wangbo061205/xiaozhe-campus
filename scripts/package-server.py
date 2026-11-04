"""Create a self-contained server delivery without workstation credentials or client code."""
import argparse
import csv
import datetime
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / "deploy/production"
SERVER_FILES = [
    ".env.example", "init-env.sh", "Dockerfile.runtime", "Dockerfile.runtime.dockerignore",
    "compose.server.yml", "server-common.sh", "deploy-baota.sh", "backup-baota.sh",
    "check-baota.sh", "baota-proxy.conf.example", "SERVER_BAOTA.md",
]
KNOWLEDGE_FILES = ["official-knowledge.csv.gz", "import.sql", "restore-knowledge.sh", "README.md"]
FORBIDDEN_NAMES = {".env", ".devtoken", "project.private.config.json", "xiaobei-private.properties"}
SECRET = re.compile(rb"(?:sk_[A-Fa-f0-9]{40,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})")

FRIEND_NOTE = """给服务器管理员：小折 / 折丹agent 部署

域名：xiaozhe.mxqi.cn
小程序 AppID：wx85bd8cd2e616d9cc

一、把压缩包内容解压到：
/www/wwwroot/xiaozhe.mxqi.cn/
该目录下应直接出现 runtime、knowledge、deploy，不要再多套一层文件夹。
保留 deploy/production/.env 原文件。包里不含真实密钥，不会覆盖它。

二、宝塔终端执行：
cd /www/wwwroot/xiaozhe.mxqi.cn/deploy/production
sh deploy-baota.sh

脚本会先校验、备份原数据库和图片，再更新后端并恢复校园知识库。
如果已有数据库却找不到原 .env，脚本会停下，请先找回原配置。
不要改已有数据库密码，也不要删除数据库卷。

三、宝塔给 xiaozhe.mxqi.cn 这个网站设置反向代理：
代理目录：/
目标 URL：http://127.0.0.1:18080
发送域名：$host
关闭代理缓存，保留本站现有 HTTPS 证书。
只改这个站点，不停 Nginx，不启动原来的 Caddy https 容器。
如果图片、JS、CSS 仍 404，参考 deploy/production/baota-proxy.conf.example。

四、设置好后执行：
sh check-baota.sh

成功后应能打开：
https://xiaozhe.mxqi.cn/api/v1/config/public （JSON code=0）
https://xiaozhe.mxqi.cn/xiaozhe.html （聊天网页）
https://xiaozhe.mxqi.cn/admin.html （管理员后台）

后台账号：admin；已有账号沿用原密码，新环境密码在服务器 .env 的 APP_ADMIN_PASSWORD。
AI 密钥、校园数据凭证保留在服务器 .env，不用发到 GitHub 或聊天截图里。
本包含编译好的 Java 后端和 8811 篇知识库，不用装 Java/Maven；需要 Docker、Compose，能拉取运行镜像。

五、小程序管理员在公众平台配置 request/uploadFile/downloadFile 合法域名：
https://xiaozhe.mxqi.cn
手机使用流量测试聊天、地图导航跳转、图片和课表，再设体验版或审核发布。
地图现在只选择目的地，点击“出发”打开微信地图，再点“导航”选手机上的地图应用。

完整操作和故障定位：deploy/production/SERVER_BAOTA.md
"""


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def copy_file(source, target):
    if source.name in FORBIDDEN_NAMES or source.name.endswith("-private.properties"):
        raise RuntimeError(f"Refusing private file: {source.name}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def validate_jar(file):
    with zipfile.ZipFile(file) as jar:
        required = {"BOOT-INF/classes/static/xiaozhe.html", "BOOT-INF/classes/static/admin.html",
                    "BOOT-INF/classes/application.yml", "META-INF/MANIFEST.MF"}
        if not required.issubset(jar.namelist()):
            raise RuntimeError("The executable JAR is incomplete")
        for entry in jar.infolist():
            if Path(entry.filename).name in FORBIDDEN_NAMES:
                raise RuntimeError("Private configuration found inside JAR")
            if entry.filename.startswith("BOOT-INF/classes/") and not entry.is_dir():
                if SECRET.search(jar.read(entry)):
                    raise RuntimeError(f"Possible live secret inside JAR: {entry.filename}")
        classes = [entry for entry in jar.infolist() if entry.filename.startswith("BOOT-INF/classes/") and entry.filename.endswith(".class")]
        if not classes:
            raise RuntimeError("Missing application classes")
        for entry in classes:
            header = jar.read(entry)[:8]
            magic, minor, major = struct.unpack(">IHH", header)
            if magic != 0xCAFEBABE or major > 65 or minor == 65535:
                raise RuntimeError(f"Class incompatible with Java 21: {entry.filename}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--jar", type=Path, default=ROOT / "target/campus-agent-0.1.0.jar")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        raise RuntimeError("Output already exists; choose another filename")
    if not args.jar.is_file():
        raise RuntimeError("Build first: mvn -B -DskipTests package")
    validate_jar(args.jar)
    with gzip.open(ROOT / "knowledge/official-knowledge.csv.gz", "rt", encoding="utf-8", newline="") as stream:
        rows = csv.reader(stream)
        next(rows)
        article_count = sum(1 for _ in rows)
    if article_count != 8811:
        raise RuntimeError(f"Unexpected official knowledge count: {article_count}")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="xiaozhe-server-", dir=output.parent) as temporary:
        stage = Path(temporary)
        copy_file(args.jar, stage / "runtime/campus-agent.jar")
        copy_file(ROOT / "pom.xml", stage / "pom.xml")
        for source in (ROOT / "src").rglob("*"):
            if source.is_file():
                copy_file(source, stage / source.relative_to(ROOT))
        for name in SERVER_FILES:
            copy_file(DEPLOY / name, stage / "deploy/production" / name)
        copy_file(DEPLOY / "SERVER_BAOTA.md", stage / "README.md")
        for name in KNOWLEDGE_FILES:
            copy_file(ROOT / "knowledge" / name, stage / "knowledge" / name)
        for name in ["THIRD_PARTY_NOTICES.md", "ASSISTANT_CONFIGURATION.md", "COURSE_IMPORT.md", "LOST_FOUND_IMAGES.md"]:
            copy_file(ROOT / "docs" / name, stage / "docs" / name)
        for file in stage.rglob("*"):
            if file.is_file() and file.suffix in {".sh", ".md", ".yml", ".sql", ".example"}:
                text = file.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
                file.write_text(text, encoding="utf-8", newline="\n")
        (stage / "发给朋友的说明.txt").write_text(FRIEND_NOTE, encoding="utf-8", newline="\n")
        info = {
            "product": "小折校园 AI 助手 / 折丹agent", "sourceCommit": commit,
            "createdAt": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
            "targetDomain": "xiaozhe.mxqi.cn", "miniProgramAppId": "wx85bd8cd2e616d9cc",
            "javaRelease": 21, "knowledgeArticles": article_count,
            "databaseVolume": "xiaozhe-campus_postgres_data", "uploadsVolume": "xiaozhe-campus_uploads",
            "backendPort": "127.0.0.1:18080", "includesRealCredentials": False,
            "requiresContainerImagePull": True, "remoteInstallationVerified": False,
        }
        (stage / "BUILD-INFO.json").write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        files = sorted(file for file in stage.rglob("*") if file.is_file())
        sums = []
        for file in files:
            if file.suffix not in {".jar", ".gz", ".webp", ".png", ".jpg"} and SECRET.search(file.read_bytes()):
                raise RuntimeError(f"Possible live secret: {file.relative_to(stage)}")
            sums.append(f"{digest(file)}  {file.relative_to(stage).as_posix()}\n")
        (stage / "runtime/SHA256SUMS").write_text("".join(sums), encoding="utf-8", newline="\n")
        with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for file in sorted(stage.rglob("*")):
                if file.is_file():
                    archive.write(file, file.relative_to(stage).as_posix())
        with zipfile.ZipFile(output) as archive:
            bad = archive.testzip()
            if bad:
                raise RuntimeError(f"Archive failed verification: {bad}")
        note = output.with_suffix(".部署说明.txt")
        note.write_text(FRIEND_NOTE, encoding="utf-8-sig")
        checksum = output.with_suffix(".sha256.txt")
        checksum.write_text(f"{digest(output)}  {output.name}\n", encoding="utf-8")
    print(json.dumps({"archive": str(output), "bytes": output.stat().st_size,
                      "instructions": str(note), "checksum": str(checksum),
                      "knowledgeArticles": article_count}, ensure_ascii=False))


if __name__ == "__main__":
    main()
