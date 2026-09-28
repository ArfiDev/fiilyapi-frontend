import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyScreen } from "./CompanyScreen";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

const COMPANY = {
  id: "c1",
  name: "FİİL Yapı",
  tax_number: "1234567890",
  tax_office: "Kadıköy",
  trade_registry_no: "12345",
  kep_address: "fiil@hs01.kep.tr",
  phone: "0216 000 00 00",
  email: "info@fiilyapi.com",
  website: "https://fiilyapi.com",
  address: "İstanbul",
  brand_color: "#2563eb",
  gib_integration_code: "GIB-1",
  earsiv_portal: "Logo e-Fatura",
  default_vat_rate: "20",
  auto_einvoice: false,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(response: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response()));
}

/**
 * 🔴 DEĞERİ BEKLE, ELEMANI DEĞİL (PLN-F1.2.2 · CI run 36066567640).
 * Form sunucu verisinden `useEffect` ile doluyor (`CompanyScreen.tsx:41-59`):
 * veri gelen İLK render'da alanlar BOŞ değerle DOM'a girer, efekt bir sonraki
 * adımda doldurur. `findByLabelText` elemanı o boş anda bulabilir — yavaş CI
 * runner'ında `toHaveValue("20")` boş okudu. Kapı, formun DOLDUĞUNU gösteren
 * bir değere bağlanır: şirket adı alanı sunucudaki adı taşıyana kadar beklenir.
 */
async function waitForFormFilled() {
  await screen.findByDisplayValue(COMPANY.name);
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CompanyScreen />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CompanyScreen", () => {
  it("e-Arsiv ve KDV seciciierini Select primitive'i ile render eder", async () => {
    stubFetch(() => json(COMPANY));

    renderScreen();

    const portal = await screen.findByLabelText("e-Arşiv Portalı");
    const vat = screen.getByLabelText("KDV Oranı (Varsayılan)");

    for (const control of [portal, vat]) {
      expect(control.tagName).toBe("SELECT");
      expect(control.className).toContain("select");
      expect(control.parentElement?.className).toContain("select-wrap");
    }
  });

  it("KDV orani secimini forma yansitir", async () => {
    stubFetch(() => json(COMPANY));

    renderScreen();

    await waitForFormFilled();
    const vat = screen.getByLabelText("KDV Oranı (Varsayılan)");
    expect(vat).toHaveValue("20");

    await userEvent.selectOptions(vat, "10");

    await waitFor(() => expect(vat).toHaveValue("10"));
  });

  // Kayıt 276 — `default_vat_rate: null` daha önce sessizce "%20"ye
  // eşleniyordu; kullanıcı gerçekte hiç seçim yapılmadığını göremiyordu.
  it("default_vat_rate null ise secici sessizce %20 GOSTERMEZ", async () => {
    stubFetch(() => json({ ...COMPANY, default_vat_rate: null }));

    renderScreen();

    // Boş değer, form DOLMADAN önce de "" okunur — dolmayı beklemeden bu
    // iddia null→"20" eşlemesini yakalayamaz (sahte-yeşil). Önce form dolar.
    await waitForFormFilled();
    const vat = screen.getByLabelText("KDV Oranı (Varsayılan)");
    expect(vat).toHaveValue("");
    expect(vat).not.toHaveValue("20");
  });

  // Kayıt 276 — listede olmayan bir değer (ör. ondalıklı) sessizce en
  // yakın seçeneğe yuvarlanmaz; kendi görünür seçeneğiyle basılır.
  it("listede olmayan KDV orani (18.5) sessizce yuvarlanmaz, ozel secenek olarak gorunur", async () => {
    stubFetch(() => json({ ...COMPANY, default_vat_rate: "18.5" }));

    renderScreen();

    // 🔴 DEĞERİ BEKLE, ELEMANI DEĞİL (2026-09-23, CI kırmızısı): `default_vat_rate`
    // sunucudan gelip `useEffect` ile forma yazılıyor. `findByLabelText` select'i
    // BULUR BULMAZ geçer — yerelde efekt o arada tamamlanıyordu, CI'ın yavaş
    // runner'ında tamamlanmadı ve değer boş okundu. Beklemeyi ÖZEL SEÇENEĞE
    // bağlamak doğru kapıdır: o seçenek ancak form güncellendikten sonra doğar.
    const ozel = await screen.findByRole("option", { name: "%18.5 (özel)" });
    expect(ozel).toBeInTheDocument();
    expect(await screen.findByLabelText("KDV Oranı (Varsayılan)")).toHaveValue("18.5");
  });
});

