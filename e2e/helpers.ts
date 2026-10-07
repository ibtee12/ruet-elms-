import { Page } from "@playwright/test";

export async function loginAs(
  page: Page,
  identifier: string,
  password: string = "Password123!"
) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  const identifierInput = page.locator('input[name="identifier"]');
  await identifierInput.waitFor({ state: "visible" });
  await identifierInput.fill(identifier);

  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.fill(password);

  const submitButton = page.locator('button[type="submit"]');
  await submitButton.click();

  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15000,
  });
}
