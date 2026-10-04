# 单机部署、备份与恢复

需要 Node.js 24、支持 Compose v2 的 Docker，以及一台有持久磁盘的服务器。这个方案运行一个 Node 实例，SQLite、上传文件与历史附件保存在 `/app/data` 的 Docker 命名卷。Caddy 对外提供 HTTPS，Node 同源提供前端构建产物、API、媒体与地图代理。不要增加副本或把数据卷放在共享网络盘上。

MP4 音轨提取需要 FFmpeg。本地 npm 安装 `ffmpeg-static` 时会从包维护者的官方发布地址下载对应平台可执行文件，因此安装时需网络可用；可用 `FFMPEG_BIN` 指向已安装的 FFmpeg。Docker 镜像通过 Debian 安装 FFmpeg 并设置此变量，构建时检查可执行版本，无需在容器里再次下载 GitHub 二进制。转换失败返回错误，不会把 MP4 作为音乐直接保存。

## 首次部署

把域名的 A/AAAA 记录指向服务器，开放 TCP 80/443；需要 HTTP/3 时另开放 UDP 443。复制 `.env.server.example` 为 `.env.server`，设置 `SITE_ORIGIN=https://你的域名`，按需填写 `AMAP_WEB_KEY`、`AMAP_SERVICE_KEY`、`AMAP_SECURITY_CODE`。`SITE_ORIGIN` 是完整 HTTPS 源地址，不含子路径、查询参数或凭据。地图凭据只注入运行容器，不进入镜像、前端构建或备份清单。不要使用 `VITE_` 前缀存后端密钥。生产环境默认 `/app/data`；本地 `.env.server` 的 `SITE_DATA_DIR` 不会覆盖容器数据目录。

以下命令在项目目录运行。每次 Compose 操作都带 `--env-file .env.server`，让 Caddy 与应用使用相同的公开源地址。

```sh
docker compose --env-file .env.server build
# 首次安装：离线导入仓库内的示例内容。只在首次部署或明确需要补导时运行。
docker compose --env-file .env.server run --rm --no-deps app npm run content:migrate
# 自己选择站主账号和密码，不要把密码写在命令或配置文件中。
docker compose --env-file .env.server run --rm --no-deps app npm run owner:init
docker compose --env-file .env.server up -d
docker compose --env-file .env.server ps
```

镜像以非 root 用户运行，应用端口不映射到宿主机，只由 Caddy 访问。`/api/v1/health` 应返回 `ok: true`；首次初始化后 `ownerInitialized` 应为 `true`。浏览器使用公开 HTTPS 地址访问 `/` 与 `/#/admin`。正式使用前检查登录、上传、草稿不可见、发布内容和媒体访问。高德控制台的域名白名单也须对应此域名。

`.dockerignore` 排除 `.env*`、本地数据库、数据目录、备份与依赖。镜像包含前端设计资产和用于首次迁移的虚构资料、原创素材和使用指南，不包含运行中的私有数据。保护 `.env.server` 的权限（Linux 可执行 `chmod 600 .env.server`）。Docker 卷由容器内 UID/GID 1000 的用户写入；若改为宿主机目录挂载，先确保目录由该用户拥有且可写。

## 离线备份

先停止应用、所有迁移和媒体写入操作，以及 `npm run dev:full`、Vite 等开发文件监听器。**不要对运行中站点执行备份**：SQLite 的一致性快照可以包含 WAL 已提交记录，但数据库与媒体文件需要同一离线时点。CLI 的运行锁会拒绝持锁的服务和其他数据命令；第一次升级接入运行锁时，旧版服务可能没有锁，必须人工确认已停止。

本地 Node 方式：

```sh
# 先停止 npm start、npm run dev:full、npm run dev:api 和 Vite。
npm run backup -- --out ../site-backups/snapshot-2026-10-03
```

备份目标必须是不存在的新目录，且与 `SITE_DATA_DIR` 互不包含。源目录与目标的任何路径组件、uploads/legacy 中的文件都不得是符号链接或 Windows junction。先在同级临时目录完成 SQLite `VACUUM INTO` 一致性快照、媒体复制与 SHA-256 清单校验，再原子改名发布快照。输出只收录 `site.sqlite`、`uploads`、`legacy` 和 `manifest.json`；不复制 `.env.server` 或 SQLite 的临时 WAL/SHM 文件。数据库完整性、外键、文件大小和摘要都会检查。

