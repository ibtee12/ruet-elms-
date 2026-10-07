import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("Permission Denial Flow", () => {
  test("student cannot access admin or teacher areas and is redirected to friendly 403 page", async ({
    page,
  }) => {
    // 1. Student Login
    await loginAs(page, "2203001", "Password123!");

    // 2. Try navigating to /admin/audit-logs
    await page.goto("/admin/audit-logs");
    await page.waitForURL((url) => url.pathname.includes("/forbidden"), {
      timeout: 10000,
    });

    // Verify 403 content
    await expect(page.locator("h1")).toContainText("Access Denied");
    await expect(page.getByText("HTTP 403 • Forbidden")).toBeVisible();
    await expect(
      page.getByText("Your user role does not have authorization")
    ).toBeVisible();

    // 3. Try navigating to /teach/offerings
    await page.goto("/teach/offerings");
    await page.waitForURL((url) => url.pathname.includes("/forbidden"), {
      timeout: 10000,
    });
    await expect(page.locator("h1")).toContainText("Access Denied");

    // 4. Click dashboard return link and verify recovery
    const dashboardLink = page.getByRole("link", {
      name: /dashboard|home/i,
    }).first();
    await expect(dashboardLink).toBeVisible();
    await dashboardLink.click();

    // Verify student is back on their portal/dashboard
    await page.waitForURL((url) => !url.pathname.includes("/forbidden"), {
      timeout: 10000,
    });
    expect(page.url()).not.toContain("/forbidden");
  });
});
