import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { makeGroup, makeItem } from "@/components/offers/offer-item-fixtures";
import { BETON, DEMIR, SIVA } from "@/components/work-item-catalog/work-item-fixtures";
import { backendClient } from "@/lib/api/client";
import { formatMoneyTl } from "@/lib/format";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { resetPermissions } from "./convert-permission.testkit";
import { makeWonRevision } from "./convert-fixtures";
import { lineAmount, sumAmounts } from "./convert-money";
import {
  CONVERT_RESPONSE, CREATE, NEXT_1, NEXT_2, OFFER_ID, PROJECT_ID, SITE_ID, bfBox, convertBodies, convertCalls, fail, fieldText, fillStep1,
  installBackend, ok, priceDemir, qtyBox, renderConvert, rowOf, toStep2, toStep3, typeInto, wonBackend, wonDetail, type ConvertBackend,
} from "./convert-screen.testkit";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn() } }));
vi.mock("@/lib/auth/useDisciplineScope", async () => import("./convert-permission.testkit").then((m) => m.disciplineScopeMock));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T09:00:00Z"));
  resetPermissions();
  installBackend(wonBackend());
  return () => vi.useRealTimers();
});

const createButton = () => screen.getByRole("button", { name: CREATE });
const detailGets = () => vi.mocked(backendClient.GET).mock.calls.filter((call) => call[0] === "/offers/{offer_id}").length;
const stepperNav = () => screen.getByRole("navigation", { name: "Dönüştürme adımları" });

const DEFAULT_BODY = {
  project: { name: "Güneşkent Konut Kompleksi", city: "İstanbul / Kadıköy", start_date: "2026-10-02", end_date: "2027-11-25" },
  contract: { contract_no: "SZL-2026-011", signature_date: "2026-10-02", has_price_escalation: false },
  groups: [
    {
      name: "KABA İNŞAAT",
      items: [
        { catalog_item_id: BETON.id, offer_item_id: "it-1", code: BETON.poz_no, description: BETON.name, unit: BETON.uom, quantity: "10", unit_price: "128.80" },
        { catalog_item_id: DEMIR.id, offer_item_id: "it-2", code: DEMIR.poz_no, description: DEMIR.name, unit: DEMIR.uom, quantity: "2", unit_price: "100" },
      ],
    },
    {
      name: "İNCE İŞLER",
      items: [{ catalog_item_id: SIVA.id, offer_item_id: "it-3", code: SIVA.poz_no, description: SIVA.name, unit: SIVA.uom, quantity: "100", unit_price: "50.00" }],
    },
  ],
  open_site: true,
};

