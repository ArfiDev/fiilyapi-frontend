import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { OfferCreateScreen } from "./OfferCreateScreen";

const perm = vi.hoisted(() => ({ levels: { contracts: "full", projects: "admin" } as Record<string, string | undefined> }));
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn() },
}));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: (moduleKey: string) => {
    const level = perm.levels[moduleKey];
    return { level, canView: level !== "none", canWrite: true, canDelete: true };
  },
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { full_name: "Ahmet Yılmaz" }, isLoading: false, error: false, refresh: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const SETTINGS = {
  default_overhead_pct: "12.00",
  default_profit_pct: "15.00",
  default_vat_pct: "20.00",
  default_validity_days: 30,
  default_payment_terms: "Ödeme aylık hakedişle, 30 gün vadeli",
  updated_at: "2026-10-01T09:00:00Z",
};
const EMPLOYERS = {
  items: [
    { id: "emp-1", name: "Kuzey Gayrimenkul A.Ş.", tax_number: null, contact_person: null },
    { id: "emp-2", name: "Liman İşletmeleri A.Ş.", tax_number: null, contact_person: null },
  ],
  total: 2,
};

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}
function fail(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

function mockGets(settings: unknown = ok(SETTINGS)) {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/offers/settings") return settings;
    if (path === "/employers") return ok(EMPLOYERS);
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OfferCreateScreen />
    </QueryClientProvider>,
  );
}

async function loaded() {
  await screen.findByRole("heading", { name: "Yeni Teklif" });
  await screen.findByRole("option", { name: "Kuzey Gayrimenkul A.Ş." });
}

function postBody(): Record<string, unknown> {
  const call = vi.mocked(backendClient.POST).mock.calls.find((c) => String(c[0]) === "/offers");
  return (call?.[1] as unknown as { body: Record<string, unknown> }).body;
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole("combobox", { name: /İşveren/ }), "emp-1");
  await user.type(screen.getByRole("textbox", { name: /İş adı/ }), "Ataköy Rezidans C Blok");
}

beforeEach(() => {
  vi.clearAllMocks();
  perm.levels = { contracts: "full", projects: "admin" };
  scope.value = { isRestricted: false, names: [] };
  vi.useRealTimers();
});

