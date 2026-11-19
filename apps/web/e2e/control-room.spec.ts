import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "control@confam.local";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("redirects signed-out visitors and rejects a wrong password", async ({ page }) => {
  await page.goto("/rumours");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
});

test("stream endpoint refuses anonymous access", async ({ request }) => {
  const res = await request.get("/api/stream");
  expect(res.status()).toBe(401);
});

test("overview shows wards, live status and navigation", async ({ page }) => {
  test.skip(!PASSWORD, "ADMIN_PASSWORD not set");
  await signIn(page);
  await expect(page.getByText("Yaba / Ojuelegba")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Live|Connecting|Reconnecting/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Live" })).toBeVisible({ timeout: 10_000 });
  for (const [label, url] of [["Rumours", /\/rumours$/], ["Polling units", /\/units$/], ["People", /\/people$/], ["Calls", /\/calls$/], ["Settings", /\/settings$/]] as const) {
    await page.getByRole("navigation", { name: "Control room" }).getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("pause switch holds and resumes outbound calls", async ({ page }) => {
  test.skip(!PASSWORD, "ADMIN_PASSWORD not set");
  await signIn(page);
  const sw = page.getByRole("switch");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(page.getByText("All outbound calls are paused.")).toBeVisible();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch").click();
  await expect(page.getByText("All outbound calls are paused.")).toBeHidden();
});

test("relocation notice previews recipients, issues while paused, and can be undone", async ({ page }) => {
  test.skip(!PASSWORD, "ADMIN_PASSWORD not set");
  await signIn(page);
  // Pause first so this test never dials anyone.
  await page.getByRole("switch").click();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  try {
  await page.goto("/units");
  await page.getByLabel("Polling unit that moved").selectOption({ label: "National Stadium Gate B (LA-SUR-06-001)" });
  await expect(page.getByText(/Confam will call/)).toContainText("demo contact");
  await page.getByLabel("New location").selectOption({ label: "Igbaja Community Hall (LA-SUR-06-002)" });
  await page.getByRole("button", { name: "Issue notice and call voters" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Notice issued" })).toBeVisible();
  const moved = page.locator("td").getByText("Moved to Igbaja Community Hall", { exact: true });
  await expect(moved).toBeVisible();
  await page.getByRole("button", { name: "Mark active again" }).click();
  await expect(moved).toBeHidden();
  } finally {
    if ((await page.getByRole("switch").getAttribute("aria-checked")) === "false") await page.getByRole("switch").click();
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  }
});

test("settings validate and save", async ({ page }) => {
  test.skip(!PASSWORD, "ADMIN_PASSWORD not set");
  await signIn(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
});

test("people form rejects a bad phone number", async ({ page }) => {
  test.skip(!PASSWORD, "ADMIN_PASSWORD not set");
  await signIn(page);
  await page.goto("/people");
  await page.getByLabel("Name").fill("Test Person");
  await page.getByLabel("Phone").fill("12ab");
  await page.getByRole("combobox", { name: "Ward", exact: true }).selectOption({ label: "COKER" });
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByRole("status").filter({ hasText: /phone/i })).toBeVisible();
  await expect(page.getByText("Team phone").first()).toBeVisible();
});
