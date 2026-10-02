import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeOffer } from "@/components/offers/offer-fixtures";
import { backendClient } from "@/lib/api/client";
import type { OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";

import { createFakeBackend, type FakeBackend, type FakeOptions } from "./template-fake-backend.testkit";
import { TemplateCreateModal } from "./TemplateCreateModal";
import type { FlowResult } from "./template-create-flow";
import type { SourceKind } from "./template-create-form";
import { makeTemplateListItem } from "./template-fixtures";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const TEMPLATES: OfferTemplateListItem[] = [
  makeTemplateListItem({ id: "tpl-a", name: "Konut · kaba inşaat", overhead_pct: "12.00", profit_pct: "15.00", group_count: 2, item_count: 3 }),
  makeTemplateListItem({ id: "tpl-b", name: "Dış cephe", is_default: false, overhead_pct: null, profit_pct: "14.00", group_count: 1, item_count: 1 }),
];

function backendOptions(overrides: Partial<FakeOptions> = {}): FakeOptions {
  return {
    templates: [
      { id: "tpl-a", name: "Konut · kaba inşaat", description: "Karkas", overhead_pct: "12.00", profit_pct: "15.00", is_default: true, usage_count: 1, groups: [{ name: "Betonarme", items: ["cat-1"] }] },
      { id: "tpl-b", name: "Dış cephe", description: null, overhead_pct: null, profit_pct: "14.00", is_default: false, usage_count: 0, groups: [{ name: "Cephe", items: ["cat-1"] }] },
    ],
    disciplines: [
      { id: "d-1", name: "Betonarme" },
      { id: "d-2", name: "Kalıp" },
    ],
    offers: [
      makeOffer({ offer_no: "TKL-2026-0014", title: "Güneşkent Konut Kompleksi", rev_no: 2, status: "sent" }) as never,
      makeOffer({ offer_no: "TKL-2026-0013", title: "Ataköy Rezidans", rev_no: 0 }) as never,
    ],
    settings: { default_overhead_pct: "12.00", default_profit_pct: "18.50" },
    ...overrides,
  };
}

let fake: FakeBackend;
let timeline: string[];
let onCreated: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

function wire(options: FakeOptions = backendOptions()) {
  fake = createFakeBackend(options);
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
    vi.mocked(backendClient[method]).mockImplementation(((path: string, init: never) => {
      timeline.push(`${method} ${path}`);
      return Promise.resolve(fake.handle(method, path, init));
    }) as never);
  }
}

function renderModal(initialSource: SourceKind = "blank") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TemplateCreateModal initialSource={initialSource} templates={TEMPLATES} onClose={onClose} onCreated={onCreated} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  timeline = [];
  onCreated = vi.fn();
  onClose = vi.fn();
  wire();
});

const dialog = () => screen.getByRole("dialog", { name: "Yeni Şablon" });
const submit = () => within(dialog()).getByRole("button", { name: "Şablonu Oluştur" });

async function fillName(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(within(dialog()).getByRole("textbox", { name: /Şablon adı/ }), name);
}

