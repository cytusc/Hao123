# API

所有接口位于 `/api`，响应为 JSON，错误结构为 `{"error":"中文提示"}`。写请求携带 `Content-Type: application/json`（有请求体时）及 `X-Hao123-Request: 1`。登录后使用同源会话 Cookie。无有效会话返回 401，无管理权限返回 403，重复邮箱/网址或关联资源冲突返回 409。

用户登录与后台登录相互独立，账号类型须与登录接口匹配。用户 Cookie 为 `hao123_session`（Path `/`），后台 Cookie 为 `hao123_admin_session`（Path `/api/admin`）；后台登录、退出不会替换或撤销首页用户会话。旧版本的管理员用户 Cookie 不再用于首页登录。

| 方法         | 路由                             | 权限 / 行为                                                             |
| ------------ | -------------------------------- | ----------------------------------------------------------------------- |
| GET          | `/health`                        | 公共；验证数据库连通                                                    |
| GET          | `/catalog`                       | 公共；分类及已上架网站                                                  |
| POST         | `/auth/register`                 | 公共；`{email,password,name}`，注册并登录                               |
| POST         | `/auth/login`                    | 公共；`{email,password}`                                                |
| POST         | `/auth/logout`                   | 撤销当前会话                                                            |
| GET          | `/auth/me`                       | `{user:...}`，未登录时为 null                                           |
| PUT          | `/auth/password`                 | 用户；`{current,next}`，撤销旧会话并签发当前会话                        |
| POST         | `/auth/forgot-password`          | 公共；`{email}`，有效请求统一 200 与同一提示（IP 限流时 429）             |
| POST         | `/auth/reset-password`           | 公共；`{token,password}`，消费令牌、更新密码并撤销全部会话              |
| GET          | `/auth/verify?token=...`          | 公共；消费验证令牌，设置 `user.verified=true`                           |
| POST         | `/auth/resend-verification`      | 用户；重发邮箱验证邮件，邮件服务未配置返回 503                          |
| POST         | `/admin/auth/login`              | 管理账号；`{email,password}`，签发独立后台会话                          |
| POST         | `/admin/auth/logout`             | 仅撤销后台会话，不影响首页用户登录                                      |
| GET          | `/admin/auth/me`                 | 后台账号状态，未登录时 user 为 null                                     |
| PUT          | `/admin/auth/password`           | 管理员；`{current,next}`，撤销旧会话并签发后台会话                      |
| GET / PUT    | `/preferences`                   | 用户；读取 / 整体保存首页配置                                           |
| GET          | `/admin/metrics`                 | 管理员；近 7 天账户/同步事件、可观测 WAU、比率、14 日操作基线与采集质量 |
| DELETE       | `/history`                       | 用户；清除使用统计                                                      |
| GET          | `/privacy/tags`                  | 用户；`{tags:[{siteId,name,categoryId,category,clicks}]}`，仅自己的汇总标签 |
| DELETE       | `/privacy/tags/{siteId}`          | 用户；删除该网站对应的兴趣统计，幂等，不影响其他用户                    |
| POST         | `/clicks`                        | 用户；`{siteId}`，隐私关闭时返回 `recorded:false`                       |
| GET          | `/recommendations`               | 公共；`{common,sites,method}`，每个网站包含理由                         |
| GET / POST   | `/submissions`                   | 用户；查看自己的投稿 / 提交 `{name,url,categoryId,description}`         |
| GET          | `/admin/overview`                | 管理员；真实数量和汇总排行                                              |
| GET / POST   | `/admin/sites`                   | 管理员；全部网站（含下架）/ 新增                                        |
| PUT / DELETE | `/admin/sites/{id}`              | 管理员；编辑 / 删除                                                     |
| POST         | `/admin/categories`              | 管理员；新增分类                                                        |
| PUT / DELETE | `/admin/categories/{id}`         | 管理员；编辑 / 删除，仍有关联资源时不可删除                             |
| GET          | `/admin/users`                   | 管理员；用户列表                                                        |
| PATCH        | `/admin/users/{id}`              | 管理员；`{disabled:true/false}`，不可停用管理员                         |
| GET          | `/admin/submissions`             | 管理员；全部投稿                                                        |
| POST         | `/admin/submissions/{id}/review` | 管理员；`{status:"approved"/"rejected",note}`，审核和发布在同一事务完成 |

首页配置示例：

```json
{
  "pinned": ["bilibili"],
  "hidden": [],
  "custom": [],
  "personalized": true,
  "largeText": false,
  "showSearch": true,
  "engine": "baidu",
  "version": 0
}
```

最多置顶 9 项、隐藏 200 项、自定义 100 项。自定义网站 ID 使用 `custom-` 前缀，字段为 `id,name,url,mark,color` 等网站字段。搜索引擎支持 `baidu`、`bing`、`google`。

`GET /preferences` 返回当前整数 `version`。`PUT /preferences` 必须携带该版本，成功返回完整配置与递增后的版本；缺失、null 或负数返回 400，过时版本返回 409 且不改写配置。发生 409 后重新 GET，再由用户选择采用云端、使用本机或合并，后两种操作仍带最新版本保存。前后端须一起部署；旧客户端不带版本的请求不会覆盖云端。

