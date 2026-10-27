# 可选云同步与分享

架构：同域 Worker 同时提供 Vite 静态资源和 `/api/*`，D1 保存会话、版本指针和分享记录，私有 R2 保存不可变 JSON 与附件。不启用云服务时，原有 IndexedDB 本地模式和 GitHub Pages 部署仍可使用。

## 已实现

- GitHub OAuth 身份登录（不申请仓库权限）；密钥仅在 Worker，GitHub token 只用于读取身份，不存入前端或数据库。
- HttpOnly、SameSite=Lax 会话 cookie，HTTPS 下 Secure；OAuth state 校验；写接口校验 Origin。
- 一个账号同步一个完整工作区，包含嵌套画布与附件；视口及导航位置保留在各设备本地。
- 编辑后约 1.5 秒同步；每 15 秒、窗口重新聚焦、恢复网络时检查云端。持续编辑也会由周期检查触发上传。
- 本地缓存继续由 IndexedDB 自动保存；离线显示错误，恢复网络后重试。云端版本变化且本地也有改动时暂停，不自动合并。
- D1 条件更新版本号，旧版本提交返回 409；用户可备份本地并采用云端，或明确选择以本地创建新版本。采用云端前在 IndexedDB 留一份恢复副本，可在面板下载。
- 分享整个工作区已提交的固定快照，支持 1/7/30 天及永久；令牌为 256 位随机值，数据库仅存 SHA-256。修改原画布不改变旧分享。
- 访客独立只读视图：平移、缩放、子画布、分组、连线、文本、任务、图片和附件下载；可下载 JSON 或备份本地后复制分享。
- 私有附件按账号隔离、SHA-256 校验；分享只能读取快照引用的附件，每次读取重新校验撤销/过期状态，不签发长效公开地址。
- API 每 IP 每分钟约 120 次请求（Cloudflare Rate Limiting 的分布式近似限制）；JSON 5 MB、单附件 25 MB、最多 10000 元素、32 层嵌套。

## 本地运行

```sh
npm ci
npm run build
npm run db:local
cp worker/dev.vars.example .dev.vars
# 填写测试用 GitHub OAuth App 的 client ID 和 secret
npm run dev:cloud
```

访问 `http://localhost:8787`。GitHub OAuth App 的 Authorization callback URL 设置为 `http://localhost:8787/api/auth/callback`。`.dev.vars` 已忽略，不提交密钥。Vite 的 `npm run dev` 仅运行本地模式；联调云服务使用 `dev:cloud`。

## 部署 Cloudflare

需要自己的 Cloudflare 账号、已开通的 R2，以及 GitHub OAuth App。使用 Wrangler 已有登录或 `CLOUDFLARE_API_TOKEN`（仅部署环境）认证。

```sh
npx wrangler d1 create yua-canvas
npx wrangler r2 bucket create yua-canvas-private
```

将返回的 D1 ID 写入 `wrangler.jsonc` 的 `database_id`；设置 `APP_ORIGIN` 为最终 HTTPS 来源（不带尾斜杠及子路径）。R2 不开启公共访问。此部署以站点根路径提供应用，使用专属 Worker 域名或自定义域名。

在 GitHub 创建生产 OAuth App：主页为上述来源，回调为 `https://你的域名/api/auth/callback`。本地和生产应使用不同 OAuth App。

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler d1 migrations apply yua-canvas --remote
npm run deploy:cloud
```

GitHub Pages 继续作为本地模式入口；云同步需使用 Worker 站点域名。没有配置跨域 cookie 或跨域 API，不把 Cloudflare 密钥或 OAuth secret 放进 Vite 环境变量。

## 验证

```sh
npm run build
npm run check:worker
npm test
npm run test:cloud
```

`test:cloud` 启动真正的本地 workerd、D1、R2，在独立 `work/cloud-test-state` 下用 SQL 植入测试会话，无认证后门；验证并发冲突、版本快照、分享过期/撤销、账号隔离和附件校验。测试不调用真实 GitHub 或 Cloudflare 生产资源。

## 当前边界与运维

这是快照同步第一版，不包含实时共同编辑、密码分享、团队权限或多工作区列表。分享展示是独立阅读视图，不包含编辑器的全部附件预览交互。

附件先经 Worker 流式读取并限长后写 R2，尚未实现预签名直传；适合当前 25 MB 限制，未来大文件应改为上传任务与预签名直传。

历史版本不自动删除，避免破坏既有分享；失败上传、未引用附件和过期会话尚无定时回收。当前没有账号总存储配额；公开推广前需要增加配额与保留/垃圾回收策略，并配置 Cloudflare 用量告警。Rate Limiting 不能替代总存储预算。

持链接可读不等于禁止转发；撤销阻止后续请求，无法收回已下载内容。不要在埋点或错误日志记录完整分享令牌。网页前端发生 XSS 时仍可能以用户身份发请求，Cookie HttpOnly 不能替代前端输入安全。

真实 GitHub 授权和生产读写需部署后用两个账号/设备验收：设备 A 登录上传，B 登录同账号拉取；双方离线修改后重连出现冲突；无痕窗口打开分享，撤销后新请求失败。