describe("biçim (TS:163-239)", () => {
  it("başlık/alt başlık, ad sayacı /80, ipucu, üç kaynak kartı ve butonlar mockup metniyle", async () => {
    const user = userEvent.setup();
    renderModal();
    expect(dialog()).toHaveTextContent("Kalem seti, gruplar ve varsayılan oranlar saklanır · miktar ve fiyat saklanmaz");
    expect(dialog()).toHaveTextContent("0/80");
    expect(dialog()).toHaveTextContent("Yeni Teklif ekranındaki şablon listesinde bu adla görünür");
    const group = within(dialog()).getByRole("radiogroup", { name: "Kalemler nereden gelsin?" });
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "BoşGrupları seçin, kalemleri sonra ekleyin",
      "Bir tekliftenTeklifin kalem ve gruplarını alın",
      "Şablondan kopyalaMevcut şablonu temel alın",
    ]);
    await fillName(user, "Konut");
    expect(dialog()).toHaveTextContent("5/80");
    expect(within(dialog()).getByRole("textbox", { name: /Şablon adı/ })).toHaveAttribute("maxlength", "80");
    expect(within(dialog()).getByRole("button", { name: "Vazgeç" })).toBeInTheDocument();
  });

  it("'Bir tekliften' önseçili açılabilir (Tekliften şablon oluştur düğmesi)", async () => {
    renderModal("offer");
    const radios = within(within(dialog()).getByRole("radiogroup", { name: "Kalemler nereden gelsin?" })).getAllByRole("radio");
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(await within(dialog()).findByText("TKL-2026-0014")).toBeInTheDocument();
  });

  it("oranlar teklif ayarından dolar (12 · 18,5); önizleme 'Oluşacak şablon: …'", async () => {
    renderModal();
    await waitFor(() => expect(within(dialog()).getByRole("textbox", { name: /Varsayılan kâr/ })).toHaveValue("18,5"));
    expect(within(dialog()).getByRole("textbox", { name: /Varsayılan genel gider/ })).toHaveValue("12");
    expect(dialog()).toHaveTextContent("Oluşacak şablon: 0 grup · 0 kalem · GG %12 · Kâr %18,5");
  });
});

describe("doğrulama", () => {
  it("ad boşken oluştur: 'Şablon adı zorunlu' + '1 alan eksik.'; istek ATILMAZ", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(submit());
    expect(dialog()).toHaveTextContent("1 alan eksik.");
    expect(dialog()).toHaveTextContent("Şablonu oluşturmadan önce işaretli alanları doldurun.");
    expect(within(dialog()).getByText("Şablon adı zorunlu")).toBeInTheDocument();
    expect(fake.callsTo("POST", "/offers/templates")).toHaveLength(0);
  });

  it("T30: '12.5' belirsiz → 'Ondalık için virgül kullanın (ör. 28,50)'; GG 100'ü aşamaz", async () => {
    const user = userEvent.setup();
    renderModal();
    await fillName(user, "Konut");
    const overhead = within(dialog()).getByRole("textbox", { name: /Varsayılan genel gider/ });
    await user.clear(overhead);
    await user.type(overhead, "12.5");
    await user.click(submit());
    expect(within(dialog()).getByText("Ondalık için virgül kullanın (ör. 28,50)")).toBeInTheDocument();
    await user.clear(overhead);
    await user.type(overhead, "101");
    expect(within(dialog()).getByText("0–100 arasında olmalı")).toBeInTheDocument();
    expect(fake.callsTo("POST", "/offers/templates")).toHaveLength(0);
  });
});

describe("kaynak: Boş → POST → PUT → default", () => {
  it("adımlar SIRAYLA; PUT POST yanıtının updated_at'ini, gruplar seçim sırasını taşır", async () => {
    const user = userEvent.setup();
    renderModal();
    await fillName(user, "Yeni şablon");
    await user.click(await within(dialog()).findByRole("button", { name: "+ Kalıp" }));
    await user.click(within(dialog()).getByRole("button", { name: "+ Betonarme" }));
    await user.click(within(dialog()).getByRole("checkbox", { name: /Varsayılan şablon yap/ }));
    timeline.length = 0;
    await user.click(submit());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

    expect(timeline.filter((e) => e.startsWith("POST") || e.startsWith("PUT"))).toEqual([
      "POST /offers/templates",
      "PUT /offers/templates/{template_id}/content",
      "POST /offers/templates/{template_id}/default",
    ]);
    const created = fake.callsTo("POST", "/offers/templates")[0]?.body;
    expect(created).toEqual({ name: "Yeni şablon", overhead_pct: "12", profit_pct: "18.5" });
    const put = fake.callsTo("PUT", "/offers/templates/{template_id}/content")[0]?.body as { groups: { name: string }[]; expected_updated_at: string };
    expect(put.groups.map((g) => g.name)).toEqual(["Kalıp", "Betonarme"]);
    const [result, toast] = onCreated.mock.calls[0] as [FlowResult, string];
    expect(toast).toBe("Yeni şablon şablonu oluşturuldu");
    expect(result.failure).toBeNull();
    expect(result.template?.is_default).toBe(true);
  });
});

