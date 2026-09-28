import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MeResponse } from "@/lib/auth/types";
import { BackendError } from "@/lib/api/unwrap";
import {
  useApprovalRoleAssignments,
  useApprovalSettings,
  useSetApprovalRoles,
  useUpdateApprovalSettings,
} from "@/lib/api/hooks/useApprovals";
import { useRoles } from "@/lib/api/hooks/useRoles";
import { useUsers } from "@/lib/api/hooks/useUsers";
import { useSession } from "@/components/shell/SessionProvider";

import { APPROVAL_PENDING_COLUMN_REASON } from "./approval-role-admin";
import { ApprovalRolesScreen } from "./ApprovalRolesScreen";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useApprovals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useApprovals")>()),
  useApprovalRoleAssignments: vi.fn(),
  useApprovalSettings: vi.fn(),
  useSetApprovalRoles: vi.fn(),
  useUpdateApprovalSettings: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useRoles", () => ({ useRoles: vi.fn() }));
vi.mock("@/lib/api/hooks/useUsers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useUsers")>()),
  useUsers: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const setRolesMutate = vi.fn();
const setSettingsMutate = vi.fn();

const USERS = [
  { id: "u-1", email: "a.yilmaz@fiil.com", full_name: "Ahmet Yılmaz", title: "", role_id: "role-patron", status: "active" },
  { id: "u-3", email: "a.demir@fiil.com", full_name: "Ayşe Demir", title: "", role_id: "role-accounting", status: "active" },
  { id: "u-5", email: "y.kaya@fiil.com", full_name: "Yusuf Kaya", title: "", role_id: "role-procurement", status: "active" },
];

const ROLES = [
  { id: "role-patron", key: "patron", name: "Patron" },
  { id: "role-accounting", key: "accounting", name: "Muhasebe" },
  { id: "role-procurement", key: "procurement", name: "Satınalma" },
];

function q(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, error: null, isError: false, isLoading: false, ...extra } as never;
}

/** `permissions` yükü olan/olmayan oturum — eşik kapısı BUNDAN okunur. */
function mockSession(approvalsLevel: string | undefined) {
  const me = {
    id: "me",
    email: "me@fiil.com",
    full_name: "Deneme",
    title: "",
    role_key: "accounting",
    status: "active",
    ...(approvalsLevel === undefined ? {} : { permissions: { approvals: approvalsLevel } }),
  } as unknown as MeResponse;
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as never);
}

beforeEach(() => {
  vi.mocked(useUsers).mockReturnValue(q({ items: USERS, total: USERS.length, limit: 200, offset: 0 }));
  vi.mocked(useRoles).mockReturnValue(q(ROLES));
  vi.mocked(useApprovalRoleAssignments).mockReturnValue(
    q({
      items: [
        {
          user_id: "u-1",
          full_name: "Ahmet Yılmaz",
          email: "a.yilmaz@fiil.com",
          approval_roles: ["project_manager", "accounting", "patron"],
        },
      ],
      total: 1,
      limit: 200,
      offset: 0,
    }),
  );
  vi.mocked(useApprovalSettings).mockReturnValue(q({ approval_threshold_try: "500000.00" }));
  vi.mocked(useSetApprovalRoles).mockReturnValue({ mutate: setRolesMutate, isPending: false } as never);
  vi.mocked(useUpdateApprovalSettings).mockReturnValue({
    mutate: setSettingsMutate,
    isPending: false,
  } as never);
  mockSession("admin");
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApprovalRolesScreen />
    </QueryClientProvider>,
  );
}

describe("ApprovalRolesScreen — satır kümesi", () => {
  it("🔴 ROLÜ OLMAYAN kullanıcıyı da basar (atama ucu onları DÖNDÜRMEZ)", () => {
    renderScreen();
    // `GET /approvals/roles` yalnız u-1'i döndü; kalan ikisi katalogdan geldi.
    expect(screen.getByText("Yusuf Kaya")).toBeInTheDocument();
    expect(screen.getByText("Ayşe Demir")).toBeInTheDocument();
  });

  it("🔴 sayaç VERİDEN türetilir — mockup'ın '8 kullanıcı'sı basılmaz", () => {
    renderScreen();
    expect(screen.getByText("3 kullanıcı")).toBeInTheDocument();
    expect(screen.queryByText("8 kullanıcı")).not.toBeInTheDocument();
  });

  it("çoklu rol GÖRÜNÜR: üç çip aynı satırda basılı durumdadır", () => {
    renderScreen();
    const row = screen.getByText("Ahmet Yılmaz").closest("tr")!;
    const pressed = within(row)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => b.textContent);
    expect(pressed).toEqual(["Proje Müdürü", "Muhasebe", "Patron"]);
  });
});

describe("ApprovalRolesScreen — 'Bekleyen' kolonu", () => {
  /**
   * 🔴 YAPISAL bekçi (F-DASHONAY dersi): metin tabanlı olumsuz iddia, metin
   * değişebiliyorsa hiçbir şey kanıtlamaz. Burada iddia SAYININ YOKLUĞUdur.
   */
  it("sayı UYDURMAZ — hücrelerin hiçbirinde rakam yoktur", () => {
    renderScreen();
    const cells = document.querySelectorAll(".okr-td--pending");
    expect(cells).toHaveLength(3);
    for (const cell of cells) expect(cell.textContent).not.toMatch(/\d/);
  });

  it("kolon SİLİNMEZ: başlık devre-dışı, gerekçe GÖRÜNÜR", () => {
    renderScreen();
    const head = screen.getByRole("columnheader", { name: "Bekleyen" });
    expect(head).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(APPROVAL_PENDING_COLUMN_REASON)).toBeInTheDocument();
  });
});

