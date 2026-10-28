export type ApplicationKind = "vscode" | "iterm2";

export function isApplicationKind(kind: string): kind is ApplicationKind {
  return kind === "vscode" || kind === "iterm2";
}

export function normalizeLocalPath(value: string) {
  const path = value.trim();
  return /^[a-z]:[\\/]/i.test(path) ? path.replaceAll("\\", "/") : path;
}

export function validApplicationText(
  kind: ApplicationKind,
  value: unknown,
): value is string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0"))
    return false;
  if (kind === "iterm2")
    return (
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) &&
      new TextEncoder().encode(value).length <= 24 * 1024
    );
  const path = normalizeLocalPath(value);
  return (
    path.length <= 4096 &&
    !/[\r\n]/.test(path) &&
    (path.startsWith("/") || /^[a-z]:\//i.test(path))
  );
}

export function localPathName(value: string) {
  const path = normalizeLocalPath(value).replace(/\/+$/, "");
  return path.split("/").at(-1) || "/";
}

export function vscodeUrl(value: string) {
  if (!validApplicationText("vscode", value))
    throw Error("请输入完整的本地路径");
  const path = normalizeLocalPath(value);
  return (
    "vscode://file" +
    (path.startsWith("/") ? "" : "/") +
    path.split("/").map(encodeURIComponent).join("/") +
    "?windowId=_blank"
  );
}
