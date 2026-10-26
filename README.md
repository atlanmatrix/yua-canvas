# Yua Canvas

一个纯前端、数据保存在浏览器本地的无限灵感画布。无需账号、服务器或 API 密钥。

## 开发

需要 Node.js 22.12+（当前环境验证版本为 Node.js 24.19.0）。

```sh
npm ci
npm run dev
```

```sh
npm run build       # TypeScript 检查和生产构建，输出到 dist/
npm run preview     # 本地预览生产构建
npx playwright install chromium
npm test            # 浏览器端功能测试
```

`dist/` 可以部署到任意静态网站托管服务。开发服务默认监听所有网卡，仅用于开发。

## GitHub Pages 自动部署

仓库已配置 `.github/workflows/deploy-pages.yml`：推送到 `main` 时自动构建并部署，也可以在 Actions 中手动运行 **Deploy to GitHub Pages**。

首次使用需在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**，并确保仓库允许 Actions 运行。若仓库或组织策略要求审批部署，请按 GitHub 提示处理。

工作流使用 Node.js 24 和 `npm ci`，根据 Pages 配置自动设置 Vite 的部署子路径，上传 `dist/` 并部署。默认项目地址为 <https://atlanmatrix.github.io/yua-canvas/>；实际地址以成功部署后的 Actions 输出为准。GitHub Pages 的可用性受仓库可见性、账号方案及组织策略影响。

本地验证相同的子路径构建：

```sh
npm run build -- --base /yua-canvas/
npm run preview -- --base /yua-canvas/ --port 4173 --strictPort
```

浏览器本地开发地址与 Pages 地址的数据互不共享；需要使用导出/导入迁移画布。

## 使用

- 添加文字笔记、批量上传图片和任意文件，或直接拖入文件。
- 在画布中按 Cmd/Ctrl + V 粘贴剪贴板中的图片（包括截图）和文件，支持批量粘贴。可粘贴的文件类型取决于操作系统和浏览器是否向网页提供文件数据；输入框和编辑弹窗中保留原生粘贴行为。
- 拖动卡片定位；空白处拖动框选；Shift + 点击多选。
- 按住空格拖动画布，或使用移动工具；滚轮平移，Ctrl/⌘ + 滚轮缩放。
- 点击卡片右上角箭头或双击卡片查看全文、原图、PDF、音视频；其他文件提供原文件下载。
- 多选后创建并命名分组；侧栏支持按类型和分组筛选、重命名/解散分组。
- 自动保存到 IndexedDB，包括原始附件；导出 JSON 包含所有卡片、附件和分组，可重新导入。导入需要确认并替换当前画布。

## 数据说明

数据仅存于当前浏览器、当前网站来源下，不自动同步或上传。清理网站数据、更换设备、隐私模式或浏览器存储回收均可能丢失数据，请定期导出备份。附件与导出受设备内存和浏览器存储配额限制；保存失败时界面会提示。任意上传文件均作为附件处理，不执行 HTML 或脚本。请仅导入信任的备份文件；PDF 等原生预览取决于浏览器支持。

技术栈：React、TypeScript、Vite、Lucide；端到端测试使用 Playwright。
