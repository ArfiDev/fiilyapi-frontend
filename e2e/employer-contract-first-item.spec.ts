import { test, expect, type Page } from "@playwright/test";

// F-POZGRUP T3 · "Yeni bir işveren sözleşmesine İLK poz eklenemiyor" kusurunun
// FONKSİYONEL regresyon bekçisi.
//
// Kusur yalnız HİÇ GRUBU OLMAYAN bir sözleşmede görülebilir: `p-1` iki grupla
// doludur, bu yüzden mock `p-4` (Güneşkent B-Blok) fikstüründe BOŞ bir işveren
// sözleşmesi taşır. Ekranın tamamı gerçek BFF + sahte backend üzerinden koşar.
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (Next route-announcer tuzağı).
// ⚠️ Zamanlayıcıya dayalı bekleme YOK.
// ⚠️ Bu dosya mock kaydını MUTASYONA UĞRATIR (p-4'e grup + kalem ekler) —
//    bu yüzden `serial`: ikinci test birinciyi "artık grup var" hâline
//    düşürerek SAHTE YEŞİL yapamasın.
test.describe.configure({ mode: "serial" });

const EMPTY_CONTRACT = "/sozlesmeler/isveren/p-4?tab=items";
const NEW_GROUP_SENTINEL = "__new__";
const GROUP_NAME = "A — Kaba Yapı";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("grupsuz sözleşmede '+ Poz Ekle' KİLİTLİ DEĞİL — form yeni grup kipinde açılır", async ({
  page,
}) => {
  await login(page);
  await page.goto(EMPTY_CONTRACT);

  // Sözleşmede hiç grup yok: tablo boş, yönlendirme metni EYLEM anlatır.
  await expect(page.locator("main").getByText("Bu sözleşmede henüz iş kalemi yok")).toBeVisible();
  await expect(page.getByTestId("ecd-add-item-reason")).toContainText(
    "ilk pozu eklerken grubu da oluşturabilirsiniz",
  );

  // 🔴 Düğme AÇIK (eskiden `disabled` idi → sözleşme sonsuza kadar pozsuz).
  const add = page.getByTestId("ecd-add-item");
  await expect(add).toBeEnabled();
  await add.click();

  // 🔴 Form doğrudan "+ Yeni Grup" kipinde: boş açılırla baş başa bırakılmaz.
  const dialog = page.getByRole("dialog", { name: "İşveren Sözleşmesine Poz Ekle" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Poz Grubu", { exact: true })).toHaveValue(NEW_GROUP_SENTINEL);
  await expect(dialog.getByLabel("Grup Adı", { exact: true })).toBeVisible();
});

test("ilk poz eklenir: grup ÖNCE yaratılır, kalemin `group_id`si grup YANITINDAN gelir", async ({
  page,
}) => {
  await login(page);
  await page.goto(EMPTY_CONTRACT);

  // Ağ sırası ham istek akışından ölçülür — "iki çağrı yapıldı" yetmez.
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const { pathname } = new URL(request.url());
    if (pathname.endsWith("/contract/groups")) calls.push("groups");
    if (pathname.endsWith("/contract/items")) calls.push("items");
  });

  await page.getByTestId("ecd-add-item").click();
  const dialog = page.getByRole("dialog", { name: "İşveren Sözleşmesine Poz Ekle" });

  await dialog.getByLabel("Grup Adı", { exact: true }).fill(GROUP_NAME);
  await dialog.getByLabel("Poz No", { exact: true }).fill("03.099");
  await dialog.getByLabel("İş Kalemi Tanımı", { exact: true }).fill("Perde betonu C30/37");
  await dialog.getByLabel("Birim", { exact: true }).selectOption("m³");
  await dialog.getByLabel("Sözleşme Miktarı", { exact: true }).fill("120");
  await dialog.getByLabel("Birim Fiyat (₺)", { exact: true }).fill("2500");
  // Dağıtım ekranına ZIPLAMA — sonuç bu sekmenin tablosundan doğrulanacak.
  await dialog.getByTestId("eci-go-distribution").uncheck();

  const groupResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/contract/groups"),
  );
  const itemRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/contract/items"),
  );

  await dialog.getByRole("button", { name: "Pozu Ekle" }).click();

  // 1. adım — GRUP. Yanıttaki id ayırt edicidir (mock `cg-new-*` üretir):
  // `group_id` başka bir kaynaktan alınsaydı aşağıdaki eşitlik tutmazdı.
  const createdGroup = (await (await groupResponse).json()) as { id: string };
  expect(createdGroup.id).toMatch(/^cg-new-\d+$/);

  // 2. adım — KALEM; gövdesindeki `group_id` grup yanıtının id'sidir.
  const itemBody = JSON.parse((await itemRequest).postData() ?? "{}") as {
    group_id?: string;
  };
  expect(itemBody.group_id).toBe(createdGroup.id);
  expect(itemBody.group_id).not.toBe(NEW_GROUP_SENTINEL);

  // Diyalog kapandı ve poz listede — iki adım da GERÇEKTEN yazdı.
  await expect(dialog).toBeHidden();
  await expect(page.locator("main").getByText(GROUP_NAME)).toBeVisible();
  await expect(page.getByRole("cell", { name: "03.099", exact: true })).toBeVisible();

  // SIRA: grup ucu kalem ucundan ÖNCE çağrıldı (ters sıra da iki çağrıdır).
  expect(calls).toEqual(["groups", "items"]);
});
