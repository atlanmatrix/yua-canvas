import { useEffect, useState } from "react";
import { CircleHelp, X } from "lucide-react";
const shortcuts = [
  ["N / T", "新建文本 / 任务"],
  ["I / U", "上传图片 / 文件"],
  ["V / H", "选择 / 平移工具"],
  ["空格 / 右键拖动 / ⌘或Ctrl＋拖动", "平移画布"],
  ["滚轮 / ⌘或Ctrl＋滚轮", "平移 / 缩放"],
  ["⌘/Ctrl + C / X / V", "复制 / 剪切 / 粘贴"],
  ["⌘/Ctrl + Z", "撤销"],
  ["⌘/Ctrl + Shift + Z / Ctrl + Y", "重做"],
  ["⌘/Ctrl + A", "全选"],
  ["⌘/Ctrl + D", "创建副本"],
  ["⌘/Ctrl + G / Shift + G", "创建分组 / 移出分组"],
  ["⌘/Ctrl + O", "导入画布"],
  ["⌘/Ctrl + ↑ / ↓", "进入父画布 / 进入唯一选中的子画布"],
  ["⌘/Ctrl + Shift + E", "导出画布"],
  ["方向键", "选中一个元素后，切换到对应方向的相邻元素"],
  ["Shift + 方向键", "移动选中元素 10 个单位"],
  ["Delete / Backspace", "删除选中内容"],
  ["Enter / 双击", "打开或编辑组件"],
  ["⌘/Ctrl + Enter / Esc", "完成编辑 / 取消"],
  ["+ / − / 0 / 1", "放大 / 缩小 / 适应内容 / 原始比例"],
  ["?", "打开使用说明"],
];
export function HelpDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.key === "?" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !target?.closest("input,textarea,[contenteditable]") &&
        !document.querySelector('[role="dialog"]')
      ) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <>
      <button
        className="help-button floating-button"
        aria-label="使用说明"
        title="使用说明 (?)"
        onClick={() => setOpen(true)}
      >
        <CircleHelp size={19} />
      </button>
      {open && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <section
            className="modal help-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="使用说明"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          >
            <div className="modal-heading">
              <h2>使用说明</h2>
              <button
                autoFocus
                aria-label="关闭使用说明"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="help-build-version" aria-label="构建版本">
              构建版本 <code>{__BUILD_VERSION__}</code>
            </p>
            <h3>画布与组件</h3>
            <p>
              画布空白处右键「新建」，可在右击位置创建文本、任务、图片、文件、子画布或分组；图片和文件需选择本地内容。也可粘贴文本、拖入图片或文件开始记录。双击组件编辑；拖动边框调整尺寸，从边缘的
              + 拖出连线。多选后可创建分组，右键查看复制、剪切、下载、Pin
              和外观操作。分组、多选或框选后，右键「下载」会生成包含全部元素及附件的
              ZIP。
            </p>
            <h3>Miniature · 3D 场景</h3>
            <p>
              工具栏的 Miniature 可嵌入 3D 场景：输入场景 URL 或 iframe
              代码，也可使用示例城市。背景透明、无标题栏，平时只显示模型；悬浮或选中后显示虚线框和框下方的名称、链接。
              双击模型激活交互，点击模型区域外 结束交互并保存视角和静态预览。
              双击名称或链接可直接在画布编辑，Enter 或失焦保存、Esc
              取消；Cmd/Ctrl + 点击链接在新标签页打开。
            </p>
            <h3>Pin 快速定位</h3>
            <p>
              在任意组件或分组上右键选择 Pin。顶部纵向列表只显示当前画布的
              Pin，点击定位，双击修改名称。右键列表项可通过圆形色板选择蓝色、浅橙、红色或默认颜色；右键原组件或分组可取消
              Pin。名称和颜色随本地保存、同步与导出保留。
            </p>
            <h3>画布层级与缩略图</h3>
            <p>
              进入子画布后，可通过返回按钮或缩略图旁的层级短线切换。⌘/Ctrl + ↑
              返回父画布；选中一个子画布后，⌘/Ctrl + ↓
              进入该子画布。深灰短线表示当前画布，悬浮可预览对应画布。缩略图在闲置时淡出，悬浮、缩放或拖动时恢复。每个子画布只有一个直接父画布；已有父级或已创建父画布时不能重复创建父画布。
            </p>
            <h3>分层视图</h3>
            <p>
              右键点击左下角缩略图，选择「分层视图」，或悬浮缩略图后点击右上角的分层图标，可在独立页面以
              3D 方式按父子关系分层查看整个工作区。拖动旋转、滚轮缩放，按住
              Shift
              或右键拖动平移；触屏支持单指旋转、双指缩放和平移。父画布位于子画布上方，上下旋转限制在正负
              90°。右上角可重置视角或退出预览。双击组件会进入其所属画布并立即执行原有的编辑或打开操作，Esc
              也可返回画布。
            </p>
            <h3>保存与分享</h3>
            <p>
              默认自动保存到当前浏览器的
              IndexedDB，请定期导出备份。可选云同步需配置云服务并登录；剪切只有在剪贴板及本地缓存保存成功后才移除原内容。右键粘贴需要剪贴板读取权限，权限受限时可用键盘粘贴。
            </p>
            <p>
              顶部「导出」会备份整个工作区，包括父级、兄弟和全部子画布、组件、原始附件、分组、连线、Pin，以及各层缩放、平移和当前层级。导入完整备份会替换整个工作区并恢复原有标识和视图；旧版画布
              JSON 仍导入当前层，选中元素的 ZIP 下载用于局部迁移。Miniature
              保存场景地址、最新视角和已生成的静态图片，不打包外部网站内容。
            </p>
            <h3>快捷键</h3>
            <dl className="shortcut-list">
              {shortcuts.map(([key, text]) => (
                <div key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </>
  );
}