describe("kaynak: Bir tekliften → from-offer (son revizyon) → oran farkı PATCH", () => {
  it("ilk teklif önseçili, rev_no son revizyon; oranlar kaynaktan farklıysa PATCH; toast mockup metni", async () => {
    const user = userEvent.setup();
    renderModal("offer");
    await within(dialog()).findByText("TKL-2026-0014");
    expect(within(dialog()).getByText("Rev.2 · Gönderildi")).toBeInTheDocument();
    await fillName(user, "Güneşkent şablonu");
    await user.click(submit());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(fake.callsTo("POST", "/offers/templates/from-offer")[0]?.body).toEqual({
      offer_id: "id-TKL-2026-0014",
      rev_no: 2,
      name: "Güneşkent şablonu",
    });
    const created = onCreated.mock.calls[0] as [FlowResult, string];
    const patch = fake.callsTo("PATCH", "/offers/templates/{template_id}")[0]?.body as Record<string, unknown>;
    expect(patch).toMatchObject({ overhead_pct: "12", profit_pct: "18.5" });
    expect(created[1]).toBe("TKL-2026-0014 kalemlerinden şablon oluşturuldu · miktarlar alınmadı");
  });

  it("başka teklif seçilir → onun kimliği ve rev_no gider", async () => {
    const user = userEvent.setup();
    renderModal("offer");
    await user.click(await within(dialog()).findByRole("radio", { name: /TKL-2026-0013/ }));
    await fillName(user, "Ataköy");
    await user.click(submit());
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(fake.callsTo("POST", "/offers/templates/from-offer")[0]?.body).toMatchObject({ offer_id: "id-TKL-2026-0013", rev_no: 0 });
  });
});

describe("kaynak: Şablondan kopyala → copy{name} → fark PATCH", () => {
  it("ilk şablon seçilir, oranları forma gelir; açıklama farkı PATCH'e girer", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(within(dialog()).getByRole("radio", { name: /Şablondan kopyala/ }));
    expect(within(dialog()).getByRole("radio", { name: "Konut · kaba inşaat · 3 kalem" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog()).getByRole("textbox", { name: /Varsayılan genel gider/ })).toHaveValue("12");
    expect(within(dialog()).getByRole("textbox", { name: /Varsayılan kâr/ })).toHaveValue("15");
    await fillName(user, "Kopya şablon");
    await user.type(within(dialog()).getByRole("textbox", { name: "Açıklama" }), "Yeni kapsam");
    await user.click(submit());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(fake.callsTo("POST", "/offers/templates/{template_id}/copy")[0]?.body).toEqual({ name: "Kopya şablon" });
    expect(fake.callsTo("PATCH", "/offers/templates/{template_id}")[0]?.body).toMatchObject({ description: "Yeni kapsam" });
    expect(fake.callsTo("PATCH", "/offers/templates/{template_id}")[0]?.body).not.toHaveProperty("overhead_pct");
  });
});

