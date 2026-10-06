import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ProgressPaymentStatusActions } from "./ProgressPaymentStatusActions";
import { useSession } from "@/components/shell/SessionProvider";
import { PROGRESS_PAYMENT_QUERY_KEY, type ProgressPaymentDetail } from "@/lib/api/hooks/useProgressPayments";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { EMPLOYER_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

// Kaynak oturum yüküdür (spec §2.5.2) — hook kendi isteğini ATMAZ, bu yüzden
// sağlayıcı yerine `useSession` taklit edilir (useModulePermission.test.tsx
// ile aynı desen).
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

/** `undefined` = alanı taşımayan eski oturum → bilinmezlik dalı (level undefined). */
function mockSession(permissions?: Record<string, string>) {
  // IZN-F6a.3 · eski modül seviyesi niyeti sayfa izni olarak kurulur (`undefined` = tam yetkili oturum, SA).
  const level = permissions?.progress_payments;
  const me =
    permissions === undefined
      ? meFixture({ isSystemAdmin: true })
      : meFixture({ pages: levelPages(EMPLOYER_PAYMENT_EDIT, level), isSystemAdmin: level === "admin" });
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false });
}

const PAYMENT_ID = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";

function makeDetail(status: ProgressPaymentDetail["status"]): ProgressPaymentDetail {
  return {
    id: PAYMENT_ID,
    project_id: PROJECT_ID,
    project_name: "Güneşkent Konut",
    sequence_no: 5,
    period_year: 2026,
    period_month: 7,
    description: "Kaba inşaat",
    status,
    vat_pct: "20.00",
    advance_pct: "20.00",
    retainage_pct: "5.00",
    default_coefficient: "1.00",
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    paid_at: null,
    created_by: "44444444-4444-4444-4444-444444444444",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    lines: [],
    groups: [],
    calculation: { gross: "0", vat: "0", advance_deduction: "0", retention: "0", net: "0" },
    progress: { financial_pct: null, physical_pct: null, duration_pct: null },
    dropped_orphan_count: 0,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderActions(detail: ProgressPaymentDetail, client?: QueryClient) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgressPaymentStatusActions detail={detail} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * OLUMSUZ iddia (`not.toHaveBeenCalled`) icin bekleme: `waitFor` olumsuzu
 * bekcileyemez (ilk denemede gecer). Mutasyon istegi bir mikro-gorevde
 * atildigindan, sayaci okumadan once kuyrugun bosalmasi BEKLENIR — aksi hâlde
 * kusur geri geldiginde sayac "henuz cagrilmadi" diye SAHTE-YESIL doner.
 */
async function flushMutations() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("ProgressPaymentStatusActions — durum eşleşmesi (tam yetkili oturum hepsini gösterir)", () => {
  it("draft: yalnız Onaya Gönder görünür", () => {
    mockSession();
    renderActions(makeDetail("draft"));
    expect(screen.getByRole("button", { name: "Onaya Gönder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onayla" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reddet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ödendi İşaretle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onayı Geri Al" })).not.toBeInTheDocument();
  });

  it("pending_approval: Onayla + Reddet görünür, başka buton yok", () => {
    mockSession();
    renderActions(makeDetail("pending_approval"));
    expect(screen.getByRole("button", { name: "Onayla" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reddet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onaya Gönder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ödendi İşaretle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onayı Geri Al" })).not.toBeInTheDocument();
  });

  it("approved: Ödendi İşaretle + Onayı Geri Al görünür, başka buton yok", () => {
    mockSession();
    renderActions(makeDetail("approved"));
    expect(screen.getByRole("button", { name: "Ödendi İşaretle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayı Geri Al" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onayla" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reddet" })).not.toBeInTheDocument();
  });

  it("paid: hiçbir aksiyon yok, alan tamamen boş kalır", () => {
    mockSession();
    renderActions(makeDetail("paid"));
    expect(screen.getByTestId("pp-detail-actions")).toBeEmptyDOMElement();
  });
});

describe("ProgressPaymentStatusActions — izin kapısı (approve/admin eşikleri)", () => {
  it("approve'un altında (request) pending_approval'da Onayla/Reddet gizlenir", () => {
    mockSession({ progress_payments: "request" });
    renderActions(makeDetail("pending_approval"));
    expect(screen.queryByRole("button", { name: "Onayla" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reddet" })).not.toBeInTheDocument();
  });

  it("approve seviyesinde approved'da Ödendi görünür, admin altındaki Geri Al gizlenir", () => {
    mockSession({ progress_payments: "approve" });
    renderActions(makeDetail("approved"));
    expect(screen.getByRole("button", { name: "Ödendi İşaretle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onayı Geri Al" })).not.toBeInTheDocument();
  });

  it("admin seviyesinde approved'da her iki buton da görünür", () => {
    mockSession({ progress_payments: "admin" });
    renderActions(makeDetail("approved"));
    expect(screen.getByRole("button", { name: "Ödendi İşaretle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayı Geri Al" })).toBeInTheDocument();
  });

  it("draft eşiğinin altında (view) Onaya Gönder gizlenir", () => {
    mockSession({ progress_payments: "view" });
    renderActions(makeDetail("draft"));
    expect(screen.queryByRole("button", { name: "Onaya Gönder" })).not.toBeInTheDocument();
  });
});

// 🔴 KAPI — ret gerekçesi ZORUNLUDUR. Bu blok eskiden TAM TERSİNİ ("gerekçe
// boş bırakılırsa gövdesiz çağrılır") bekçiliyordu: K12'nin "mockup'ta ret
// formu yok" çıkarımıydı ve backend `d888591` (OK-1A K2) onu KIRICI biçimde
// geçersiz kıldı. Eski hâliyle ekran CANLIDA boş gerekçeyi POST ediyor,
// kullanıcı 422'yi yalnız "Reddedilemedi." olarak görüyordu.
//
// Ölçü `toBeDisabled()` DEĞİL, GERÇEK ÇAĞRI SAYACIdır: `disabled` yalnız
// butonun görünümünü söyler, isteğin atılmadığını SÖYLEMEZ.
describe("ProgressPaymentStatusActions — Reddet diyaloğu (gerekçe ZORUNLU)", () => {
  it("gerekçe boşken Reddet onay butonu disabled kalır ve HİÇBİR istek atılmaz", async () => {
    mockSession({ progress_payments: "approve" });
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    renderActions(makeDetail("pending_approval"));
    await userEvent.click(screen.getByRole("button", { name: "Reddet" }));
    const dialog = screen.getByRole("dialog", { name: "Hakedişi Reddet" });
    const confirmButton = within(dialog).getByRole("button", { name: "Reddet" });

    // SIRA ÖNEMLİ: önce çağrı sayacı. `toBeDisabled()` önce yazılırsa kusur
    // geri geldiğinde test O satırda düşer ve asıl ölçü — isteğin ATILMAMASI —
    // hiç çalışmaz; sayaç bekçilik etmiyor olur.
    await userEvent.click(confirmButton);
    await flushMutations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(confirmButton).toBeDisabled();
  });

  it("yalnız boşluktan oluşan gerekçede de HİÇBİR istek atılmaz (kırpma kuralı)", async () => {
    mockSession({ progress_payments: "approve" });
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    renderActions(makeDetail("pending_approval"));
    await userEvent.click(screen.getByRole("button", { name: "Reddet" }));
    const dialog = screen.getByRole("dialog", { name: "Hakedişi Reddet" });
    // "   " ÜÇ karakterdir: `!== ""` ile kurulmuş bir kapı bunu geçirir ve
    // sunucu `clean_reject_reason` kırpmasıyla 422 döndürürdü.
    await userEvent.type(within(dialog).getByLabelText("Gerekçe (zorunlu)"), "   ");
    const confirmButton = within(dialog).getByRole("button", { name: "Reddet" });

    await userEvent.click(confirmButton);
    await flushMutations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(confirmButton).toBeDisabled();
  });

  // Kırpma SUNUCUYA GİDEN gövdede de ölçülür: baştaki/sondaki boşluk gerekçenin
  // parçası değildir ve sunucu zaten aynı kırpmayı uygular.
  it("gerekçe doluyken KIRPILMIŞ reason alanıyla çağrılır", async () => {
    mockSession({ progress_payments: "approve" });
    let capturedText: string | null | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        if (String(request).includes("/reject") && request.method === "POST") {
          capturedText = await request.text();
          return jsonResponse(makeDetail("draft"));
        }
        return jsonResponse({});
      }),
    );

    renderActions(makeDetail("pending_approval"));
    await userEvent.click(screen.getByRole("button", { name: "Reddet" }));
    const dialog = screen.getByRole("dialog", { name: "Hakedişi Reddet" });
    await userEvent.type(within(dialog).getByLabelText("Gerekçe (zorunlu)"), "  eksik belge  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reddet" }));

    await waitFor(() => expect(capturedText).not.toBeUndefined());
    expect(JSON.parse(capturedText as string)).toEqual({ reason: "eksik belge" });
  });
});

describe("ProgressPaymentStatusActions — Onayı Geri Al diyaloğu (yıkıcı aksiyon)", () => {
  it("onay verilmeden unapprove çağrılmaz, onaylanınca çağrılır", async () => {
    mockSession({ progress_payments: "admin" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;
      if (String(request).includes("/unapprove") && request.method === "POST") {
        return jsonResponse(makeDetail("pending_approval"));
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderActions(makeDetail("approved"));
    await userEvent.click(screen.getByRole("button", { name: "Onayı Geri Al" }));
    const dialog = screen.getByRole("dialog", { name: "Onayı Geri Al" });
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Onayı Geri Al" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/unapprove"))).toBe(true),
    );
  });
});

describe("ProgressPaymentStatusActions — yükleniyor durumu (çift tıklama koruması)", () => {
  it("istek uçarken tüm butonlar disabled olur", async () => {
    mockSession({ progress_payments: "approve" });
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    renderActions(makeDetail("pending_approval"));
    const rejectBtn = screen.getByRole("button", { name: "Reddet" });
    await userEvent.click(screen.getByRole("button", { name: "Onayla" }));

    expect(screen.getByRole("button", { name: "Onaylanıyor…" })).toBeDisabled();
    expect(rejectBtn).toBeDisabled();

    resolveFetch?.(jsonResponse(makeDetail("approved")));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Onaylanıyor…" })).not.toBeInTheDocument(),
    );
  });
});

describe("ProgressPaymentStatusActions — hata gösterimi (Türkçe, sessiz başarısızlık yasak)", () => {
  it("409'da Türkçe mesaj basılır ve detay sorgusu tazelenir", async () => {
    mockSession({ progress_payments: "approve" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "Bu hakediş zaten onaylanmış." }, 409)),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    renderActions(makeDetail("pending_approval"), client);
    await userEvent.click(screen.getByRole("button", { name: "Onayla" }));

    expect(await screen.findByText("Bu hakediş zaten onaylanmış.")).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [PROGRESS_PAYMENT_QUERY_KEY, PAYMENT_ID],
    });
  });

  it("IZN-B3b: Onaya Gönder 409 detail'i (rol atanmamış) OLDUĞU GİBİ basılır", async () => {
    mockSession();
    const detail = "Bu projede Şantiye Şefi, Muhasebe atanmamış; önce Ayarlar > Kullanıcılar'dan atayın";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ detail }, 409)));

    renderActions(makeDetail("draft"));
    await userEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));

    expect(await screen.findByTestId("pp-detail-action-error")).toHaveTextContent(detail);
  });

  it("IZN-B3b: onay 403 (projede rol yok) metni OLDUĞU GİBİ basılır", async () => {
    mockSession({ progress_payments: "approve" });
    const detail = "Bu projede bu onay adimi icin gereken role sahip degilsiniz";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ detail }, 403)));

    renderActions(makeDetail("pending_approval"));
    await userEvent.click(screen.getByRole("button", { name: "Onayla" }));

    expect(await screen.findByTestId("pp-detail-action-error")).toHaveTextContent(detail);
  });

  it("403'te Türkçe yetki mesajı basılır", async () => {
    mockSession({ progress_payments: "approve" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "Bu işlem için yetkiniz yok." }, 403)),
    );

    renderActions(makeDetail("pending_approval"));
    await userEvent.click(screen.getByRole("button", { name: "Onayla" }));

    expect(await screen.findByText("Bu işlem için yetkiniz yok.")).toBeInTheDocument();
  });

  it("422 doğrulama hatasında dizideki ilk msg alanı basılır", async () => {
    mockSession({ progress_payments: "draft" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ detail: [{ msg: "Toplam sıfırdan büyük olmalı.", loc: ["body"] }] }, 422),
      ),
    );

    renderActions(makeDetail("draft"));
    await userEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));

    expect(await screen.findByText("Toplam sıfırdan büyük olmalı.")).toBeInTheDocument();
  });

  it("govde Turkce detay tasimazsa aksiyona ozgu yedek metin basilir", async () => {
    mockSession({ progress_payments: "draft" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    renderActions(makeDetail("draft"));
    await userEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));

    expect(await screen.findByText("Onaya gönderilemedi.")).toBeInTheDocument();
  });
});

describe("ProgressPaymentStatusActions — SEKME-F1.3b kaydedilmemiş değişiklik kaydı (yalnız Reddet diyaloğu)", () => {
  it("kapalı → false; diyalog açık + gerekçe yazıldı → true; başarılı reddet → false", async () => {
    mockSession({ progress_payments: "approve" });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(makeDetail("draft"))));

    renderActions(makeDetail("pending_approval"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Reddet" }));
    const dialog = screen.getByRole("dialog", { name: "Hakedişi Reddet" });
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await userEvent.type(within(dialog).getByLabelText("Gerekçe (zorunlu)"), "eksik belge");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await userEvent.click(within(dialog).getByRole("button", { name: "Reddet" }));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });
});
