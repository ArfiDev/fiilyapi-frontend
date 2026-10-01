import { test, expect, type Page } from "@playwright/test";

import {
  maskedSectionDistribution,
  wideSectionDistribution,
} from "@/components/boq-section-distribution/section-distribution.fixture";

// BDG-F1.4 · Bölüm Dağılımı (`/projeler/p-1/santiyeler/s-1/is-kalemleri/bolum-dagilimi`)
// fonksiyonel e2e.
//
// 🔒 MOCK'A YAZMA YOK: mock durumu TÜM koşu boyunca TEKtir ve görsel kareler
// paralel koşar. Bu yüzden PUT `page.route` ile YAKALANIR ve backend'e GİTMEDEN
// GET yanıtından türetilmiş yanıtla karşılanır (`route.continue` YOK). 12
// bölümlü ve metraj-gizli varyantlar da `page.route` ile GET yanıtını
// değiştirir; fikstür TEK kaynaktan gelir (`section-distribution.fixture.ts`,
// mock-backend de onu ithal eder).
//
// ⚠️ SSR gizli kopya: testid'li öğeler `page.locator("main")` kabından aranır.
// ⚠️ `getByRole("alert")` KULLANILMAZ (Next route-announcer tuzağı).
// Zamanlayıcıya dayalı bekleme YOK.

const BOQ_URL = "/projeler/p-1/santiyeler/s-1/is-kalemleri";
const URL = `${BOQ_URL}/bolum-dagilimi`;
const DISTRIBUTION_API = "**/sites/s-1/boq/section-distribution";

const WIDE_SECTION_COUNT = 12;
const SCROLL_TARGET = 600;
const POSITION_TOLERANCE_PX = 1;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** Hücre erişilebilir adıyla bulunur: "03.001 · Kat 1-5 payı". */
function cell(page: Page, code: string, sectionName: string) {
  return page.locator("main").getByLabel(`${code} · ${sectionName} payı`);
}

async function save(page: Page) {
  await page.locator("main").getByTestId("bdg-save").click();
}

interface PutAllocation {
  boq_item_id: string;
  section_id: string;
  quantity?: string | null;
}
interface PutBody {
  allocations: PutAllocation[];
}
interface GetItem {
  id: string;
  quantity: string;
  allocations: { section_id: string; quantity: string }[];
  allocated_quantity: string;
  unallocated_quantity: string;
}
interface GetPayload {
  groups: { items: GetItem[] }[];
}

/**
 * PUT'u yakalar ve GET'ten türetilmiş yanıtla karşılar (backend'e GİTMEZ).
 * Yakalanan gövdeler döndürülen diziye yazılır.
 */
async function interceptPut(page: Page, bodies: PutBody[]) {
  await page.route(DISTRIBUTION_API, async (route) => {
    const request = route.request();
    if (request.method() !== "PUT") return route.fallback();
    const body = JSON.parse(request.postData() ?? "{}") as PutBody;
    bodies.push(body);

    const current = await page.request.get(request.url());
    const payload = (await current.json()) as GetPayload;
    for (const item of payload.groups.flatMap((group) => group.items)) {
      const changes = body.allocations.filter((entry) => entry.boq_item_id === item.id);
      if (changes.length === 0) continue;
      let allocations = item.allocations;
      for (const change of changes) {
        allocations = allocations.filter((entry) => entry.section_id !== change.section_id);
        if (change.quantity !== null && change.quantity !== undefined) {
          allocations = [...allocations, { section_id: change.section_id, quantity: change.quantity }];
        }
      }
      const allocated = allocations.reduce((sum, entry) => sum + Number(entry.quantity), 0);
      item.allocations = allocations;
      item.allocated_quantity = allocated.toFixed(3);
      item.unallocated_quantity = (Number(item.quantity) - allocated).toFixed(3);
    }
    return route.fulfill({ status: 200, contentType: "application/json", json: payload });
  });
}

