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
  for (const [label, url] of [["Situation board", /\/situation$/], ["Rumours", /\/rumours$/], ["Voter list", /\/voters$/], ["Officials", /\/officials$/], ["Polling units", /\/units$/], ["Calls", /\/calls$/], ["Settings", /\/settings$/]] as const) {
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
  // Pause first so this test never dials anyone (the unit has no registered voters anyway).
  await page.getByRole("switch").click();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  try {
  await page.goto("/units");
  await page.getByLabel("Polling unit that moved").selectOption({ label: "National Stadium Gate B (LA-SUR-06-001)" });
  await expect(page.getByText(/Confam will call/)).toContainText("registered voter");
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

test("voter and official forms validate phone numbers", async ({ page }) => {
  test.skip(!PASSWORD, "ADMIN_PASSWORD not set");
  await signIn(page);
  await page.goto("/voters");
  const voterForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add to voter list" }) });
  await voterForm.getByLabel("Name").fill("Test Voter");
  await voterForm.getByLabel("Phone").fill("12ab");
  await voterForm.getByLabel("Registered at").selectOption({ label: "Coker Primary School (LA-SUR-10-001)" });
  await voterForm.getByRole("button", { name: "Add to voter list" }).click();
  await expect(page.getByRole("status").filter({ hasText: /phone/i })).toBeVisible();
  await page.goto("/officials");
  const officialForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Register official" }) });
  await officialForm.getByLabel("Name").fill("Test Official");
  await officialForm.getByLabel("Phone").fill("not a number");
  await officialForm.getByLabel("Presiding officer at").selectOption({ label: "Coker Primary School (LA-SUR-10-001)" });
  await officialForm.getByRole("button", { name: "Register official" }).click();
  await expect(page.getByRole("status").filter({ hasText: /phone/i })).toBeVisible();
});

test("every signed-in page renders without console errors, failed requests or horizontal overflow", async ({ page }) => {
  test.skip(!PASSWORD, "ADMIN_PASSWORD not set");
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    const url = r.url();
    // Map tiles come from a third-party CDN and the SSE stream is aborted on navigation by design.
    if (r.status() >= 400 && url.startsWith("http://localhost") && !url.includes("/api/stream")) problems.push(`HTTP ${r.status()} ${url}`);
  });
  await signIn(page);
  for (const path of ["/", "/situation", "/rumours", "/rumours?status=verifying", "/rumours?status=published", "/voters", "/officials", "/units", "/calls", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`horizontal overflow ${overflow}px on ${path}`);
  }
  // Streaming (loading.tsx) commits a 200 before notFound() runs; the not-found UI is what users get.
  await page.goto("/rumours/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "Not on the register" })).toBeVisible();
  expect(problems.filter((p) => !/HTTP 404 .*00000000-0000/.test(p) && !/status of 404/.test(p))).toEqual([]);
});