describe("gönderim: gövde = model (plan §2.1, §3)", () => {
  it("ekran → istek gövdesi TAM EŞİTLİK; uç ve teklif kimliği doğru; sözleşme no büyük harf; boş kod/şantiye adı/amount/vat GÖNDERİLMEZ", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    await screen.findByTestId("convert-done");
    expect(convertCalls()).toHaveLength(1);
    expect(convertCalls()[0]?.[0]).toBe("/offers/{offer_id}/convert");
    expect((convertCalls()[0]?.[1] as { params: unknown }).params).toEqual({ path: { offer_id: OFFER_ID } });
    expect(convertBodies()[0]).toEqual(DEFAULT_BODY);
  });

  it("kod girilirse BÜYÜK HARF + kırpılmış gider; şantiye adı ve kapalı şantiye gövdeye yansır (site_name yalnız açıkken)", async () => {
    const user = userEvent.setup();
    renderConvert();
    await user.type(await screen.findByLabelText("Proje kodu"), " prj-2026-009 ");
    await user.type(screen.getByLabelText("Şantiye adı"), "A-Blok");
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    await screen.findByTestId("convert-done");
    expect(convertBodies()[0]).toMatchObject({ project: { code: "PRJ-2026-009" }, site_name: "A-Blok", open_site: true });
  });

  it("şantiye kapalı: open_site=false, site_name ve group_disciplines YOK", async () => {
    const user = userEvent.setup();
    renderConvert();
    await user.type(await screen.findByLabelText("Şantiye adı"), "A-Blok");
    await user.click(screen.getByRole("checkbox", { name: /Tek şantiye aç/ }));
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    await screen.findByTestId("convert-done");
    const body = convertBodies()[0] as Record<string, unknown>;
    expect(body.open_site).toBe(false);
    expect(body).not.toHaveProperty("site_name");
    expect(body).not.toHaveProperty("group_disciplines");
  });

  it("fiyat farkı AÇIK: has_price_escalation + index_type + base_index_value gider; kapalıyken endeks alanları HİÇ yok", async () => {
    installBackend(wonBackend({ revision: makeWonRevision({ price_escalation: "tuik", price_index_type: "tufe" }) }));
    const user = userEvent.setup();
    renderConvert();
    await fillStep1(user);
    await user.type(screen.getByLabelText("Baz Endeks Değeri (D0)"), "1250");
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    await screen.findByTestId("convert-done");
    expect(convertBodies()[0]).toMatchObject({ contract: { has_price_escalation: true, index_type: "tufe", base_index_value: "1250" } });
  });

  it("karışık grupta seçilen disiplin group_disciplines'a (grup adı → disiplin) girer", async () => {
    const mixed = makeWonRevision({
      groups: [
        makeGroup("g-m", "KARMA", 0, [
          makeItem({ id: "it-1" }),
          makeItem({ id: "it-3", catalog_item_id: SIVA.id, description: SIVA.name, unit: SIVA.uom, poz_no: SIVA.poz_no, quantity: "100.000", customer: { unit_price: "50.00", amount: "5000.00" } }),
        ]),
      ],
    });
    installBackend(wonBackend({ revision: mixed }));
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await user.selectOptions(within(screen.getByTestId("convert-group-g:g-m")).getByLabelText("Disiplin"), "d-duv");
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    await screen.findByTestId("convert-done");
    expect(convertBodies()[0]).toMatchObject({ group_disciplines: { KARMA: "d-duv" }, open_site: true });
  });

  it("🔴 Σ ekran = Σ gövde: ekrandaki sözleşme tutarı, gövdedeki satırların ROUND_HALF_UP Σ'sıyla BİREBİR", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await typeInto(user, qtyBox("o:it-1"), "1,005");
    await typeInto(user, bfBox("o:it-1"), "1");
    await typeInto(user, bfBox("o:it-2"), "33,33");
    await typeInto(user, qtyBox("o:it-3"), "7,333");
    await typeInto(user, bfBox("o:it-3"), "3,01");
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    await screen.findByTestId("convert-done");
    const body = convertBodies()[0] as { groups: { items: { quantity: string; unit_price: string }[] }[] };
    const expected = sumAmounts(body.groups.flatMap((group) => group.items.map((item) => lineAmount(item.quantity, item.unit_price))));
    expect(fieldText(screen.getByTestId("convert-summary-step3"), "Sözleşme tutarı")).toContain(formatMoneyTl(expected));
    expect(screen.getByText(`3 kalem · ${formatMoneyTl(expected)} KDV hariç · katalog bağlı`)).toBeInTheDocument();
  });
});