describe("erişim (plan §2.3, SO-19)", () => {
  it("contracts:none → AccessDenied ve HİÇBİR uç çağrılmaz", async () => {
    perm.levels.contracts = "none";
    mockGets();
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(vi.mocked(backendClient.GET)).not.toHaveBeenCalled();
  });

  it("contracts:view (yazamaz) → AccessDenied, form YOK", async () => {
    perm.levels.contracts = "view";
    mockGets();
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Yeni Teklif" })).not.toBeInTheDocument();
  });

  it("disiplin kısıtlı + full → AccessDenied", async () => {
    scope.value = { isRestricted: true, names: ["Mekanik"] };
    mockGets();
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("ayar ucu 403 → AccessDenied", async () => {
    mockGets(fail(403, "Yetkisiz işlem"));
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("POST 403 (SO-19) → AccessDenied", async () => {
    const user = userEvent.setup();
    mockGets();
    vi.mocked(backendClient.POST).mockResolvedValue(fail(403, "Yetkisiz işlem"));
    renderScreen();
    await loaded();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("ön değerler ve başlangıç", () => {
  it("oranlar ve geçerlilik teklif AYARINDAN gelir (12/15/20/30)", async () => {
    mockGets();
    renderScreen();
    await loaded();
    expect(screen.getByRole("textbox", { name: /Genel gider/ })).toHaveValue("12");
    expect(screen.getByRole("textbox", { name: /Kâr/ })).toHaveValue("15");
    expect(screen.getByRole("textbox", { name: /KDV/ })).toHaveValue("20");
    expect(screen.getByRole("textbox", { name: /Geçerlilik/ })).toHaveValue("30");
  });

  // TKL-F4.8 · K-F4-5: "30gün" — "gün" son eki sayının altına girmesin (payı son ek uzunluğundan ayrılır); % kutuları varsayılan paylı.
  it("Geçerlilik 'gün' son ekine pay ayırır; % kutuları ayırmaz", async () => {
    mockGets();
    renderScreen();
    await loaded();
    const wrapOf = (name: RegExp) => screen.getByRole("textbox", { name }).parentElement as HTMLElement;
    expect(wrapOf(/Geçerlilik/).className).toContain("input-wrap--suffix");
    expect(wrapOf(/Geçerlilik/).style.getPropertyValue("--input-suffix-chars")).toBe("3");
    expect(wrapOf(/Genel gider/).className).not.toContain("input-wrap--suffix");
  });

  it("ayar 10/18/8/45 ise form onunla açılır (sabit yazılmamış)", async () => {
    mockGets(
      ok({ ...SETTINGS, default_overhead_pct: "10.00", default_profit_pct: "18.50", default_vat_pct: "8.00", default_validity_days: 45 }),
    );
    renderScreen();
    await loaded();
    expect(screen.getByRole("textbox", { name: /Genel gider/ })).toHaveValue("10");
    expect(screen.getByRole("textbox", { name: /Kâr/ })).toHaveValue("18,5");
    expect(screen.getByRole("textbox", { name: /KDV/ })).toHaveValue("8");
    expect(screen.getByRole("textbox", { name: /Geçerlilik/ })).toHaveValue("45");
  });

  it("numara istemcide bilinmez; Hazırlayan oturum kullanıcısı; para birimi TL", async () => {
    mockGets();
    renderScreen();
    await loaded();
    expect(screen.getByText("Numara oluşturunca verilir · Rev.0")).toBeInTheDocument();
    expect(screen.getByText("Ahmet Yılmaz")).toBeInTheDocument();
    expect(screen.getByText("₺ Türk lirası")).toBeInTheDocument();
  });

  it("başlangıç: 'Boş teklif' seçili gelir; Şablondan ve Kopyala artık etkin (TKL-F4.7; ayrıntı OfferCreateStart.test.tsx)", async () => {
    mockGets();
    renderScreen();
    await loaded();
    expect(screen.getByRole("radio", { name: /Boş teklif/ })).toBeChecked();
    for (const name of [/Şablondan/, /Mevcut tekliften kopyala/]) {
      const option = screen.getByRole("radio", { name });
      expect(option).toBeEnabled();
      expect(option).not.toBeChecked();
    }
  });
});

describe("doğrulama ve hata bandı", () => {
  it("boş gönderim: '2 alan eksik.' bandı + alan hataları; POST atılmaz", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    expect(screen.getByText("2 alan eksik.")).toBeInTheDocument();
    expect(screen.getByText("İşveren zorunlu")).toBeInTheDocument();
    expect(screen.getByText("İş adı zorunlu")).toBeInTheDocument();
    expect(vi.mocked(backendClient.POST)).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("alan düzeltilince bant sayısı güncellenir", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    await user.type(screen.getByRole("textbox", { name: /İş adı/ }), "Ataköy");
    expect(screen.getByText("1 alan eksik.")).toBeInTheDocument();
  });

  it("yüzde '12.5' belirsiz: T30 metni, POST atılmaz; '12,5' kabul edilir", async () => {
    const user = userEvent.setup();
    mockGets();
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "o-1" }, 201));
    renderScreen();
    await loaded();
    await fillValid(user);
    const gg = screen.getByRole("textbox", { name: /Genel gider/ });
    await user.clear(gg);
    await user.type(gg, "12.5");
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    expect(screen.getByText("Ondalık için virgül kullanın (ör. 28,50)")).toBeInTheDocument();
    expect(vi.mocked(backendClient.POST)).not.toHaveBeenCalled();
    await user.clear(gg);
    await user.type(gg, "12,5");
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    await waitFor(() => expect(postBody().overhead_pct).toBe("12.5"));
  });

  it.each(["0", "366"])("geçerlilik %s gün reddedilir, POST atılmaz", async (days) => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await fillValid(user);
    const field = screen.getByRole("textbox", { name: /Geçerlilik/ });
    await user.clear(field);
    await user.type(field, days);
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    expect(screen.getByText("Geçerlilik 1–365 gün olmalı")).toBeInTheDocument();
    expect(vi.mocked(backendClient.POST)).not.toHaveBeenCalled();
  });
});

describe("bitiş tarihi = teklif tarihi + gün", () => {
  it("tarih ve gün değişince bitiş güncellenir (özet kartında da)", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    const date = screen.getByRole("textbox", { name: "Teklif tarihi" });
    await user.clear(date);
    await user.type(date, "02.10.2026");
    const summary = screen.getByRole("complementary", { name: "Oluşturulacak teklif" });
    expect(screen.getByTestId("offer-valid-until")).toHaveTextContent("01.11.2026");
    expect(within(summary).getByText("30 gün → 01.11.2026")).toBeInTheDocument();
    const days = screen.getByRole("textbox", { name: /Geçerlilik/ });
    await user.clear(days);
    await user.type(days, "10");
    expect(screen.getByTestId("offer-valid-until")).toHaveTextContent("12.10.2026");
  });
});

describe("özet kartı", () => {
  it("seçim ve değerleri yansıtır; mavi not aynen", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    const summary = screen.getByRole("complementary", { name: "Oluşturulacak teklif" });
    expect(within(summary).getByText("Oluşturunca verilir")).toBeInTheDocument();
    expect(within(summary).getByText("Boş teklif")).toBeInTheDocument();
    expect(within(summary).getByText("GG %12 · Kâr %15 · KDV %20")).toBeInTheDocument();
    await fillValid(user);
    expect(within(summary).getByText("Kuzey Gayrimenkul A.Ş.")).toBeInTheDocument();
    expect(within(summary).getByText("Ataköy Rezidans C Blok")).toBeInTheDocument();
    expect(within(summary).getByText(/olarak kaydedilir ve kalem tablosu açılır/)).toBeInTheDocument();
  });
});

describe("gönderim", () => {
  it("gövde: payment_terms YOK, price_escalation 'fixed', yüzdeler METİN; başarıda detaya replace", async () => {
    const user = userEvent.setup();
    mockGets();
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "o-77", offer_no: "TKL-2026-0015" }, 201));
    renderScreen();
    await loaded();
    await fillValid(user);
    await user.type(screen.getByRole("textbox", { name: /Kapsam özeti/ }), "Kaba inşaat");
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/teklif-hazirlama/o-77"));
    const body = postBody();
    expect(body).not.toHaveProperty("payment_terms");
    expect(body).toMatchObject({
      employer_id: "emp-1",
      title: "Ataköy Rezidans C Blok",
      scope_summary: "Kaba inşaat",
      validity_days: 30,
      overhead_pct: "12",
      profit_pct: "15",
      vat_pct: "20",
      price_escalation: "fixed",
    });
    expect(typeof body.overhead_pct).toBe("string");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("gönderim sürerken düğme 'Oluşturuluyor…' ve kapalı; ikinci tık ikinci POST atmaz", async () => {
    const user = userEvent.setup();
    mockGets();
    let resolvePost: (value: unknown) => void = () => {};
    vi.mocked(backendClient.POST).mockImplementation(
      () => new Promise((resolve) => (resolvePost = resolve)) as never,
    );
    renderScreen();
    await loaded();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    const busy = await screen.findByRole("button", { name: "Oluşturuluyor…" });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(vi.mocked(backendClient.POST)).toHaveBeenCalledTimes(1);
    await act(async () => resolvePost(ok({ id: "o-1" }, 201)));
  });

  it("422/409: backend metni basılır, gezinme YOK, form dolu kalır", async () => {
    const user = userEvent.setup();
    mockGets();
    vi.mocked(backendClient.POST).mockResolvedValue(fail(422, "Teklif tarihi geçersiz"));
    renderScreen();
    await loaded();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    expect(await screen.findByText("Teklif tarihi geçersiz")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /İş adı/ })).toHaveValue("Ataköy Rezidans C Blok");
  });

  it("Vazgeç listeye döner (bağlantı)", async () => {
    mockGets();
    renderScreen();
    await loaded();
    expect(screen.getByRole("link", { name: "Vazgeç" })).toHaveAttribute("href", "/teklif-hazirlama");
  });
});

