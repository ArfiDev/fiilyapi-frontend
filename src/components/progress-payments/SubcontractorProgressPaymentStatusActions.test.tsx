import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SubcontractorProgressPaymentStatusActions } from "./SubcontractorProgressPaymentStatusActions";
import { useSession } from "@/components/shell/SessionProvider";
import type { MeResponse } from "@/lib/auth/types";
import type { SubcontractorProgressPaymentDetail } from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const BASE_ME = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "ayse@ornek.com",
  full_name: "Ayşe Yılmaz",
  title: null,
  role_key: "procurement",
  status: "active",
} as unknown as MeResponse;

function mockSession(permissions?: Record<string, string>) {
  const me = permissions === undefined ? BASE_ME : { ...BASE_ME, permissions };
  vi.mocked(useSession).mockReturnValue({ me: me as MeResponse, isLoading: false });
}

const PAYMENT_ID = "22222222-2222-2222-2222-222222222222";

function makeDetail(
  status: SubcontractorProgressPaymentDetail["status"],
): SubcontractorProgressPaymentDetail {
  return {
    id: PAYMENT_ID,
    contract_id: "33333333-3333-3333-3333-333333333333",
    project_id: "44444444-4444-4444-4444-444444444444",
    project_name: "Güneşkent Konut",
    subcontractor_name: "Aydın Elektrik Taah.",
    contract_no: "SZL-2025-001",
    work_category: "Kaba İnşaat",
    sequence_no: 5,
    period_year: 2026,
    period_month: 7,
    description: "Kaba inşaat",
    status,
    vat_pct: "20.00",
    advance_pct: "20.00",
    retainage_pct: "5.00",
    default_coefficient: "1.00",
    section_id: null,
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    paid_at: null,
    rejected_at: null,
    rejection_reason: null,
    is_revision_required: false,
    created_by: "55555555-5555-5555-5555-555555555555",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    lines: [],
    calculation: { gross: "0", vat: "0", advance_deduction: "0", retention: "0", net: "0" },
    dropped_orphan_count: 0,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderActions(
  detail: SubcontractorProgressPaymentDetail,
  client?: QueryClient,
) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SubcontractorProgressPaymentStatusActions detail={detail} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// Gate 1: durum-bazlı buton setinin dört durumda doğru çıkması.
describe("SubcontractorProgressPaymentStatusActions — durum eşleşmesi", () => {
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
  });

  it("approved: Ödendi İşaretle + Onayı Geri Al görünür", () => {
    mockSession({ progress_payments: "admin" });
    renderActions(makeDetail("approved"));
    expect(screen.getByRole("button", { name: "Ödendi İşaretle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayı Geri Al" })).toBeInTheDocument();
  });

  it("paid: hiçbir aksiyon yok, alan tamamen boş kalır", () => {
    mockSession();
    renderActions(makeDetail("paid"));
    expect(screen.getByTestId("th-detail-actions")).toBeEmptyDOMElement();
  });
});

// Gate 2: reddetme modalının boş gerekçeyi engellemesi (İşveren'den FARKLI —
// taşeronda gerekçe ZORUNLU, brief §Durum-bazlı buton seti).
describe("SubcontractorProgressPaymentStatusActions — Reddet diyaloğu (gerekçe ZORUNLU)", () => {
  it("gerekçe boşken Reddet onay butonu disabled kalır, istek atılmaz", async () => {
    mockSession({ progress_payments: "approve" });
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    renderActions(makeDetail("pending_approval"));
    await userEvent.click(screen.getByRole("button", { name: "Reddet" }));
    const dialog = screen.getByRole("dialog", { name: "Hakedişi Reddet" });
    const confirmButton = within(dialog).getByRole("button", { name: "Reddet" });
    expect(confirmButton).toBeDisabled();

    await userEvent.click(confirmButton);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("yalnız boşluk karakterinden oluşan gerekçe de engellenir (kırpma kuralı)", async () => {
    mockSession({ progress_payments: "approve" });
    renderActions(makeDetail("pending_approval"));
    await userEvent.click(screen.getByRole("button", { name: "Reddet" }));
    const dialog = screen.getByRole("dialog", { name: "Hakedişi Reddet" });
    await userEvent.type(within(dialog).getByLabelText("Gerekçe (zorunlu)"), "   ");
    expect(within(dialog).getByRole("button", { name: "Reddet" })).toBeDisabled();
  });

  it("gerekçe doluyken reason alanıyla çağrılır", async () => {
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
    await userEvent.type(within(dialog).getByLabelText("Gerekçe (zorunlu)"), "eksik metraj");
    const confirmButton = within(dialog).getByRole("button", { name: "Reddet" });
    expect(confirmButton).not.toBeDisabled();
    await userEvent.click(confirmButton);

    await waitFor(() => expect(capturedText).not.toBeUndefined());
    expect(JSON.parse(capturedText as string)).toEqual({ reason: "eksik metraj" });
  });

  it("maxLength 500 sınırı textarea'da uygulanır", async () => {
    mockSession({ progress_payments: "approve" });
    renderActions(makeDetail("pending_approval"));
    await userEvent.click(screen.getByRole("button", { name: "Reddet" }));
    const dialog = screen.getByRole("dialog", { name: "Hakedişi Reddet" });
    expect(within(dialog).getByLabelText("Gerekçe (zorunlu)")).toHaveAttribute("maxLength", "500");
  });
});

describe("SubcontractorProgressPaymentStatusActions — hata gösterimi", () => {
  it("409'da Türkçe mesaj basılır", async () => {
    mockSession({ progress_payments: "approve" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "Bu hakediş zaten onaylanmış." }, 409)),
    );

    renderActions(makeDetail("pending_approval"));
    await userEvent.click(screen.getByRole("button", { name: "Onayla" }));

    expect(await screen.findByText("Bu hakediş zaten onaylanmış.")).toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentStatusActions — SEKME-F1.3b kaydedilmemiş değişiklik kaydı (yalnız Reddet diyaloğu)", () => {
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
