# 好123 · 轻导航

面向日常使用的网站导航站。首页使用 React + Vite，管理后台使用官方 **shadcn/ui**（Radix UI + Tailwind CSS 4），API 使用 **Go + PostgreSQL**。

已实现：8 类 / 80 个初始网站、站内与外部搜索、常用置顶与自定义网站、注册登录、邮箱验证与密码找回、带版本冲突处理的云端配置、兴趣标签管理、修改密码、网站投稿、后台网站及分类管理、用户启停、投稿审核和规则推荐。管理员修改目录或批准投稿后，首页刷新即可看到。

## 本地启动

需要 Node.js 20.19+、Go 1.23+、PostgreSQL 16 工具、OpenSSL 和 ripgrep。请使用普通用户运行 PostgreSQL。

```bash
npm ci
# 终端 1：创建项目专用开发数据库并启动 API
npm run backend
# 终端 2：启动前端
npm run dev
```

首页：http://localhost:5173；后台：http://localhost:5173/admin；健康检查：http://localhost:8080/api/health。

后台账号为 `admin@hao123.local`，首次启动生成的随机密码保存在 `.local/admin-password`。该文件和 `.local/backend.env` 均已忽略，不进入 Git。后续启动不会重置已有管理员密码。

首页仅提供普通用户登录、注册和账号设置，不显示后台入口或管理相关说明。后台需直接访问 `/admin`，仅支持管理员登录。两端使用独立登录接口和会话 Cookie，在同一浏览器中可以分别登录，互不替换账号，退出任意一端不会影响另一端。普通用户可在首页账号弹窗修改密码；管理员可通过 `/api/admin/auth/password` 修改密码。

开发脚本默认使用 `/usr/lib/postgresql/16/bin`，其他安装位置可通过 `PG_BIN` 指定。它使用 `.local/postgres`、端口 `55432`，不会修改系统 PostgreSQL 实例。开发数据库仅监听本机，使用 trust 认证，仅适用于本地开发。停止开发数据库：

```bash
/usr/lib/postgresql/16/bin/pg_ctl -D .local/postgres stop
```

使用现有数据库时，可根据 `backend/.env.example` 设置环境变量，并在 `backend` 目录运行 `go run .`。API 自动创建表并首次导入目录；后续启动保留后台编辑。

## 构建与部署

```bash
npm run build
cd backend
go build -o hao123-api .
# 先设置 DATABASE_URL、APP_ORIGINS、COOKIE_SECURE 等环境变量
./hao123-api
```

Go 服务可通过默认 `STATIC_DIR=../dist` 同时提供首页、`/admin` 和 API。环境变量不会自动从 `.env` 文件加载，需由 shell 或进程管理器导入。前端开发和 `npm run preview` 均代理 `/api` 到本机 8080。

| 环境变量                         | 用途                                                              |
| -------------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                   | PostgreSQL 连接串；生产数据库启用密码认证，按部署环境配置 TLS     |
| `HTTP_ADDR`                      | 默认 `127.0.0.1:8080`                                             |
| `APP_ORIGINS`                    | 允许发起写请求的页面 Origin，逗号分隔，须包含完整协议、域名及端口 |
| `COOKIE_SECURE`                  | HTTPS 部署设置为 `true`                                           |
| `STATIC_DIR`                     | 前端构建目录，默认 `../dist`，相对于 API 启动目录                 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 首次创建管理员；已有账号不重置，创建后可从部署环境移除            |

生产环境通过 HTTPS 反向代理同源提供页面及 API，设置实际域名对应的 `APP_ORIGINS`。会话使用 HttpOnly / SameSite Cookie；密码使用 bcrypt，数据库仅存会话令牌摘要。写请求需携带 `X-Hao123-Request: 1`，跨站 Origin 会被拒绝。注册账号始终为普通用户，管理权限由服务端检查；停用用户和修改密码会撤销其已有会话。

## 推荐与隐私

- 近期常用：点击分数按 **7 天半衰期**衰减，结合访问频次排序。
- 发现网站：结合分类偏好、相似访问用户的共同使用网站及匿名汇总热度，返回推荐理由；排除隐藏、置顶和已经访问的网站。
- 冷启动：使用精选目录及汇总热度，不显示虚构点击统计。
- 登录后仅保存网站级汇总次数、衰减分数及最后访问时间，不记录逐条浏览轨迹。相似访问使用过去 30 天有共同访问的网站，最多选取 100 位相似用户。
- 关闭「自动整理常用」后，服务端停止保存新的点击，也停止使用该用户的数据参与个性化、汇总热度和相似访问。已有记录可通过「清空使用记录」删除。
- 游客配置与使用记录保存在当前浏览器；登录后配置保存在账号中，可主动导入本机常用。自定义私人网址不进入公共目录或公共推荐。

当前是可解释的规则推荐，没有训练模型；目录搜索在浏览器中完成。账号设置提供推荐开关与按分类展示的兴趣标签，可逐网站删除或清空。配置同步携带版本号，多设备冲突时提供采用云端、使用本机或合并三种选择，合并保留任一设备的隐私关闭选择。第三方登录和运营算法参数编辑尚未实现。

## 邮件验证与账号找回

按 `backend/.env.example` 配置 `SMTP_HOST`、`SMTP_PORT`、`SMTP_FROM`、`SMTP_USERNAME`、`SMTP_PASSWORD` 与 `APP_PUBLIC_URL` 后重启 API。公共页面地址须为站点完整 Origin，HTTPS 部署使用 `https://`；链接由该配置生成，不使用请求 Host。端口 465 使用隐式 TLS，其他端口要求 STARTTLS；`SMTP_ALLOW_INSECURE=true` 仅允许连接本机测试邮箱。

注册后仍可立即使用账号，账号设置显示邮箱状态并提供验证邮件重发；登录弹窗提供「忘记密码」，邮件打开专用验证或重置页面。令牌只存摘要、到期失效、不可复用；重置撤销所有设备会话。邮件未配置时保留基础注册登录，重发提示服务不可用，找回返回统一提示，避免通过响应内容泄露邮箱存在性。正式启用找回需配置真实邮件凭据，并检查发件域名与实际收件投递；当前已验证本机 SMTP 收件链路。

本次数据库更新将 `users.verified`、`users.prefs_version` 和 `email_tokens` 放入同一初始化事务，已有账号默认未验证、配置版本从 0 起步；重复启动不会重置已有配置。同步接口现在要求 `version`，前后端须一起部署，并提醒旧页面刷新。此变更使用增量列迁移与条件更新，无影子表双写。

## 验证

```bash
npm run build
npm run test:backend
npm run test:sync
# 使用可创建临时 schema 的测试数据库账号，运行完整 PostgreSQL 集成测试
cd backend
TEST_DATABASE_URL='postgres://ubuntu@127.0.0.1:55432/hao123?sslmode=disable' go test ./... -count=1 -v
go vet ./...
```

未设置 `TEST_DATABASE_URL` 时跳过数据库集成测试；集成测试在独立临时 schema 中执行，结束后清理。测试覆盖认证、权限、CSRF、隐私开关与标签删除、相似访问推荐、目录 CRUD、投稿审核、配置版本与并发冲突、邮件验证、密码找回与令牌过期 / 复用、并发登录与重置时的会话撤销。`npm run test:sync` 验证合并去重、隐私开关与数量上限。

API 路由见 [backend/API.md](backend/API.md)，界面设计见 [DESIGN.md](DESIGN.md)。shadcn/ui 源码位于 `src/components/ui`，组件配置见 `components.json`，来源与 MIT 许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