Docker 方式（以下宿主机目录例子适用于 Linux）：

```sh
sudo install -d -m 700 -o 1000 -g 1000 /var/lib/awesome-me-backups
docker compose --env-file .env.server stop app
docker compose --env-file .env.server run --rm --no-deps \
  -v /var/lib/awesome-me-backups:/backups app \
  npm run backup -- --out /backups/snapshot-2026-10-03
docker compose --env-file .env.server up -d app
```

确认命令成功后再恢复服务。Caddy 停机期间可能返回 502。把成功的备份目录整体复制到第二台设备或加密存储，按需要保留多个版本。快照包含站主密码哈希、会话、令牌哈希、草稿、原图及统计数据，必须按私有数据保护；SHA-256 用于发现损坏，不能验证备份来源的身份。只恢复自己的可信备份。地图密钥与其他环境配置另行安全保管。

## 恢复到全新目录

先停止应用、所有数据写入操作及开发文件监听器。恢复不会覆盖已有目录，即使目录为空也会拒绝；先选择新的路径，不要为了恢复而删除原始数据。所有文件、目录与数据库校验成功后才创建目标，复制到临时目录后再次校验，再在目标运行锁保护下安装媒体、最后安装数据库。损坏、缺失、多余文件、路径穿越、符号链接、重复路径都会导致拒绝。

```sh
npm run restore -- --from ../site-backups/snapshot-2026-10-03 --to ../site-data-restored-2026-10-03
```

本地恢复后，在 `.env.server` 中将 `SITE_DATA_DIR` 指向新目录，再运行 `npm start`。数据库版本必须由对应版本应用支持；用与备份匹配的应用版本恢复，升级前先备份。

Docker 可以恢复到原数据卷里的新子目录，保留原始数据：

```sh
docker compose --env-file .env.server stop app
docker compose --env-file .env.server run --rm --no-deps \
  -v /var/lib/awesome-me-backups:/backups:ro app \
  npm run restore -- --from /backups/snapshot-2026-10-03 --to /app/data/restored-2026-10-03
```

成功后在 `.env.server` 添加 `DOCKER_SITE_DATA_DIR=/app/data/restored-2026-10-03`，执行 `docker compose --env-file .env.server up -d app` 重新创建应用容器。检查站主登录、公开内容、草稿、原图与历史附件，再重启应用重复检查持久性。原目录可保留用于回滚；回滚时停止服务、将 `DOCKER_SITE_DATA_DIR` 改回原值并重新创建容器。不要把运行锁目录复制进备份。

## 运行锁与异常退出

服务启动、备份、恢复和迁移会在相应 `SITE_DATA_DIR` 中独占创建 `.site-runtime.lock/owner.json`。第二个操作会拒绝进入，正常关闭会释放自己的锁。不同主机、PID 无法确认或内容异常的锁都会阻止访问。相同主机且 PID 已退出时会提示“遗留锁”；程序不会自动删除，以免误删另一个进程的锁。

遇到遗留锁：先检查锁文件的 PID/主机和容器日志，确认所有站点与数据命令已停止，再**仅移除提示中的 `.site-runtime.lock` 目录**。容器的 PID 命名空间可能使旧 PID 被其他进程复用，不能只凭 PID 判断。非正常退出可能留下 `.名字.staging-UUID` 临时目录或部分恢复目录；保留原数据和成功快照，检查后选择另一个全新的恢复路径重试。运行锁只协调这个应用的入口，不能阻止外部工具直接修改数据。

Windows 如果在最终目录改名阶段遇到 `EPERM`，先退出 Vite 和其他监视备份目录的程序，再选择全新路径重试。目录被文件监听器长期占用时，等待或重复改名不能解除它。建议把备份放在项目目录外；项目内的 data、backups、artifacts 和临时 staging 目录也应从开发监听中排除。清理失败会保留原始操作错误；残留临时目录请在监听器退出后检查，不要误删原数据或已经成功的备份。

## 更新

先离线备份，再构建新镜像、停止旧应用、启动新应用并检查健康与内容。不要运行 `docker compose down -v`：`-v` 会删除数据库、上传文件及 Caddy 证书卷。普通容器重建、镜像更新和 `down` 不删除命名数据卷。源码、镜像、`.env.server` 和备份分别保存，数据迁移只能向前执行，回滚使用对应旧版本的备份和应用。
