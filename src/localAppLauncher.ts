import { strToU8, zipSync } from "fflate";
import { validApplicationText } from "./appAssociations";

const KEY = "yua-local-launcher-key";
const READY = "yua-local-launcher-installed";

export function launcherKey() {
  let key = localStorage.getItem(KEY);
  if (!key || !/^[a-f0-9]{64}$/.test(key)) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    localStorage.setItem(KEY, key);
    localStorage.removeItem(READY);
  }
  return key;
}

export function launcherInstalled() {
  return (
    /^[a-f0-9]{64}$/.test(localStorage.getItem(KEY) || "") &&
    localStorage.getItem(READY) === "1"
  );
}

export function markLauncherInstalled() {
  launcherKey();
  localStorage.setItem(READY, "1");
}

export function itermUrl(commands: string) {
  if (!validApplicationText("iterm2", commands))
    throw Error("请配置有效命令（最多 24KB）");
  const encoded = btoa(
    Array.from(new TextEncoder().encode(commands), (byte) =>
      String.fromCharCode(byte),
    ).join(""),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_");
  return `yua-canvas://iterm2/${launcherKey()}/${encoded}`;
}

export function openApplicationUrl(url: string) {
  if (
    !url.startsWith("vscode://file/") &&
    !url.startsWith("yua-canvas://iterm2/")
  )
    throw Error("应用链接无效");
  const link = document.createElement("a");
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
}

// The downloaded installer runs on the user's Mac. No local commands execute
// during installation; only explicitly opened, paired URLs can send text to iTerm.
export function launcherInstaller(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw Error("打开器配对信息无效");
  return `#!/bin/bash
set -euo pipefail
umask 077
if [ "$(uname -s)" != "Darwin" ]; then
  printf '%s\\n' '此打开器仅支持 macOS。'
  exit 1
fi
task_temp_dir="$(mktemp -d)"
trap 'rm -rf "$task_temp_dir"' EXIT
app_path="$HOME/Applications/Canvas of Yua Launcher.app"
bundle_id="com.atlanmatrix.yua-canvas-launcher"
if [ -e "$app_path" ]; then
  previous_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Contents/Info.plist" 2>/dev/null || true)
  if [ "$previous_id" != "$bundle_id" ]; then
    printf '%s\\n' '同名应用已存在，安装已停止，请先为其改名。'
    exit 1
  fi
fi
cat > "$task_temp_dir/launcher.applescript" <<'APPLESCRIPT'
on open location inputURL
  set expectedPrefix to "yua-canvas://iterm2/${key}/"
  considering case
    if inputURL does not start with expectedPrefix then return
  end considering
  if (length of inputURL) <= (length of expectedPrefix) then return
  set encoded to text ((length of expectedPrefix) + 1) thru -1 of inputURL
  if (length of encoded) > 32768 then return
  try
    do shell script "/usr/bin/printf '%s' " & quoted form of encoded & " | /usr/bin/grep -E '^[A-Za-z0-9_=-]+$'"
    set commands to do shell script "/usr/bin/printf '%s' " & quoted form of encoded & " | /usr/bin/tr '_-' '/+' | /usr/bin/base64 -D" without altering line endings
    if commands is "" then return
    tell application "iTerm"
      activate
      set terminalWindow to (create window with default profile)
      tell current session of terminalWindow
        write text commands
      end tell
    end tell
  on error messageText
    display alert "无法在 iTerm2 中执行" message messageText as warning
  end try
end open location
APPLESCRIPT
/usr/bin/osacompile -o "$task_temp_dir/Canvas of Yua Launcher.app" "$task_temp_dir/launcher.applescript"
plist_path="$task_temp_dir/Canvas of Yua Launcher.app/Contents/Info.plist"
set_plist_string() {
  /usr/libexec/PlistBuddy -c "Set :$1 '$2'" "$plist_path" 2>/dev/null ||
    /usr/libexec/PlistBuddy -c "Add :$1 string '$2'" "$plist_path"
}
set_plist_string CFBundleIdentifier "$bundle_id"
set_plist_string CFBundleName 'Canvas of Yua Launcher'
set_plist_string NSAppleEventsUsageDescription '在 iTerm2 中执行你从画布选择的命令。'
/usr/libexec/PlistBuddy -c 'Set :LSUIElement true' "$plist_path" 2>/dev/null ||
  /usr/libexec/PlistBuddy -c 'Add :LSUIElement bool true' "$plist_path"
/usr/libexec/PlistBuddy -c 'Delete :CFBundleURLTypes' "$plist_path" 2>/dev/null || true
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes array' "$plist_path"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0 dict' "$plist_path"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0:CFBundleURLName string CanvasOfYua' "$plist_path"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0:CFBundleURLSchemes array' "$plist_path"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string yua-canvas' "$plist_path"
/usr/bin/plutil -lint "$plist_path"
/usr/bin/codesign --force --deep --sign - "$task_temp_dir/Canvas of Yua Launcher.app"
/bin/mkdir -p "$HOME/Applications"
/usr/bin/ditto "$task_temp_dir/Canvas of Yua Launcher.app" "$app_path"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app_path"
printf '%s\\n' '安装完成。请回到画布，点击「安装完成，执行命令」。首次运行时请允许打开应用及控制 iTerm2。'
`;
}

export function downloadLauncherInstaller() {
  const bytes = zipSync({
    "安装 Canvas 打开器.command": [
      strToU8(launcherInstaller(launcherKey())),
      { os: 3, attrs: 0o100755 << 16 },
    ],
  });
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "Canvas 本地打开器.zip";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