describe("tek uçuş (plan §2.1)", () => {
  function deferred() {
    let resolve: (reply: unknown) => void = () => undefined;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  it("🔴 çift tık TEK istek atar; uçuşta düğme 'Oluşturuluyor…' + kilitli, Geri ve adım çubuğu kilitli", async () => {
    const flight = deferred();
    installBackend(wonBackend({ post: () => flight.promise as never }));
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.dblClick(createButton());
    expect(convertCalls()).toHaveLength(1);
    const busy = await screen.findByRole("button", { name: "Oluşturuluyor…" });
    expect(busy).toBeDisabled();
    expect(screen.getByRole("button", { name: "← Geri" })).toBeDisabled();
    for (const button of within(stepperNav()).getAllByRole("button")) expect(button).toBeDisabled();
    await user.click(busy);
    expect(convertCalls()).toHaveLength(1);
    await act(async () => flight.resolve(ok(CONVERT_RESPONSE)));
    expect(await screen.findByTestId("convert-done")).toBeInTheDocument();
    expect(convertCalls()).toHaveLength(1);
  });
});

describe("başarı bandı (plan §1, ÜS-F5-22)", () => {
  it("bant metni + 'Sözleşmeyi aç →' (proje UUID) + şantiye açıldıysa 'Adam-saat bütçesi →'; düğme '✓ Oluşturuldu' kalıcı pasif, Geri GİZLİ", async () => {
    const backend: ConvertBackend = wonBackend();
    backend.post = () => {
      backend.detail = wonDetail({ conversion_state: "converted", project_id: PROJECT_ID, project: { id: PROJECT_ID, code: "PRJ-2026-004", name: "Güneşkent Konut Kompleksi", slug: null } });
      return ok(CONVERT_RESPONSE);
    };
    installBackend(backend);
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    const done = await screen.findByTestId("convert-done");
    expect(done).toHaveTextContent("PRJ-2026-004 · Güneşkent Konut Kompleksi ve SZL-2026-011 oluşturuldu. TKL-2026-0014 arşive alındı.");
    expect(within(done).getByRole("link", { name: "Sözleşmeyi aç →" })).toHaveAttribute("href", `/sozlesmeler/isveren/${PROJECT_ID}`);
    expect(within(done).getByRole("link", { name: "Adam-saat bütçesi →" })).toHaveAttribute("href", `/planlama/adam-saat-butcesi?site=${SITE_ID}`);
    const finished = screen.getByRole("button", { name: "Oluşturuldu" });
    expect(finished).toBeDisabled();
    expect(screen.queryByRole("button", { name: "← Geri" })).not.toBeInTheDocument();
    // Önbellek tazelenip detay "converted" olsa da ekran "zaten dönüştürüldü" kartına DÖNMEZ.
    await waitFor(() => expect(detailGets()).toBeGreaterThan(1));
    expect(screen.getByTestId("convert-done")).toBeInTheDocument();
    expect(screen.queryByText("Teklif zaten dönüştürüldü")).not.toBeInTheDocument();
    expect(screen.getByTestId("convert-step-3")).toBeInTheDocument();
  });

  it("uyarılar backend metniyle AYNEN, madde madde", async () => {
    const warnings = [
      { code: "mixed_discipline_group", message: "Grubun kalemleri birden çok disiplinde; Planlama'da disiplin elle eşlenmeli (eşlenmeden baseline dondurulamaz)", group_name: "KABA İNŞAAT" },
      { code: "no_rate_slot", message: "1 kalemde adam-saat oranı yok (sözleşmeden doldurulamaz)", group_name: null },
    ];
    installBackend(wonBackend({ post: () => ok({ ...CONVERT_RESPONSE, warnings }) }));
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    const done = await screen.findByTestId("convert-done");
    const items = within(done).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(warnings.map((warning) => warning.message));
  });

  it("şantiyesiz dönüştürmede bütçe bağlantısı YOK, 'Sözleşmeden doldur' ipucu VAR", async () => {
    installBackend(wonBackend({ post: () => ok({ ...CONVERT_RESPONSE, site_id: null }) }));
    const user = userEvent.setup();
    renderConvert();
    await user.click(await screen.findByRole("checkbox", { name: /Tek şantiye aç/ }));
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    const done = await screen.findByTestId("convert-done");
    expect(within(done).queryByRole("link", { name: "Adam-saat bütçesi →" })).not.toBeInTheDocument();
    expect(within(done).getByText("Şantiye açılınca Planlama › Adam-saat bütçesi'nde 'Sözleşmeden doldur' ile oranlar aktarılır")).toBeInTheDocument();
  });

  it("uyarısız başarıda madde listesi çizilmez", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    const done = await screen.findByTestId("convert-done");
    expect(within(done).queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("hata dalları (plan §1 'Hata bandı')", () => {
  const detailText = "groups[1].items[0].code: Kalem kodu tekrar ediyor (DUV-0001)";

  it("🔴 422: detail AYNEN bantta; errors[].loc İLGİLİ satıra (yanlış satıra DEĞİL) bağlanır; Adım 2'ye gidilir", async () => {
    installBackend(
      wonBackend({
        post: () => fail(422, { detail: detailText, errors: [{ loc: ["groups", 1, "items", 0, "code"], message: "Kalem kodu tekrar ediyor (DUV-0001)" }] }),
      }),
    );
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    const band = await screen.findByTestId("convert-error");
    expect(band).toHaveTextContent(detailText);
    expect(band).toHaveAttribute("role", "status");
    expect(await screen.findByTestId("convert-step-2")).toBeInTheDocument();
    expect(within(rowOf("o:it-3")).getByText("Kalem kodu tekrar ediyor (DUV-0001)")).toBeInTheDocument();
    expect(within(rowOf("o:it-1")).queryByText(/Kalem kodu tekrar ediyor/)).not.toBeInTheDocument();
    expect(within(rowOf("o:it-2")).queryByText(/Kalem kodu tekrar ediyor/)).not.toBeInTheDocument();
  });

  it("422 miktar/fiyat satırı: ilk gruptaki İKİNCİ kalemin B.F. kutusunda gösterilir", async () => {
    installBackend(
      wonBackend({ post: () => fail(422, { detail: "x", errors: [{ loc: ["groups", 0, "items", 1, "unit_price"], message: "sunucu: fiyat hatalı" }] }) }),
    );
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    await screen.findByTestId("convert-step-2");
    expect(within(rowOf("o:it-2")).getByText("sunucu: fiyat hatalı")).toBeInTheDocument();
    expect(within(rowOf("o:it-1")).queryByText("sunucu: fiyat hatalı")).not.toBeInTheDocument();
  });

  it("422 proje alanı (project.city): Adım 1'e dönülür, alan hatası ve bant görünür", async () => {
    installBackend(wonBackend({ post: () => fail(422, { detail: "project.city: şehir geçersiz", errors: [{ loc: ["project", "city"], message: "şehir geçersiz" }] }) }));
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    expect(await screen.findByTestId("convert-step-1")).toBeInTheDocument();
    expect(within(screen.getByTestId("convert-step-1")).getByText("şehir geçersiz")).toBeInTheDocument();
    expect(screen.getByTestId("convert-error")).toHaveTextContent("project.city: şehir geçersiz");
  });

  it("422 şema (FastAPI liste biçimi): ilk msg aynen bantta", async () => {
    installBackend(wonBackend({ post: () => fail(422, { detail: [{ loc: ["body", "contract", "amount"], msg: "Value error, bedel hatalı", type: "value_error" }] }) }));
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    expect(await screen.findByTestId("convert-error")).toHaveTextContent("Value error, bedel hatalı");
  });

  it("🔴 409 'zaten dönüştürüldü': detay TAZELENİR ve ekran 'Teklif zaten dönüştürüldü' + 'Projeyi aç →' durumuna geçer", async () => {
    const backend: ConvertBackend = wonBackend();
    backend.post = () => {
      backend.detail = wonDetail({ conversion_state: "converted", project_id: PROJECT_ID, project: { id: PROJECT_ID, code: "PRJ-2026-004", name: "Güneşkent Konut", slug: "gunes-kent" } });
      return fail(409, { detail: "Teklif zaten dönüştürüldü" });
    };
    installBackend(backend);
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    const before = detailGets();
    await user.click(createButton());
    expect(await screen.findByRole("link", { name: "Projeyi aç →" })).toHaveAttribute("href", "/projeler/gunes-kent");
    expect(detailGets()).toBeGreaterThan(before);
    expect(screen.getByText("Teklif zaten dönüştürüldü")).toBeInTheDocument();
    expect(screen.queryByTestId("convert-step-3")).not.toBeInTheDocument();
  });

  it("409 kod çakışması: Adım 1'e dönülür, hata 'Proje kodu' alanında (metin aynen); koda yazınca alan hatası kalkar", async () => {
    installBackend(wonBackend({ post: () => fail(409, { detail: "Bu proje kodu zaten kullanılıyor" }) }));
    const user = userEvent.setup();
    renderConvert();
    await user.type(await screen.findByLabelText("Proje kodu"), "prj-1");
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    const step1 = await screen.findByTestId("convert-step-1");
    expect(within(step1).getByText("Bu proje kodu zaten kullanılıyor", { selector: ".field__error" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Proje kodu"), "2");
    expect(within(step1).queryByText("Bu proje kodu zaten kullanılıyor", { selector: ".field__error" })).not.toBeInTheDocument();
  });

  it("F5.0b (TKL-B6.9): 409 kod çakışması yapısal errors[{loc:[project,code]}] taşırsa alan hatası O mesajdır (422 loc eşlemesiyle aynı yol)", async () => {
    installBackend(
      wonBackend({ post: () => fail(409, { detail: "Bu proje kodu zaten kullanılıyor", errors: [{ loc: ["project", "code"], message: "yapısal: kod kullanımda" }] }) }),
    );
    const user = userEvent.setup();
    renderConvert();
    await user.type(await screen.findByLabelText("Proje kodu"), "prj-1");
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    const step1 = await screen.findByTestId("convert-step-1");
    expect(within(step1).getByText("yapısal: kod kullanımda", { selector: ".field__error" })).toBeInTheDocument();
    expect(screen.getByTestId("convert-error")).toHaveTextContent("Bu proje kodu zaten kullanılıyor");
  });

  it("409 veri bütünlüğü: bant + 'Tekrar dene' (düzenleme yok → GÜNCEL durumdan kurulan gövde ilkine eşit) yeniden gönderir ve başarır; düzenlenmiş durum ConvertScreen.repair.test'te", async () => {
    let calls = 0;
    installBackend(wonBackend({ post: () => (++calls === 1 ? fail(409, { detail: "Veri bütünlüğü hatası" }) : ok(CONVERT_RESPONSE)) }));
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    expect(await screen.findByTestId("convert-error")).toHaveTextContent("Veri bütünlüğü hatası");
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    await screen.findByTestId("convert-done");
    expect(convertCalls()).toHaveLength(2);
    expect(convertBodies()[1]).toEqual(convertBodies()[0]);
    expect(screen.queryByTestId("convert-error")).not.toBeInTheDocument();
  });

  it("403 (sunucu): 'Bu işlem için yetkiniz yok' bandı; düğme yeniden açılır; veri yazılmadı", async () => {
    installBackend(wonBackend({ post: () => fail(403, { detail: "Bu işlem için yetkiniz yok" }) }));
    const user = userEvent.setup();
    const { container } = renderConvert();
    await toStep3(user);
    await user.click(createButton());
    expect(await screen.findByTestId("convert-error")).toHaveTextContent("Bu işlem için yetkiniz yok");
    expect(createButton()).toBeEnabled();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("won değil 409: backend metni aynen; yeni denemede bant temizlenir", async () => {
    const text = "Yalnız son revizyonu kazanılmış (won) olan teklif projeye dönüştürülebilir";
    let calls = 0;
    installBackend(wonBackend({ post: () => (++calls === 1 ? fail(409, { detail: text }) : ok(CONVERT_RESPONSE)) }));
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    expect(await screen.findByTestId("convert-error")).toHaveTextContent(text);
    await user.click(createButton());
    await screen.findByTestId("convert-done");
    expect(screen.queryByTestId("convert-error")).not.toBeInTheDocument();
  });
});

describe("kaydedilmemiş değişiklik kaydı (SEKME-F1.3b; plan ÜS-F5-23: 'Vazgeç' düz bağlantı)", () => {
  it("dokunulmadıkça kirli değil; form düzenlenince kirli; başarıdan sonra temiz", async () => {
    const user = userEvent.setup();
    renderConvert();
    await screen.findByLabelText("Proje adı");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await user.type(screen.getByLabelText("İl / İlçe"), "A");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await user.clear(screen.getByLabelText("İl / İlçe"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await toStep3(user);
    await user.click(createButton());
    await screen.findByTestId("convert-done");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});

describe("kalem kapsamı", () => {
  it("çıkarılan satır gövdede YOK; tamamen çıkarılan grup gövdeye girmez", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await priceDemir(user);
    await user.click(within(rowOf("o:it-3")).getByRole("checkbox", { name: "Sözleşmeye dahil et" }));
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    await screen.findByTestId("convert-done");
    const body = convertBodies()[0] as { groups: { name: string }[] };
    expect(body.groups.map((group) => group.name)).toEqual(["KABA İNŞAAT"]);
    expect(JSON.stringify(body)).not.toContain("it-3");
  });

  it("hiç kalem dahil değilse 'En az bir kalem sözleşmeye dahil olmalı' ve adım ilerlemez", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    for (const key of ["o:it-1", "o:it-2", "o:it-3"]) {
      await user.click(within(rowOf(key)).getByRole("checkbox", { name: "Sözleşmeye dahil et" }));
    }
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    expect(screen.getByText("En az bir kalem sözleşmeye dahil olmalı")).toBeInTheDocument();
    expect(screen.queryByTestId("convert-step-3")).not.toBeInTheDocument();
  });
});