describe("ApprovalRolesScreen — rol yazma", () => {
  it("çip tıklaması TAM KÜMEYİ gönderir (eklenen rol dahil, sıra kanonik)", async () => {
    renderScreen();
    const row = screen.getByText("Ahmet Yılmaz").closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Şantiye Şefi" }));
    expect(setRolesMutate).toHaveBeenCalledTimes(1);
    expect(setRolesMutate.mock.calls[0][0]).toEqual({
      userId: "u-1",
      roles: ["site_chief", "project_manager", "accounting", "patron"],
    });
  });

  it("basılı çipe tıklamak rolü KÜMEDEN ÇIKARIR", async () => {
    renderScreen();
    const row = screen.getByText("Ahmet Yılmaz").closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Patron" }));
    expect(setRolesMutate.mock.calls[0][0].roles).toEqual(["project_manager", "accounting"]);
  });
});

describe("ApprovalRolesScreen — eşik kapısı", () => {
  it("`admin` seviyesinde alan yazılabilir ve Kaydet düğmesi VARDIR", () => {
    renderScreen();
    expect(screen.getByLabelText(/Patron Onay Eşiği/)).not.toHaveAttribute("readonly");
    expect(screen.getByTestId("okr-threshold-save")).toBeInTheDocument();
  });

  it("🔴 `full` seviyede alan KİLİTLİ, Kaydet YOK, gerekçe GÖRÜNÜR", () => {
    mockSession("full");
    renderScreen();
    expect(screen.getByLabelText(/Patron Onay Eşiği/)).toHaveAttribute("readonly");
    expect(screen.queryByTestId("okr-threshold-save")).not.toBeInTheDocument();
    expect(screen.getByText(/salt okunur/)).toBeInTheDocument();
  });

  it("seviye BİLİNMİYORSA kapı AÇIK kalır (bilinmezlik kuralı, ters çevrilemez)", () => {
    mockSession(undefined);
    renderScreen();
    expect(screen.getByTestId("okr-threshold-save")).toBeInTheDocument();
  });

  it("🔴 KORKULUK: sözleşmenin reddedeceği değer İSTEK ÜRETMEZ, gerekçe basar", async () => {
    renderScreen();
    const input = screen.getByLabelText(/Patron Onay Eşiği/);
    await userEvent.clear(input);
    await userEvent.type(input, "-5");
    await userEvent.click(screen.getByTestId("okr-threshold-save"));
    expect(setSettingsMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Eşik negatif olamaz.")).toBeInTheDocument();
  });

  it("🔴 KORKULUK: üç ondalık da İSTEK ÜRETMEZ (`decimal_places=2`)", async () => {
    renderScreen();
    const input = screen.getByLabelText(/Patron Onay Eşiği/);
    await userEvent.clear(input);
    await userEvent.type(input, "100.005");
    await userEvent.click(screen.getByTestId("okr-threshold-save"));
    expect(setSettingsMutate).not.toHaveBeenCalled();
  });

  it("geçerli değer ondalık STRING olarak gönderilir (float yolu YOK)", async () => {
    renderScreen();
    const input = screen.getByLabelText(/Patron Onay Eşiği/);
    await userEvent.clear(input);
    await userEvent.type(input, "750000,50");
    await userEvent.click(screen.getByTestId("okr-threshold-save"));
    await waitFor(() => expect(setSettingsMutate).toHaveBeenCalledTimes(1));
    expect(setSettingsMutate.mock.calls[0][0]).toBe("750000.50");
  });

  it("eşik şeridi `≥` glifi BASMAZ, eşiği ayardan okur", () => {
    renderScreen();
    expect(screen.getByText("₺500.000 ve üstü")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("≥");
  });
});

describe("ApprovalRolesScreen — yükleme/yetki dalları", () => {
  it("HERHANGİ bir kaynak yüklenirken kadraj alınmaz (dört ayrı sorgu)", () => {
    vi.mocked(useApprovalSettings).mockReturnValue(q(undefined, { isLoading: true }));
    renderScreen();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("403 → AccessDenied (uç `approvals: admin` kapısındadır)", () => {
    vi.mocked(useApprovalRoleAssignments).mockReturnValue(
      q(undefined, { isError: true, error: new BackendError(403, undefined) }),
    );
    renderScreen();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("SEKME-F1.3b — kaydedilmemiş değişiklik kaydı (yalnız eşik alt-formu)", () => {
  it("yüklendi + dokunulmadı → false", () => {
    renderScreen();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("eşik alanı yazıldı → true", async () => {
    renderScreen();
    const input = screen.getByLabelText(/Patron Onay Eşiği/);
    await userEvent.clear(input);
    await userEvent.type(input, "750000");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt → false (`savedThreshold` değişince taslak KENDİLİĞİNDEN sıfırlanır)", async () => {
    const { rerender } = renderScreen();
    const input = screen.getByLabelText(/Patron Onay Eşiği/);
    await userEvent.clear(input);
    await userEvent.type(input, "750000");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByTestId("okr-threshold-save"));
    await waitFor(() => expect(setSettingsMutate).toHaveBeenCalledTimes(1));
    // Gerçek akışta `updateSettings` onSuccess → invalidateQueries →
    // `settingsQuery.data` yenilenir. Burada AYNI etki mock'un sunucu
    // değerini güncelleyip yeniden render ederek taklit edilir.
    vi.mocked(useApprovalSettings).mockReturnValue(q({ approval_threshold_try: "750000.00" }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <ApprovalRolesScreen />
      </QueryClientProvider>,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
