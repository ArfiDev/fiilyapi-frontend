import { expect, test, type Page } from "@playwright/test";

import { login } from "./earned-value-helpers";
import { prepareFrame } from "./visual-scroll";

// DSC-F2 · Kısıtlı (disiplini atanmış) kullanıcının ONAYLI günlük raporu (yalnız 1440×900).
// Backend biçimi: `report_snapshot_scope.restrict_snapshot` — kpis yalnız izinli disiplin
// satırları (overall/overall_own/overall_subcon YOK), `trend: []`, `footer: null`,
// quantities yalnız izinli `d:` bloğu. Kadraj "Raporu göster" ile açılan tam gövdedir:
// Genel satırı yok, trend bölümü gizli, mutabakat çipi yok. Arşiv özet kartı (metrikler "—")
// aynı testte ÖNCE doğrulanır (kart ile tam gövde aynı anda görünmez → tek kare).
//
// 🔒 İZOLASYON (restricted-empty-visual.spec.ts kanonu): kısıtlılık ve rapor biçimi YALNIZ
// tarayıcı katmanında (`page.route`) kurulur; paylaşılan sahte backend durumuna YAZILMAZ,
// atamasız kareler (daily-progress-report-visual) değişmez.
//
// ⏱️ Saat `login()` içinde NAVİGASYONDAN ÖNCE çakılır; `prepareFrame` `toHaveScreenshot`tan
// hemen önceki SON çağrıdır.

const GIR_URL = "/projeler/p-1/santiyeler/s-1/gunluk-ilerleme-raporu";
const VIEWPORT = { width: 1440, height: 900 } as const;
const APPROVED_DAY = "2026-09-22";
const KAB = { id: "00000000-0000-4000-8000-0000000000a1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" };

interface KpiRow {
  kind: string;
  node_id: string | null;
}
interface WarningRow {
  target: string;
}
interface QtyRow {
  node_id: string;
  level: number;
}

async function restrictToOneDiscipline(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...me, disciplines: [KAB] } });
  });
}

/** Onaylı rapor yanıtını `restrict_snapshot` biçimine indirger (ilk disiplin bloğu kalır). */
async function restrictApprovedSnapshot(page: Page) {
  await page.route("**/api/backend/sites/*/earned-value/reports/daily*", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      status: string;
      kpis: KpiRow[];
      quantities: QtyRow[];
      warnings: WarningRow[];
    };
    if (body.status !== "approved") {
      await route.fulfill({ response, json: body });
      return;
    }
    const kpis = body.kpis.filter((row) => row.kind === "discipline");
    const allowed = kpis[0]?.node_id ?? null;
    let inBlock = false;
    const quantities = body.quantities.filter((row) => {
      if (row.level === 1) inBlock = row.node_id === allowed;
      return inBlock;
    });
    // Uyarılar da süzülür: yalnız gün başlığı uyarıları kalır, oransız girişler düşer (yabancı disiplin sızmaz).
    const warnings = body.warnings.filter((w) => w.target === "day");
    await route.fulfill({
      response,
      json: { ...body, kpis: kpis.slice(0, 1), quantities, warnings, unrated_entries: [], trend: [], footer: null },
    });
  });
}

test("kisitli onayli gunluk rapor gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VIEWPORT });
  await restrictToOneDiscipline(page);
  await restrictApprovedSnapshot(page);
  await login(page);
  await page.goto(`${GIR_URL}?tarih=${APPROVED_DAY}`);

  const card = page.locator(".ev-daily-archive-summary");
  await expect(card).toBeVisible();
  await expect(card.locator(".ev-daily-archive-summary__metrics b")).toHaveText(["—", "—", "—"]);

  await page.getByRole("button", { name: "Raporu göster" }).click();
  await expect(page.getByText("1 · Disiplin KPI")).toBeVisible();
  await expect(page.getByText(/7 günlük trend/)).toHaveCount(0);
  await expect(page.locator(".ev-daily-kpi__table tbody tr")).toHaveCount(1);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("kisitli-onayli-gunluk-rapor.png", { fullPage: true });
});