describe("kaydedilmemiş değişiklik (useUnsavedChanges)", () => {
  it("dokunulmamış form temiz; yazınca kirli; başarılı oluşturmada tekrar temiz", async () => {
    const user = userEvent.setup();
    mockGets();
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "o-1" }, 201));
    renderScreen();
    await loaded();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await user.type(screen.getByRole("textbox", { name: /İş adı/ }), "A");
    expect(unsavedRegistry.labels()).toContain("Teklif taslağı");
    await user.selectOptions(screen.getByRole("combobox", { name: /İşveren/ }), "emp-1");
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});

describe("+ Yeni işveren (ÜS-F3-8)", () => {
  it("projects:admin yoksa devre-dışı + gerekçe", async () => {
    perm.levels.projects = "full";
    mockGets();
    renderScreen();
    await loaded();
    const button = screen.getByRole("button", { name: "+ Yeni işveren" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "İşveren eklemek proje yönetici yetkisi ister");
  });

  it("oluşan işveren SEÇİLİ gelir ve gövdeye girer", async () => {
    const user = userEvent.setup();
    mockGets();
    vi.mocked(backendClient.POST).mockImplementation((async (path: string) => {
      if (path === "/employers") return ok({ id: "emp-9", name: "Yeni Yapı A.Ş.", tax_number: null, contact_person: null }, 201);
      return ok({ id: "o-5" }, 201);
    }) as never);
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "+ Yeni işveren" }));
    await user.type(screen.getByLabelText("Ticari Ünvan"), "Yeni Yapı A.Ş.");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: /İşveren/ })).toHaveValue("emp-9"));
    expect(screen.queryByLabelText("Ticari Ünvan")).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /İş adı/ }), "Yeni iş");
    await user.click(screen.getByRole("button", { name: /Teklifi oluştur/ }));
    await waitFor(() => expect(postBody().employer_id).toBe("emp-9"));
  });
});
