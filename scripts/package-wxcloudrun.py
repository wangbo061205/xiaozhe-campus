"""Create a small WeChat Cloud Run upload that builds one verified GitHub commit."""
import argparse
import datetime
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "wangbo061205/xiaozhe-campus"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        raise RuntimeError("Output exists; choose another filename")
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip():
        raise RuntimeError("Commit and push the tested source before packaging")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RuntimeError("Invalid source commit")
    url = f"https://codeload.github.com/{REPOSITORY}/tar.gz/{commit}"
    request = urllib.request.Request(url, headers={"User-Agent": "xiaozhe-wxcloudrun-packager"})
    with urllib.request.urlopen(request, timeout=90) as response:
        archive = response.read(50 * 1024 * 1024 + 1)
    if len(archive) > 50 * 1024 * 1024:
        raise RuntimeError("Unexpected source archive size")
    digest = hashlib.sha256(archive).hexdigest()
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as source:
        names = source.getnames()
        required = ["pom.xml", "src/main/resources/application-wxcloudrun.yml",
                    "src/main/java/cn/edu/nun/campus/knowledge/OfficialKnowledgeSeed.java",
                    "knowledge/official-knowledge.csv.gz"]
        if not all(any(name.endswith("/" + item) for name in names) for item in required):
            raise RuntimeError("The published source commit is incomplete")
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    if dockerfile != (ROOT / "deploy/wxcloudrun/Dockerfile").read_text(encoding="utf-8"):
        raise RuntimeError("Root and cloud build recipes differ")
    context_copy = "COPY pom.xml ./\nCOPY src ./src\n"
    if dockerfile.count(context_copy) != 1:
        raise RuntimeError("Unrecognized build recipe")
    download = (f"ADD {url} /tmp/source.tar.gz\n"
                f"RUN echo '{digest}  /tmp/source.tar.gz' | sha256sum -c - \\\n"
                "    && tar -xzf /tmp/source.tar.gz --strip-components=1 -C /build \\\n"
                "    && rm /tmp/source.tar.gz\n")
    dockerfile = dockerfile.replace(context_copy, download).replace(
        "COPY --chown=campus:campus knowledge/official-knowledge.csv.gz",
        "COPY --from=build --chown=campus:campus /build/knowledge/official-knowledge.csv.gz")
    info = {
        "product": "小折 / 折丹agent", "sourceRepository": REPOSITORY, "sourceCommit": commit,
        "sourceArchive": url, "sourceArchiveSha256": digest,
        "createdAt": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
        "port": 8080, "javaRelease": 21, "database": "PostgreSQL 14+; external managed database required",
        "knowledgeArticles": 8811, "imageStorage": "PostgreSQL BYTEA",
        "includesCredentials": False, "requiresBuildNetwork": True,
        "cloudDeploymentPerformed": False,
    }
    note = """微信云托管上传说明

1. 选择 Spring Boot，新建或进入小折的服务。
2. 本包是手动上传代码包，大小小于 2 MiB。
3. 构建目录留空；Dockerfile 填 Dockerfile；容器端口填 8080。
4. 根据 README.md 接入独立 PostgreSQL，并填写 env.example 中的环境变量。
5. 本包从 GitHub 下载固定提交并校验后编译，包含小折 Web、后台及 8811 篇知识种子。
6. 部署成功后，将实际 HTTPS 域名提供给项目维护者，更新小程序并配置微信合法域名。

不要上传 92 MB 的宝塔服务器包，不要把 MySQL 当 PostgreSQL，不要将真实密钥提交 GitHub。
电脑关机后，云托管服务继续运行；具体费用以控制台套餐和所选数据库为准。
"""
    payload = {
        "Dockerfile": dockerfile,
        "README.md": (ROOT / "deploy/wxcloudrun/README.md").read_text(encoding="utf-8"),
        "env.example": (ROOT / "deploy/wxcloudrun/env.example").read_text(encoding="utf-8"),
        "service.json": (ROOT / "deploy/wxcloudrun/service.json").read_text(encoding="utf-8"),
        "BUILD-INFO.json": json.dumps(info, ensure_ascii=False, indent=2) + "\n",
        "先看这里.txt": note,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for name, text in payload.items():
            package.writestr(name, text.replace("\r\n", "\n").encode("utf-8"))
    if output.stat().st_size > 2 * 1024 * 1024:
        raise RuntimeError("The upload exceeds the platform's 2 MiB limit")
    with zipfile.ZipFile(output) as package:
        if package.testzip():
            raise RuntimeError("Invalid upload archive")
    output.with_suffix(".部署说明.txt").write_text(note, encoding="utf-8-sig")
    output.with_suffix(".sha256.txt").write_text(
        f"{hashlib.sha256(output.read_bytes()).hexdigest()}  {output.name}\n", encoding="utf-8")
    print(json.dumps({"package": str(output), "bytes": output.stat().st_size,
                      "sourceCommit": commit, "knowledgeArticles": 8811}, ensure_ascii=False))


if __name__ == "__main__":
    main()