/** GET yanıtını verilen fikstürle değiştirir (PUT'a dokunmaz). */
async function replaceGet(page: Page, payload: unknown) {
  await page.route(DISTRIBUTION_API, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", json: payload });
  });
}

test("bolum dagilimi: BOQ basligindaki baglanti sayfayi acar, baslik ve sayaclar dolar", async ({
  page,
}) => {
  await login(page);
  await page.goto(BOQ_URL);

  await page.getByRole("link", { name: "Bölüm Dağılımı" }).click();
  await expect(page).toHaveURL(new RegExp(`${URL}$`));

  await expect(page.getByRole("heading", { level: 1, name: "A-Blok" })).toBeVisible();
  const main = page.locator("main");
  await expect(main.getByTestId("bdg-head-project")).toHaveText("Güneşkent Konut");
  await expect(main.getByTestId("bdg-section-count")).toHaveText("3");
  await expect(main.getByTestId("bdg-distributed-count")).toHaveText("1/4");
  await expect(main.getByTestId("bdg-section-column")).toHaveCount(3);
  await expect(main.getByTestId("bdg-unallocated-warning")).toContainText(
    "3 kalemde atanmamış miktar var: 03.001",
  );
});

test("bolum dagilimi: hucre duzenle + hucre bosalt -> yalniz kirli hucreler, bosaltilan quantity:null ANAHTARLI", async ({
  page,
}) => {
  await login(page);
  const bodies: PutBody[] = [];
  await interceptPut(page, bodies);
  await page.goto(URL);

  await expect(cell(page, "03.001", "Kat 1-5")).toHaveValue("400");
  await expect(cell(page, "03.001", "Kat 6-10")).toHaveValue("300");

  await cell(page, "03.001", "Kat 1-5").fill("450");
  await cell(page, "03.001", "Kat 6-10").fill("");
  await save(page);
  await expect(page.locator("main").getByText("Bölüm dağılımı kaydedildi.")).toBeVisible();

  expect(bodies).toHaveLength(1);
  const sent = bodies[0].allocations;
  // Yalnız iki kirli hücre: dokunulmayan 15+ hücre gövdede YOK.
  expect(sent).toHaveLength(2);
  expect(sent).toContainEqual({ boq_item_id: "bi-1", section_id: "sec-1", quantity: "450" });
  // `quantity` ANAHTARI var ve değeri null (anahtarsız gövde backend'de 422).
  const emptied = sent.find((entry) => entry.section_id === "sec-2");
  expect(emptied).toBeDefined();
  expect(emptied && "quantity" in emptied).toBe(true);
  expect(emptied?.quantity).toBeNull();

  // Sunucu yanıtı ekrana yansır.
  await expect(cell(page, "03.001", "Kat 1-5")).toHaveValue("450");
  await expect(cell(page, "03.001", "Kat 6-10")).toHaveValue("");
});

test("bolum dagilimi: `0` gonderilmez — gorunur ret, PUT yok", async ({ page }) => {
  await login(page);
  const bodies: PutBody[] = [];
  await interceptPut(page, bodies);
  await page.goto(URL);

  await cell(page, "03.002", "Kat 1-5").fill("0");
  await save(page);

  await expect(page.locator("main").getByText(/Miktar 0 olamaz/)).toBeVisible();
  expect(bodies).toHaveLength(0);
});

test("bolum dagilimi: 422 detail bantta AYNEN basilir, kirli hucre korunur", async ({ page }) => {
  await login(page);
  const detail = "Bölüm bu şantiyeye ait değil: sec-9";
  await page.route(DISTRIBUTION_API, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    return route.fulfill({ status: 422, contentType: "application/json", json: { detail } });
  });
  await page.goto(URL);

  await cell(page, "03.002", "Kat 1-5").fill("40");
  await save(page);

  await expect(page.locator("main").getByText(detail, { exact: true })).toBeVisible();
  await expect(cell(page, "03.002", "Kat 1-5")).toHaveValue("40");
});

