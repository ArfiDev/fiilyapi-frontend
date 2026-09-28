import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { useRejectLeaveRequest } from "@/lib/api/hooks/useLeaveMutations";
import type { LeaveBalanceResponse, LeaveRequestResponse } from "@/lib/api/hooks/useLeaves";
import { BackendError } from "@/lib/api/unwrap";

import { LeaveRejectModal } from "./LeaveRejectModal";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

/**
 * F-IZN T4 · `Form - Izin Reddi.dc.html` diyaloğu.
 *
 * 🔴 Gerekçe kapısı İKİ girdiyle sınanır: boş dize VE tek boşluk. Yalnız `""`
 * ile yazılan bir test `reason !== ""` biçiminde kurulmuş SAHTE bir kapıyı da
 * geçirirdi — sunucunun kuralı `strip()` sonrası boşluktur.
 */
vi.mock("@/lib/api/hooks/useLeaveMutations", () => ({ useRejectLeaveRequest: vi.fn() }));

const rejectAsync = vi.fn();

function request(overrides: Partial<LeaveRequestResponse> = {}): LeaveRequestResponse {
  return {
    id: "lr-1",
    personnel_id: "per-1",
    personnel_name: "Hasan Çelik",
    personnel_trade: "Elektrikçi",
    leave_type_id: "lt-1",
    leave_type_name: "Yıllık",
    leave_type_color: "#2563eb",
    deducts_from_annual: true,
    start_date: "2026-08-10",
    end_date: "2026-08-21",
    days: 12,
    note: null,
    document_id: null,
    status: "pending",
    decided_by: null,
    decided_at: null,
    reject_reason: null,
    created_at: "2026-07-20T09:00:00Z",
    updated_at: "2026-07-20T09:00:00Z",
    ...overrides,
  };
}

