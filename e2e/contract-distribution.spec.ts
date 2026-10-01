import { test, expect, type Page } from "@playwright/test";

// F-P5 T4 · POZ (`/sozlesmeler/isveren/[projectId]/poz-dagilimi`) fonksiyonel e2e.
//
// ⚠️ BU DOSYANIN EN KRİTİK KANITI: kaydetme BİRLEŞTİRMEDİR — dokunulmayan kota
// istekte HİÇ geçmez ve sunucuda AYNEN DURUR. Kanıt burada gerçekten çalışır
// çünkü `mock-backend.ts`in PUT ucu gerçek backend gibi birleştirir (gövdede
// geçmeyen hücreye dokunmaz, `null` gelen bağı koparır, `0` gelirse 422 verir).
// Ekran gövdeyi tüm ızgaradan kursaydı aşağıdaki iddialar KIRMIZI olurdu.
//
// 🔒 FİKSTÜR İZOLASYONU: mock state TÜM koşu boyunca TEKtir ve testler paralel
// koşar. Bu yüzden burada YALNIZ MEVCUT bir hücrenin DEĞERİ değiştirilir
// (1.800 → 1.900 → 1.800 geri alınır). Hücre BOŞALTMA (`quantity: null`) e2e'de
// YAPILMAZ: bir tahsisin kaldırılması hakediş formunun pivot satır kümesini
// (`pivot.ts`, `allocatedSiteIds`) değiştirir ve paralel koşan görsel
// spec'leri kirletirdi — o dal `ContractDistributionView.test.tsx`te birim
// testiyle kanıtlanır.
//
// ⚠️ Dağılım/sözleşme uçları yalnız `p-1` için veri döner (mock).
// ⚠️ `getByRole("alert")` KULLANILMAZ (Next route-announcer tuzağı).
// Zamanlayıcıya dayalı bekleme YOK.

const URL = "/sozlesmeler/isveren/p-1/poz-dagilimi";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** Hücre erişilebilir adıyla bulunur: "03.001 · A-Blok Şantiyesi kotası". */
function cell(page: Page, code: string, siteName: string) {
  return page.locator("main").getByLabel(`${code} · ${siteName} kotası`).first();
}

async function saveDistribution(page: Page) {
  await page.getByTestId("cdist-save").click();
}

test("poz dağılımı: rota ComingSoon değil, ızgara + dinamik şantiye kolonları", async ({
  page,
}) => {
  await login(page);
  await page.goto(URL);

  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Kule A" })).toBeVisible();

  // Kolon sayısı VERİYE bağlıdır — p-1'de iki şantiye vardır.
  const columns = page.getByTestId("cdist-site-column");
  await expect(columns).toHaveCount(2);
  await expect(columns.nth(0)).toContainText("A-Blok Şantiyesi Kota");
  await expect(columns.nth(1)).toContainText("B-Blok Şantiyesi Kota");

  // Sayaç kutuları (mockup 50-57) + kırıntı bağlantısı (19).
  await expect(page.getByTestId("cdist-site-count")).toHaveText("2");
  await expect(page.getByTestId("cdist-distributed-count")).toHaveText("4/4");
  await expect(page.getByRole("link", { name: /SZL-2025-01/ })).toHaveAttribute(
    "href",
    "/sozlesmeler/isveren/p-1",
  );
});

test("poz dağılımı: E14 'İş Kalemleri' sekmesinden görünür giriş buraya gelir", async ({
  page,
}) => {
  await login(page);
  await page.goto("/sozlesmeler/isveren/p-1?tab=items");

  await page.getByTestId("ecd-distribution-link").click();
  await expect(page).toHaveURL(new RegExp(`${URL}$`));
  await expect(page.getByTestId("cdist-site-column").first()).toBeVisible();
});

test("poz dağılımı: şantiye özet kartlarında birim poz kodundan join'lenir", async ({
  page,
}) => {
  await login(page);
  await page.goto(URL);

  const cards = page.getByTestId("cdist-summary-card");
  await expect(cards).toHaveCount(2);
  // "1.800 m³" — miktar özet ucundan, birim ızgaradaki AYNI POZ KODUNDAN.
  await expect(cards.nth(0).getByTestId("cdist-summary-qty").first()).toContainText("m³");
});

test("poz dağılımı: `0` gönderilmez — istek atılmaz, gerekçe görünür", async ({ page }) => {
  await login(page);
  await page.goto(URL);

  let putCount = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes("/contract/distribution")) {
      putCount += 1;
    }
  });

  // 🔒 Birleştirme testinin hücresi DEĞİL (03.001/A-Blok) — dosya içi testler
  // paralel koşabildiği için ayrı hücre seçilir.
  await cell(page, "03.003", "B-Blok Şantiyesi").fill("0");
  await saveDistribution(page);

  await expect(page.locator("main").getByText(/Miktar 0 olamaz/)).toBeVisible();
  expect(putCount).toBe(0);

  // Sunucu HİÇ değişmedi: yeniden yüklenince eski kota durur.
  await page.reload();
  await expect(cell(page, "03.003", "B-Blok Şantiyesi")).toHaveValue("60");
});

