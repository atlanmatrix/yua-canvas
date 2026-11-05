# Canvas of Yua for DeepSeek Harness

适用于 DeepSeek Harness **0.2.2-rc.1**（Web 界面）。安装后，左侧导航出现 **Canvas**，打开完整的本地优先无限画布。

## 在 DSH App 中通过 Git 地址安装

在 **Plugins → 添加插件 → Git 地址** 中粘贴：

```text
https://github.com/atlanmatrix/yua-canvas.git#dsh
```

安装并启用后，点击左侧 **Canvas**。`#dsh` 指向包含完整编译资源的插件分支，无需下载 tarball、运行构建命令或允许安装时构建脚本。请保留 `#dsh`；默认 `main` 是开发源码。

CLI 等效命令：

```sh
dsh plugin --profile web add 'https://github.com/atlanmatrix/yua-canvas.git#dsh'
dsh web
```

`main` 的画布或插件源码更新后，[发布工作流](https://github.com/atlanmatrix/yua-canvas/actions/workflows/publish-dsh.yml) 自动构建并更新 `dsh` 分支；已安装的插件需在 DSH 中更新才会取得新版本。本分支的构建来源记录在 Git 提交信息中。

## 从源码安装

在 yua-canvas 仓库根目录执行：

```sh
npm ci
npm run build:dsh
dsh plugin --profile web add /absolute/path/to/yua-canvas/dsh
dsh web
```

`web` 是 `dsh web` 使用的默认配置；若使用自定义 Web profile，请在安装和启动时指定相同的 `--profile`。插件需要 Web UI 的 `connection`、`slots`、`layout` 和 sidebar 服务；不适用于 headless profile。

## 安装包

```sh
npm run pack:dsh
dsh plugin --profile web add /absolute/path/to/yua-canvas/dist/dsh-yua-canvas-1.0.0.tgz
dsh web
```

也可在 DSH 插件管理页安装本地 `dsh/` 目录或生成的 tarball。源码链接安装前需构建 `dsh/app/`；修改画布后重新构建并重启 DSH。卸载：

```sh
dsh plugin --profile web remove dsh-yua-canvas
```

## 数据与行为

开发验证：先 `npm run build:dsh && npm run test:dsh`；已安装 DSH CLI 时，再执行 `npm run pack:dsh && npm run test:dsh:host`，使用临时 profile 实际安装 tarball、启动 DSH 并验证侧栏、认证、PDF 和刷新恢复，不使用 API Key。非全局 CLI 可用 `DSH_BIN=/path/to/dsh npm run test:dsh:host` 指定。

Git 发布验证使用 `npm run test:dsh:publish`；`DSH_TEST_SPEC='https://github.com/atlanmatrix/yua-canvas.git#dsh' npm run test:dsh:host` 实际验证 Git 安装。手动发布可执行 `npm run publish:dsh`；它使用临时 Git index 和普通快进推送，不切换开发分支或改动已有暂存内容。

- 支持现有文本、附件、PDF、Mermaid、分组、嵌套画布、工具、画笔、撤销、JSON/ZIP 导入导出及可选云服务器。
- 数据仍保存在当前 DSH 网站来源的浏览器 IndexedDB 中，默认不发送给模型或 DSH 后端。所有 DSH 工作区共用这个画布；它不是会话附件或按项目存储的文件。
- 从原网站迁移时，在原 Canvas 设置中导出完整 JSON/ZIP，再在 DSH Canvas 中导入。不同域名、协议、端口和浏览器的数据不会自动搬迁。Key、账号会话等本机凭据不会随备份导出，需要重新配置。
- 编辑后约 0.6 秒自动保存；等待设置菜单显示“已保存至本地”后再切换页面。卸载插件保留浏览器数据，清除网站数据会删除画布。
- 画布通过独立 iframe 避免样式和快捷键影响 DSH；剪贴板、下载及应用协议仍受当前浏览器权限限制。
- 插件静态文件逐项注册到 DSH Connection 的认证 `/api/yua-canvas/` 路由，只有已授权的 owner Peer 可以读取；没有新增监听端口，也不直接读取用户文件系统。
- 插件内不注册 Service Worker、不提供 PWA 安装；重新加载插件需要 DSH 可访问。原独立站点继续支持 PWA。
- 当前验证目标为 DSH Web。Electron Desktop 的自定义协议、原生剪贴板和应用跳转尚未验证。

接口依据：[官方插件打包教程](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)、[客户端模块协议](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/README.md)、[Slots](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/slots.md) 与 [Connection](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/connection/README.md)。
