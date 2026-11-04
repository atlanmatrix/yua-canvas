export async function openSettings(page) {
  const trigger = page.getByRole("button", { name: /^(设置|Settings)$/ });
  const panel = page.locator(".settings-popover");
  if (!(await panel.isVisible())) await trigger.click();
  await panel.waitFor({ state: "visible" });
}