新账号默认 `verified:false`，仍可登录使用导航；注册尝试发送验证邮件，失败时用户可在账号设置中重发。验证令牌有效 24 小时，重置令牌有效 1 小时；仅存 SHA-256 摘要。成功重发会使同用途旧令牌失效；SMTP 失败回滚令牌变更，保留旧链接。过期、伪造、用途不符、已使用及停用账号的令牌统一返回 400。重置成功也验证邮箱并使所有邮件令牌失效；普通改密会使重置令牌失效。公共找回流程只服务普通用户，管理员继续通过后台改密。

邮件链接使用 `/auth/verify#token=...`、`/auth/reset-password#token=...` 页面，令牌不会随页面请求发送；页面打开后移除 URL 中的令牌，用户确认后再请求 API。邮件服务未配置或投递失败时，找回接口仍返回统一提示，服务端记录不含邮箱或令牌的错误类型。SMTP 接受邮件不代表最终进入收件箱，正式上线前需验证真实供应商投递。

登录的密码校验与会话签发、改密与当前会话签发均在用户行锁事务中执行。旧密码登录与重置并发时，要么先创建的会话被重置撤销，要么登录读取新密码后失败，避免撤销后又创建旧密码会话。SMTP 发送为同步操作（最多约 8 秒），发信时锁定该用户行；较大规模应迁移至事务发件箱与异步投递。

标签按网站返回分类与累计命中数，前端按分类汇总展示并支持逐网站删除；包含已下架网站的已有统计。删除或清空后重新请求推荐即可生效。关闭个性化不自动删除历史统计，但停止新增记录以及将该用户统计用于个性化、匿名热门和相似访问。

网站写入字段为 `name,url,categoryId,mark,color,description,status,sort`，状态支持 `approved` / `disabled`，颜色为六位十六进制值，排序为 0–10000。分类字段为 `id,name,icon,sort`；编辑时 ID 由路由确定。注册密码为 8–72 字节。URL 仅允许公开 HTTP(S) 地址，不允许嵌入账号密码、本机及私有 IP。

## 管理度量

`GET /api/admin/metrics` 使用独立管理员 Cookie 与鉴权，响应沿用 `Cache-Control: no-store`。各数据库计数在同一只读 repeatable-read 事务中生成；不返回用户级明细。

| 字段 | 口径 |
| --- | --- |
| `window` | `as_of/start/end` 为同一滚动 7×24 小时窗口，`timezone=Asia/Shanghai`，`kind=rolling_7_days` |
| `north_star` | `wau_observed`：当前启用个性化普通用户中，近 7 天有公共网站已记录点击的人数；`wau_personalized_observed` 再要求当前 custom 或 pinned 非空；`personalized_config_users` 为所有启用普通账号中有配置的人数 |
| `events_7d` | 九类成功/请求事件，另含 `forgot_request_eligible`（匹配启用普通账号且邮箱限流通过）与 `forgot_mail_accepted`（SMTP 接受且令牌事务成功） |
| `rates` | `conflict_rate=prefs_conflict/(prefs_save+prefs_conflict)`；`recovery_event_ratio=reset_success/forgot_request_eligible`；`verified_rate=verified_users/users`，零分母为 null |
| `totals` | 当前启用普通账号的 `users/verified_users`，不含管理员或停用用户；重置也会验证邮箱 |
| `daily` | 最近 14 个北京时间自然日中有事件的日期及种类计数；无数据日期省略，数组为空表示未积累基线，与滚动窗口不同 |
| `quality` | 定义版本、采集开始时间、best_effort、90 天保留期限、最后清理时间及过期状态；`*_failures_process` 为当前进程自启动后的故障数，多实例不合并、重启不保留 |

不采集逐条点击；活动证据复用 `user_site_stats.last_clicked`。关闭个性化、删除标签或清空会影响可观测样本，私人网址和游客不可观测；不计算严格次周留存。`recovery_event_ratio` 不是流程归因转化率，重复与跨窗口请求可能使其超过 1，不截断数值。验证、重置及登录失败不计成功事件，版本格式无效不计保存或冲突事件；`forgot_request` 在 IP 限流与解码通过后计数，邮箱限流、无匹配和发信失败通过枚举区分，客户端始终保持统一找回响应。

payload 为固定字段白名单，只允许找回匹配状态与投递结果；没有邮箱、IP、UA、令牌、站点 ID、网址或画像内容。事件写入失败不改变已完成业务，最多独立等待 250ms；后台及日志显示漏记。清理任务在启动与每 24 小时执行，90 天以上明细按北京时间日期归档至 `metric_daily_totals` 再原子删除，归档不含用户标识。故障时保留源事件并告警；26 小时未成功清理为 overdue。

登录 / 注册、修改密码、邮件验证 / 重发、密码找回 / 重置和点击接口有限流。找回按 IP（10 次 / 15 分钟）与邮箱（3 次 / 15 分钟）限制，邮箱级限制仍返回统一 200。当前限流保存在 API 进程内，横向扩容时需接入共享限流服务。目录与管理列表当前返回全部数据，后台在客户端搜索与分页；更大规模目录可替换为服务端分页。
