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
| POST         | `/admin/auth/login`              | 管理账号；`{email,password}`，签发独立后台会话                          |
| POST         | `/admin/auth/logout`             | 仅撤销后台会话，不影响首页用户登录                                      |
| GET          | `/admin/auth/me`                 | 后台账号状态，未登录时 user 为 null                                     |
| PUT          | `/admin/auth/password`           | 管理员；`{current,next}`，撤销旧会话并签发后台会话                      |
| GET / PUT    | `/preferences`                   | 用户；读取 / 整体保存首页配置                                           |
| DELETE       | `/history`                       | 用户；清除使用统计                                                      |
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
  "engine": "baidu"
}
```

最多置顶 9 项、隐藏 200 项、自定义 100 项。自定义网站 ID 使用 `custom-` 前缀，字段为 `id,name,url,mark,color` 等网站字段。搜索引擎支持 `baidu`、`bing`、`google`。

网站写入字段为 `name,url,categoryId,mark,color,description,status,sort`，状态支持 `approved` / `disabled`，颜色为六位十六进制值，排序为 0–10000。分类字段为 `id,name,icon,sort`；编辑时 ID 由路由确定。注册密码为 8–72 字节。URL 仅允许公开 HTTP(S) 地址，不允许嵌入账号密码、本机及私有 IP。

登录 / 注册、修改密码和点击接口有限流。当前限流保存在 API 进程内，横向扩容时需接入共享限流服务。目录与管理列表当前返回全部数据，后台在客户端搜索与分页；更大规模目录可替换为服务端分页。