test("bolum dagilimi: 'Kalani buraya dagit' hucreleri doldurur, rozet 'kaydedilmedi'", async ({
  page,
}) => {
  await login(page);
  await page.goto(URL);

  const main = page.locator("main");
  await expect(cell(page, "04.001", "Kat 1-5")).toHaveValue("");

  await main.getByTestId("bdg-distribute-remaining").first().click();

  // 04.001: hiç dağıtılmamıştı → 1.200'ün tamamı Kat 1-5 kolonuna dolar.
  await expect(cell(page, "04.001", "Kat 1-5")).toHaveValue(/^1200/);
  await expect(main.getByTestId("bdg-remaining-unsaved").first()).toHaveText("kaydedilmedi");
});

for (const width of [1440, 1024]) {
  test(`bolum dagilimi: 12 bolum @${width} sayfa yatay tasmaz`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await replaceGet(page, wideSectionDistribution(WIDE_SECTION_COUNT));
    await page.goto(URL);

    await expect(page.locator("main").getByTestId("bdg-section-column")).toHaveCount(
      WIDE_SECTION_COUNT,
    );
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
}

test("bolum dagilimi: yatay kaydirmada Poz No ve Poz Adi sabit, bolum hucresi kayar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await replaceGet(page, wideSectionDistribution(WIDE_SECTION_COUNT));
  await page.goto(URL);

  const main = page.locator("main");
  await expect(main.getByTestId("bdg-section-column")).toHaveCount(WIDE_SECTION_COUNT);

  const scroller = main.locator(".bdg-scroll");
  const codeCell = main.locator("td.bdg-sticky-code").first();
  const nameCell = main.locator("td.bdg-sticky-name").first();
  const sectionCell = main.locator("td.cdist-cell").first();

  const xOf = async (target: typeof codeCell) => {
    const box = await target.boundingBox();
    if (box === null) throw new Error("hucre kutusu olculemedi");
    return box.x;
  };

  const before = {
    code: await xOf(codeCell),
    name: await xOf(nameCell),
    section: await xOf(sectionCell),
  };

  // Kaydırma payı gerçekten var mı (ölçüm anlamlı olsun).
  const range = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(range).toBeGreaterThanOrEqual(SCROLL_TARGET);

  await scroller.evaluate((el, target) => {
    el.scrollLeft = target;
  }, SCROLL_TARGET);
  // Kaydırma OTURDU: durum tabanlı bekleme.
  await expect.poll(() => scroller.evaluate((el) => Math.round(el.scrollLeft))).toBe(SCROLL_TARGET);

  const after = {
    code: await xOf(codeCell),
    name: await xOf(nameCell),
    section: await xOf(sectionCell),
  };

  expect(Math.abs(after.code - before.code)).toBeLessThanOrEqual(POSITION_TOLERANCE_PX);
  expect(Math.abs(after.name - before.name)).toBeLessThanOrEqual(POSITION_TOLERANCE_PX);
  expect(Math.abs(after.section - before.section)).toBeGreaterThan(POSITION_TOLERANCE_PX);
});

test("bolum dagilimi: metraj gizli rolde girdiler kapali, gerekce gorunur, rozet '—'", async ({
  page,
}) => {
  await login(page);
  await replaceGet(page, maskedSectionDistribution());
  await page.goto(URL);

  const main = page.locator("main");
  await expect(main.getByTestId("bdg-write-reason")).toContainText("Metraj alanları bu rolde gizli");
  await expect(main.getByTestId("bdg-cell-input").first()).toBeDisabled();
  await expect(main.locator('[data-testid="bdg-cell-input"]:not([disabled])')).toHaveCount(0);
  await expect(main.getByTestId("bdg-save")).toBeDisabled();

  const badges = main.getByTestId("bdg-remaining");
  await expect(badges).toHaveCount(4);
  await expect(badges).toHaveText(["—", "—", "—", "—"]);
  await expect(main.getByTestId("bdg-unallocated-warning")).toContainText(
    "3 kalemde atanmamış miktar var: 03.001, 04.001, 04.002",
  );
});
