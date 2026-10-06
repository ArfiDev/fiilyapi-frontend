import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { EMPTY_PERSONNEL_HR_FIELDS } from "@/lib/api/hooks/personnel-fixtures";
import type { PersonnelDetailResponse } from "@/lib/api/hooks/usePersonnelDetail";
import type { MeResponse } from "@/lib/auth/types";

import { PersonnelHeaderCard } from "./PersonnelHeaderCard";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function mockSession(hidden: readonly string[]) {
  vi.mocked(useSession).mockReturnValue({
    me: { hidden_fields: hidden } as unknown as MeResponse,
    isLoading: false,
  });
}

const BASE: PersonnelDetailResponse = {
  ...EMPTY_PERSONNEL_HR_FIELDS,
  id: "per-9",
  full_name: "Mehmet Yılmaz",
  trade: "Elektrikçi",
  source: "company",
  subcontractor_id: null,
  user_id: null,
  is_active: true,
  hire_date: "2026-01-15",
  wage_type: "daily",
};

const FULL: PersonnelDetailResponse = {
  ...BASE,
  phone: "0532 111 22 33",
  email: "mehmet@ornek.com",
  address: "Cumhuriyet Mah.",
  wage_amount: "1200.00",
  sgk_no: "123456789",
  iban: "TR120001009300123456789012",
};

function renderCard(personnel: PersonnelDetailResponse) {
  return render(<PersonnelHeaderCard personnel={personnel} editHref="/personel/per-9/duzenle" />);
}

describe("IZN-F4c.2 · personel detay başlığı — maskeli kimlik/iletişim/ücret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(["maas_kisisel"]);
  });

  it("PII null + kategori gizli: telefon/e-posta/adres/SGK/IBAN/ücret '—' + kilit", () => {
    renderCard(BASE);
    const contact = screen.getByTestId("personnel-header-contact");
    expect(within(contact).getAllByTestId("hidden-mark")).toHaveLength(3);
    expect(contact).toHaveTextContent("📞 —");
    // SGK + IBAN şeridi (2) + ücret (1) + iletişim (3)
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(6);
    expect(screen.getByText("Günlük Ücret").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("Günlük Ücret").nextElementSibling).not.toHaveTextContent("₺");
  });

  it("kategori gizli DEĞİLSE null yine '—' ama kilit YOK", () => {
    mockSession([]);
    renderCard(BASE);
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
    expect(screen.getByTestId("personnel-header-contact")).toHaveTextContent("📞 —");
  });

  it("dolu veride kilit YOK ve değerler basılır (IBAN maskeli biçimiyle)", () => {
    renderCard(FULL);
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
    expect(screen.getByTestId("personnel-header-contact")).toHaveTextContent("0532 111 22 33");
    expect(screen.getByText("TR12 0001 0093...")).toBeInTheDocument();
  });

  it("yalnız tum_tutarlar gizliyken kimlik alanlarında kilit YOK (maas_kisisel kategorisi değil)", () => {
    mockSession(["tum_tutarlar"]);
    renderCard(BASE);
    // yalnız ücret (para) sütunu tum_tutarlar'a bağlı
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
  });
});