describe("adım düşüşü: ilk hata durdurur", () => {
  it("PUT düşer: şablon VAR (onCreated çağrılır), varsayılan adımı ATLANIR, bant metni aynen", async () => {
    const user = userEvent.setup();
    wire(backendOptions({ failures: { "PUT /offers/templates/{template_id}/content": { status: 404, detail: "Katalog iş tipi bulunamadı" } } }));
    renderModal();
    await fillName(user, "Yarım");
    await user.click(await within(dialog()).findByRole("button", { name: "+ Betonarme" }));
    await user.click(within(dialog()).getByRole("checkbox", { name: /Varsayılan şablon yap/ }));
    await user.click(submit());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const [result] = onCreated.mock.calls[0] as [FlowResult, string];
    expect(result.template?.name).toBe("Yarım");
    expect(result.failure?.message).toBe("Şablon oluşturuldu ama gruplar uygulanamadı: Katalog iş tipi bulunamadı");
    expect(fake.callsTo("POST", "/offers/templates/{template_id}/default")).toHaveLength(0);
  });

  it("tekliften: PATCH düşer → 'oranlar', varsayılan çağrılmaz", async () => {
    const user = userEvent.setup();
    wire(backendOptions({ failures: { "PATCH /offers/templates/{template_id}": { status: 422, detail: "Oran geçersiz" } } }));
    renderModal("offer");
    await within(dialog()).findByText("TKL-2026-0014");
    await fillName(user, "X");
    await user.click(within(dialog()).getByRole("checkbox", { name: /Varsayılan şablon yap/ }));
    await user.click(submit());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect((onCreated.mock.calls[0] as [FlowResult])[0].failure?.message).toBe("Şablon oluşturuldu ama oranlar uygulanamadı: Oran geçersiz");
    expect(fake.callsTo("POST", "/offers/templates/{template_id}/default")).toHaveLength(0);
  });

  it("kopya: PATCH düşer → 'oranlar' bandı", async () => {
    const user = userEvent.setup();
    wire(backendOptions({ failures: { "PATCH /offers/templates/{template_id}": { status: 422, detail: "Açıklama geçersiz" } } }));
    renderModal();
    await user.click(within(dialog()).getByRole("radio", { name: /Şablondan kopyala/ }));
    await fillName(user, "K");
    await user.type(within(dialog()).getByRole("textbox", { name: "Açıklama" }), "x");
    await user.click(submit());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect((onCreated.mock.calls[0] as [FlowResult])[0].failure?.message).toBe("Şablon oluşturuldu ama oranlar uygulanamadı: Açıklama geçersiz");
  });

  it("ilk adım (POST) düşer: modal AÇIK kalır, hata metni modalda, onCreated YOK", async () => {
    const user = userEvent.setup();
    wire(backendOptions({ failures: { "POST /offers/templates": { status: 422, detail: "Şablon adı geçersiz" } } }));
    renderModal();
    await fillName(user, "Bozuk");
    await user.click(submit());
    expect(await within(dialog()).findByText("Şablon adı geçersiz")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("teklif arama (ÜS-F4-11)", () => {
  it("arama kutusu `q` ile en çok 8 teklif ister", async () => {
    const user = userEvent.setup();
    renderModal("offer");
    await within(dialog()).findByText("TKL-2026-0014");
    await user.type(within(dialog()).getByRole("searchbox", { name: /Teklif no, iş adı/ }), "ata");
    await waitFor(() => {
      const offerCalls = vi.mocked(backendClient.GET).mock.calls.filter((call) => String(call[0]) === "/offers");
      expect(offerCalls.at(-1)?.[1]).toMatchObject({ params: { query: { q: "ata", limit: 8 } } });
    });
  });
});

describe("akış sürerken kapatma (TKL-F4.6b D2)", () => {
  it("🔴 Şablonu Oluştur uçuştayken Vazgeç / arka plan / Esc kapatmaz (ilk adım hatası kaybolmaz, ikinci şablon doğmaz)", async () => {
    const user = userEvent.setup();
    const real = vi.mocked(backendClient.POST).getMockImplementation() as (p: string, i: never) => Promise<unknown>;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(backendClient.POST).mockImplementation(((path: string, init: never) =>
      path === "/offers/templates" ? gate.then(() => real(path, init)) : real(path, init)) as never);
    renderModal();
    await fillName(user, "Konut");
    await user.click(submit());
    await waitFor(() => expect(within(dialog()).getByRole("button", { name: "Vazgeç" })).toBeDisabled());
    await user.click(document.querySelector(".modal-overlay") as HTMLElement);
    await user.keyboard("{Escape}");
    await user.click(within(dialog()).getByRole("button", { name: "Kapat" }));
    expect(onClose).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });
});