function balance(overrides: Partial<LeaveBalanceResponse> = {}): LeaveBalanceResponse {
  return {
    personnel_id: "per-1",
    personnel_name: "Hasan Çelik",
    year: 2026,
    hire_date: "2024-01-15",
    seniority_years: 2,
    seniority_months: 0,
    annual_entitlement: 14,
    carried_over: "0",
    used: 6,
    remaining: "8",
    usage_pct: 42,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rejectAsync.mockResolvedValue({ id: "lr-1" });
  vi.mocked(useRejectLeaveRequest).mockReturnValue({
    mutateAsync: rejectAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useRejectLeaveRequest>);
});

describe("LeaveRejectModal — talep özeti (R 71-100)", () => {
  it("ad, tip rozeti, iki tarih ve gün basılır", () => {
    render(
      <LeaveRejectModal request={request()} balances={[balance()]} onClose={vi.fn()} />,
    );
    const summary = screen.getByTestId("iz-reject-summary");

    expect(summary).toHaveTextContent("Hasan Çelik");
    expect(summary).toHaveTextContent("Yıllık");
    expect(summary).toHaveTextContent("10.08.2026");
    expect(summary).toHaveTextContent("21.08.2026");
    expect(summary).toHaveTextContent("12");
  });

  it("🔴 KARŞILIKSIZ ALAN · ŞANTİYE adı UYDURULMAZ, yalnız meslek basılır (77)", () => {
    render(
      <LeaveRejectModal request={request()} balances={[balance()]} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId("iz-reject-summary")).toHaveTextContent("Elektrikçi");
    expect(screen.getByTestId("iz-reject-summary")).not.toHaveTextContent("Şantiye");
  });

  it("sistem notu aşım HESAPLANABİLİYORSA basılır (95-99)", () => {
    render(
      <LeaveRejectModal request={request()} balances={[balance()]} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId("iz-reject-system-note")).toHaveTextContent(
      "Kalan hak 8 gün — talep 4 gün aşıyor",
    );
  });

  it("🔴 kalan hak BİLİNMİYORSA sistem notu BASILMAZ", () => {
    render(
      <LeaveRejectModal
        request={request()}
        balances={[balance({ remaining: null, annual_entitlement: null })]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("iz-reject-system-note")).not.toBeInTheDocument();
  });

  it("🔴 yıllık haktan düşmeyen tipte sistem notu BASILMAZ", () => {
    render(
      <LeaveRejectModal
        request={request({ deducts_from_annual: false })}
        balances={[balance()]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("iz-reject-system-note")).not.toBeInTheDocument();
  });

  it("bakiye hiç yoksa (JOIN eşleşmiyor) not basılmaz — çökmez", () => {
    render(<LeaveRejectModal request={request()} balances={undefined} onClose={vi.fn()} />);

    expect(screen.queryByTestId("iz-reject-system-note")).not.toBeInTheDocument();
  });
});

describe("LeaveRejectModal — gerekçe kapısı (R 104-128)", () => {
  it("gerekçe BOŞken 'Reddet' PASİF ve uyarı görünür", () => {
    render(
      <LeaveRejectModal request={request()} balances={[balance()]} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId("iz-reject-submit")).toBeDisabled();
    expect(screen.getByTestId("iz-reject-required")).toHaveTextContent("Gerekçe zorunlu");
  });

  it("🔴 TEK BOŞLUK karakteri kapıyı GEÇMEZ (`strip()` sonrası boş → 422)", async () => {
    const user = userEvent.setup();
    render(
      <LeaveRejectModal request={request()} balances={[balance()]} onClose={vi.fn()} />,
    );
    await user.type(screen.getByTestId("iz-reject-reason"), "   ");

    expect(screen.getByTestId("iz-reject-submit")).toBeDisabled();
    expect(screen.getByTestId("iz-reject-required")).toBeVisible();
  });

  it("dolu gerekçede düğme açılır ve uyarı kalkar", async () => {
    const user = userEvent.setup();
    render(
      <LeaveRejectModal request={request()} balances={[balance()]} onClose={vi.fn()} />,
    );
    await user.type(screen.getByTestId("iz-reject-reason"), "Belge eksik");

    expect(screen.getByTestId("iz-reject-submit")).toBeEnabled();
    expect(screen.queryByTestId("iz-reject-required")).not.toBeInTheDocument();
  });

  it("hazır gerekçe alana YAZAR ve metin sonradan düzenlenebilir (110-120)", async () => {
    const user = userEvent.setup();
    render(
      <LeaveRejectModal request={request()} balances={[balance()]} onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Kritik iş programı çakışması" }));

    const textarea = screen.getByTestId("iz-reject-reason");
    expect(textarea).toHaveValue("Kritik iş programı çakışması");

    await user.type(textarea, " — Ağustos");
    expect(textarea).toHaveValue("Kritik iş programı çakışması — Ağustos");
  });
});

describe("LeaveRejectModal — gönderim (POST /leave-requests/{id}/reject)", () => {
  it("gerekçe BUDANMIŞ olarak gider ve diyalog kapanır", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <LeaveRejectModal request={request()} balances={[balance()]} onClose={onClose} />,
    );
    await user.type(screen.getByTestId("iz-reject-reason"), "  Belge eksik  ");
    await user.click(screen.getByTestId("iz-reject-submit"));

    expect(rejectAsync).toHaveBeenCalledWith({ requestId: "lr-1", reason: "Belge eksik" });
    expect(onClose).toHaveBeenCalled();
  });

  it("sunucu hatası YUTULMAZ, diyalog AÇIK kalır", async () => {
    rejectAsync.mockRejectedValue(new BackendError(409, { detail: "Talep zaten karara bağlandı." }));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <LeaveRejectModal request={request()} balances={[balance()]} onClose={onClose} />,
    );
    await user.type(screen.getByTestId("iz-reject-reason"), "Belge eksik");
    await user.click(screen.getByTestId("iz-reject-submit"));

    expect(screen.getByTestId("iz-reject-error")).toHaveTextContent(
      "Talep zaten karara bağlandı.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("LeaveRejectModal — SEKME-F1.3b kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı/dokunulmadı → false; gerekçe yazıldı → true; başarılı kayıt → false (kapanış)", async () => {
    const user = userEvent.setup();
    let unmount = () => {};
    const onClose = vi.fn(() => unmount());
    ({ unmount } = render(
      <LeaveRejectModal request={request()} balances={[balance()]} onClose={onClose} />,
    ));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.type(screen.getByTestId("iz-reject-reason"), "Belge eksik");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await user.click(screen.getByTestId("iz-reject-submit"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