test("poz dağılımı: BİRLEŞTİRME — dokunulmamış kota kaydetten sonra sunucuda DURUR", async ({
  page,
}) => {
  await login(page);
  await page.goto(URL);

  // Başlangıç: aynı satırın iki hücresi + başka bir satırın hücresi.
  await expect(cell(page, "03.001", "A-Blok Şantiyesi")).toHaveValue("1800");
  await expect(cell(page, "03.001", "B-Blok Şantiyesi")).toHaveValue("1400");
  await expect(cell(page, "03.002", "A-Blok Şantiyesi")).toHaveValue("420");

  // Gövdenin gerçekten TEK hücre taşıdığını telden doğrula.
  const bodies: unknown[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes("/contract/distribution")) {
      bodies.push(JSON.parse(request.postData() ?? "{}"));
    }
  });

  await cell(page, "03.001", "A-Blok Şantiyesi").fill("1900");
  await saveDistribution(page);
  await expect(page.locator("main").getByText("Poz dağılımı kaydedildi.")).toBeVisible();

  expect(bodies).toEqual([
    { allocations: [{ contract_item_id: "ci-1", site_id: "s-1", quantity: "1900" }] },
  ]);

  // 🛑 KANIT: yalnız dokunulan hücre değişti; diğer ikisi KORUNDU.
  await page.reload();
  await expect(cell(page, "03.001", "A-Blok Şantiyesi")).toHaveValue("1900");
  await expect(cell(page, "03.001", "B-Blok Şantiyesi")).toHaveValue("1400");
  await expect(cell(page, "03.002", "A-Blok Şantiyesi")).toHaveValue("420");

  // Fikstür geri alınır (paylaşılan mock state kirlenmesin).
  await cell(page, "03.001", "A-Blok Şantiyesi").fill("1800");
  await saveDistribution(page);
  await expect(page.locator("main").getByText("Poz dağılımı kaydedildi.")).toBeVisible();
  await page.reload();
  await expect(cell(page, "03.001", "A-Blok Şantiyesi")).toHaveValue("1800");
});

test("poz dağılımı: 'Kalanı buraya dağıt' hücreleri doldurur, Kaydet yalnız değişenleri yollar", async ({
  page,
}) => {
  await login(page);

  // 🔒 Mock-backend durumuna YAZILMAZ (paralel görsel kareler 03.010'u çizer):
  // PUT yakalanır ve backend'e GİTMEDEN, o anki GET yanıtından türetilmiş
  // yanıtla karşılanır (`route.continue` YOK).
  type Allocation = { site_id: string; quantity: string | null; boq_item_id?: string };
  type Body = { allocations: { contract_item_id: string; site_id: string; quantity: string | null }[] };
  const bodies: Body[] = [];
  await page.route("**/contract/distribution", async (route) => {
    const request = route.request();
    if (request.method() !== "PUT") return route.fallback();
    const body = JSON.parse(request.postData() ?? "{}") as Body;
    bodies.push(body);
    const current = await page.request.get(request.url());
    const payload = (await current.json()) as {
      groups: { items: { id: string; allocations: Allocation[] }[] }[];
    };
    for (const item of payload.groups.flatMap((group) => group.items)) {
      for (const change of body.allocations.filter((a) => a.contract_item_id === item.id)) {
        item.allocations = item.allocations.map((a) =>
          a.site_id === change.site_id ? { ...a, quantity: change.quantity } : a,
        );
      }
    }
    return route.fulfill({ status: 200, contentType: "application/json", json: payload });
  });

  await page.goto(URL);

  // 03.010 (kalıp) — 3200 + 2000 = 5200.
  await expect(cell(page, "03.010", "A-Blok Şantiyesi")).toHaveValue("3200");
  await expect(cell(page, "03.010", "B-Blok Şantiyesi")).toHaveValue("2000");

  // A'yı 200 düşür → ekrandaki kalan 200; B kolonundaki düğme onu B'ye ekler.
  await cell(page, "03.010", "A-Blok Şantiyesi").fill("3000");
  await page.getByTestId("cdist-distribute-remaining").nth(1).click();
  await expect(cell(page, "03.010", "B-Blok Şantiyesi")).toHaveValue("2200");
  await expect(page.getByTestId("cdist-remaining-unsaved").first()).toHaveText("kaydedilmedi");

  await saveDistribution(page);
  await expect(page.locator("main").getByText("Poz dağılımı kaydedildi.")).toBeVisible();

  expect(bodies).toEqual([
    {
      allocations: [
        { contract_item_id: "ci-4", site_id: "s-1", quantity: "3000" },
        { contract_item_id: "ci-4", site_id: "s-2", quantity: "2200" },
      ],
    },
  ]);
});
