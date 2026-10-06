import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { EMPTY_PERSONNEL_HR_FIELDS } from "@/lib/api/hooks/personnel-fixtures";
import { usePersonnelDetail } from "@/lib/api/hooks/usePersonnelDetail";
import { useCreatePersonnel, useUpdatePersonnel } from "@/lib/api/hooks/usePersonnelMutations";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import type { MeResponse } from "@/lib/auth/types";

import { PersonnelForm } from "./PersonnelForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/usePersonnelMutations", () => ({
  useCreatePersonnel: vi.fn(),
  useUpdatePersonnel: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePersonnelDetail", () => ({ usePersonnelDetail: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractors", () => ({ useSubcontractors: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));

const createMutate = vi.fn();
const updateMutate = vi.fn();

/** maas_kisisel gizliyken sunucu dokuz alanı `null` döner (IZN-B4c-SOZLESME §2). */
const MASKED_FIELDS = [
  "tc_no",
  "birth_date",
  "phone",
  "email",
  "address",
  "emergency_contact_phone",
  "iban",
  "sgk_no",
  "wage_amount",
] as const;

const DETAIL = {
  ...EMPTY_PERSONNEL_HR_FIELDS,
  id: "per-9",
  full_name: "Mehmet Yılmaz",
  trade: "Elektrikçi",
  source: "company" as const,
  subcontractor_id: null,
  user_id: null,
  is_active: true,
  hire_date: "2026-01-15",
  assigned_project_id: "p-1",
  wage_type: "daily" as const,
  payment_method: "bank" as const,
  is_draft: false,
};

function mockSession(hidden: readonly string[]) {
  vi.mocked(useSession).mockReturnValue({
    me: { permissions: { personnel: "full" }, hidden_fields: hidden } as unknown as MeResponse,
    isLoading: false,
  });
}

function mockDetail(overrides: Record<string, unknown> = {}) {
  vi.mocked(usePersonnelDetail).mockReturnValue({
    data: { ...DETAIL, ...overrides },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
}

function saveButton(name: string) {
  return within(document.querySelector(".pf-actions") as HTMLElement).getByRole("button", { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession(["maas_kisisel"]);
  mockDetail();
  vi.mocked(useCreatePersonnel).mockReturnValue({ mutate: createMutate, isPending: false } as never);
  vi.mocked(useUpdatePersonnel).mockReturnValue({ mutate: updateMutate, isPending: false } as never);
  vi.mocked(useSubcontractors).mockReturnValue({ data: { items: [] }, isLoading: false, isError: false } as never);
  vi.mocked(useProjects).mockReturnValue({
    data: { items: [{ id: "p-1", name: "Güneşkent A-Blok" }] },
    isLoading: false,
    isError: false,
  } as never);
});

describe("IZN-F4c.2 · personel düzenleme formu — maskeli alanlar", () => {
  it("dokuz alan salt okunur '—' + kilit; PATCH gövdesinde HİÇBİRİ yok", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);

    for (const label of ["TC Kimlik No", "Doğum Tarihi", "Cep Telefonu", "E-posta", "Adres", "Acil Durum Telefonu", "IBAN", "SGK Sicil No", "Ücret Tutarı (₺)"]) {
      const control = screen.getByLabelText(label);
      expect(control).toHaveValue("—");
      expect(control).toBeDisabled();
    }
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(9);

    await user.selectOptions(screen.getByLabelText("Meslek / Görev"), "Sıhhi Tesisatçı");
    await user.click(saveButton("Kaydet"));

    const body = updateMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({ trade: "Sıhhi Tesisatçı", full_name: "Mehmet Yılmaz" });
    for (const field of MASKED_FIELDS) expect(field in body, field).toBe(false);
    // maskesiz alanlar eskisi gibi gider
    expect(body).toHaveProperty("emergency_contact_name");
    // IZN-F5a.2: atamaya dokunulmadı → anahtar yok
    expect("assigned_project_id" in body).toBe(false);
  });

  it("maskeli IBAN gövdeye ASLA konmaz (null da DEĞİL: gerçek değeri silerdi)", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    await user.click(saveButton("Kaydet"));
    const body = updateMutate.mock.calls[0][0] as Record<string, unknown>;
    expect("iban" in body).toBe(false);
    expect(body.iban).not.toBeNull();
  });

  it("taslağı yayına alma maskeli zorunlu alanlar yüzünden ENGELLENMEZ", async () => {
    mockDetail({ is_draft: true });
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    await user.type(screen.getByLabelText("Acil Durum Kişisi"), "Ayşe Yılmaz");
    await user.click(saveButton("Yayına Al"));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const body = updateMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(body.is_draft).toBe(false);
    expect("tc_no" in body).toBe(false);
  });

  it("kategori gizli DEĞİLSE alanlar normal: kilit yok, null gövdede null gider (eski davranış)", async () => {
    mockSession([]);
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
    expect(screen.getByLabelText("IBAN")).not.toBeDisabled();
    await user.click(saveButton("Kaydet"));
    const body = updateMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toHaveProperty("iban", null);
    expect(body).toHaveProperty("tc_no", null);
  });

  it("kategori gizli ama değer DOLU gelirse (proje bağlamı farkı) alan düzenlenir ve gövdeye girer", async () => {
    mockDetail({ iban: "TR120001009300123456789012" });
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByLabelText("IBAN")).toHaveValue("TR120001009300123456789012");
    await user.click(saveButton("Kaydet"));
    const body = updateMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toHaveProperty("iban", "TR120001009300123456789012");
    expect("tc_no" in body).toBe(false); // diğerleri hâlâ maskeli
  });

  it("OLUŞTURMA (POST) serbest: alanlar açık, kilit yok", () => {
    render(<PersonnelForm mode="create" />);
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
    expect(screen.getByLabelText("IBAN")).not.toBeDisabled();
    expect(screen.getByLabelText("TC Kimlik No")).not.toBeDisabled();
  });
});
