import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceScreen } from "./AppearanceScreen";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

const PREFERENCES = {
  theme: "light",
  locale: "tr",
  currency: "TRY",
  date_format: "DD.MM.YYYY",
  density: "normal",
  accent_color: "#2563eb",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(response: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response()));
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppearanceScreen />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppearanceScreen", () => {
  it("dil/para/tarih seciciierini Select primitive'i ile render eder", async () => {
    stubFetch(() => json(PREFERENCES));

    renderScreen();

    const locale = await screen.findByLabelText("Arayüz Dili");
    const currency = screen.getByLabelText("Para Birimi");
    const dateFormat = screen.getByLabelText("Tarih Formatı");

    for (const control of [locale, currency, dateFormat]) {
      expect(control.tagName).toBe("SELECT");
      // Primitive stili: ham <select> degil, token tabanli .select sinifi.
      expect(control.className).toContain("select");
      expect(control.parentElement?.className).toContain("select-wrap");
    }
  });

  it("secim degisikligini forma yansitir", async () => {
    stubFetch(() => json(PREFERENCES));

    renderScreen();

    const currency = await screen.findByLabelText("Para Birimi");
    expect(currency).toHaveValue("TRY");

    await userEvent.selectOptions(currency, "USD");

    await waitFor(() => expect(currency).toHaveValue("USD"));
  });

  // Kayıt 419/482 — vurgu rengi/yoğunluk seçimi kaydediliyor ama arayüze
  // HİÇBİR yerde uygulanmıyordu (CSS köprüsü yok); kullanıcı yanılmasın
  // diye durum artık açıkça yazılır.
  it("vurgu rengi ve yoğunluk kartlarında 'yakında' notu görünür (kayıt 419/482)", async () => {
    stubFetch(() => json(PREFERENCES));
    renderScreen();
    await screen.findByLabelText("Arayüz Dili");

    const notes = screen.getAllByText("Seçiminiz kaydedilir; arayüze yansıtılması yakında gelecek.");
    expect(notes).toHaveLength(2);
  });
});

describe("SEKME-F1.3b — kaydedilmemiş değişiklik kaydı", () => {
  it("yüklendi + dokunulmadı → false (GET henüz dönmeden de false — async taban)", async () => {
    stubFetch(() => json(PREFERENCES));
    renderScreen();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await screen.findByLabelText("Arayüz Dili");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir seçim değişti → true", async () => {
    stubFetch(() => json(PREFERENCES));
    renderScreen();
    const currency = await screen.findByLabelText("Para Birimi");
    await userEvent.selectOptions(currency, "USD");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (PUT sonrası `query.data` yenilenir) → false", async () => {
    // GET her zaman GÜNCEL server durumunu döner; PUT o durumu günceller —
    // `invalidateQueries` sonrası gerçek refetch akışını taklit eder.
    let server = { ...PREFERENCES };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        if (request.method === "PUT") {
          const body = (await request.clone().json()) as Partial<typeof PREFERENCES>;
          server = { ...server, ...body };
          return json(server);
        }
        return json(server);
      }),
    );
    renderScreen();
    const currency = await screen.findByLabelText("Para Birimi");
    await userEvent.selectOptions(currency, "USD");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });
});
