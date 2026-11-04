export async function openSettings(page) {
  const trigger = page.getByRole("button", { name: /^(设置|Settings)$/ });
  const panel = page.locator(".settings-popover");
  if (!(await panel.isVisible())) await trigger.click();
  await panel.waitFor({ state: "visible" });
}

export async function exportCanvas(page) {
  await openSettings(page);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("menuitem", { name: "画布", exact: true }).click();
}