describe("SEKME-F1.3b — kaydedilmemiş değişiklik kaydı", () => {
  it("yüklendi + dokunulmadı → false (GET henüz dönmeden de false — async taban)", async () => {
    stubFetch(() => json(COMPANY));
    renderScreen();
    // 🔴 ASYNC TABAN: veri GELMEDEN önce de false olmalı (`baseline === null`
    // koruması olmazsa `form` `{}`, `baseline` `null` → JSON farkı SAHTE
    // dirty üretir).
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await waitForFormFilled();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan değişti → true", async () => {
    stubFetch(() => json(COMPANY));
    renderScreen();
    await waitForFormFilled();
    await userEvent.selectOptions(screen.getByLabelText("KDV Oranı (Varsayılan)"), "10");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (invalidateQueries → refetch) → false", async () => {
    let server = { ...COMPANY };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        if (request.method === "PUT") {
          const body = (await request.clone().json()) as Partial<typeof COMPANY>;
          server = { ...server, ...body };
          return json(server);
        }
        return json(server);
      }),
    );
    renderScreen();
    await waitForFormFilled();
    await userEvent.selectOptions(screen.getByLabelText("KDV Oranı (Varsayılan)"), "10");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Değişiklikleri Kaydet" }));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });

  // O2 (i) — sunucu PUT'tan SONRA da GET'te hep AYNI (eski) veriyi dönerse
  // (normalleştirme ya da yeniden çekmenin yansıtmaması): `query.data` efektine
  // bağımlı kalınırsa taban hiç kaymaz ve form KALICI kirli görünür. Kayıt
  // `onSuccess`i tabanı GÖNDERİLEN gövdeyle hizalamalı.
  it("PUT sonrası GET hep eski veriyi dönerse (yeniden çekme yansıtmaz) → kayıttan sonra TEMİZ", async () => {
    stubFetch(() => json(COMPANY));
    renderScreen();
    await waitForFormFilled();
    await userEvent.selectOptions(screen.getByLabelText("KDV Oranı (Varsayılan)"), "10");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Değişiklikleri Kaydet" }));

    // `stubFetch` GET'i DEĞİŞMEDEN döndürüyor — yeniden çekme (invalidateQueries)
    // eski veriyi getirir; buna rağmen kayıt SONRASI temiz olmalı.
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });

  // O2 (ii) — kayıt SÜRERKEN kullanıcı yeni bir değişiklik yaparsa taban o anki
  // (kayıt bitmiş) forma DEĞİL, GÖNDERİLEN gövdeye çekilir; kayıt bitince form
  // hâlâ kirli kalmalı.
  it("kayıt sürerken ek değişiklik yapılırsa kayıt bitince yine kirli kalır", async () => {
    let resolvePut!: (value: Response) => void;
    const putPromise = new Promise<Response>((resolve) => {
      resolvePut = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        if (request.method === "PUT") return putPromise;
        return json(COMPANY);
      }),
    );
    renderScreen();
    await waitForFormFilled();
    const vat = screen.getByLabelText("KDV Oranı (Varsayılan)");
    const saveButton = screen.getByRole("button", { name: "Değişiklikleri Kaydet" });
    await userEvent.selectOptions(vat, "10");

    await userEvent.click(saveButton);
    expect(saveButton).toBeDisabled();
    // Kayıt (PUT) HENÜZ dönmedi — kullanıcı ikinci bir alanı değiştirir.
    await userEvent.selectOptions(vat, "1");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    resolvePut(json({ ...COMPANY, default_vat_rate: "10" }));
    // Kayıt tamamen BİTSİN (isPending false) — yalnız DOM değerini beklemek
    // yeterli değildir: `onSuccess` henüz çalışmamış olabilir (sahte-yeşil
    // riski, mutasyonla ölçüldü).
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    // Kayıt (yalnız "10"u taşıyan gövde) bitti — ama form artık "1"i taşıyor;
    // taban "10"a çekildiği için hâlâ kirli olmalı.
    expect(vat).toHaveValue("1");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });
});
