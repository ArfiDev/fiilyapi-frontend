import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "@/lib/api/unwrap";
import { useApprovalSettings, useUpdateApprovalSettings } from "@/lib/api/hooks/useApprovals";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { ApprovalRolesScreen } from "./ApprovalRolesScreen";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useApprovals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useApprovals")>()),
  useApprovalSettings: vi.fn(),
  useUpdateApprovalSettings: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const setSettingsMutate = vi.fn();

function q(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, error: null, isError: false, isLoading: false, ...extra } as never;
}

/** Sayfa izni yükü olan/olmayan oturum — eşik kapısı `ayarlar.onay_rolleri` sayfa izninden okunur (IZN-F6a). */
function mockSession(approvalsLevel: string | undefined) {
  const me =
    approvalsLevel === undefined
      ? meFixture({ pages: {} })
      : meFixture({ pages: { "ayarlar.onay_rolleri": pageGrant(approvalsLevel === "admin" ? "edit" : "view") } });
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as never);
}

beforeEach(() => {
  vi.mocked(useApprovalSettings).mockReturnValue(q({ approval_threshold_try: "500000.00" }));
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

describe("ApprovalRolesScreen — IZN-B3b Onay Eşiği sayfası", () => {
  it("kullanıcı × rol tablosu YOKTUR", () => {
    renderScreen();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Kullanıcı Onay Rolleri")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { pressed: true })).not.toBeInTheDocument();
  });

  it("tek satır not VAR ve Kullanıcılar'a bağlanır", () => {
    renderScreen();
    expect(screen.getByTestId("okr-intro-note")).toHaveTextContent(
      "Onayı, belgenin projesinde ilgili role atanmış kişi verir (Ayarlar > Kullanıcılar)",
    );
    expect(screen.getByRole("link", { name: /Kullanıcılar/ })).toHaveAttribute(
      "href",
      "/ayarlar/kullanicilar",
    );
  });

  it("eşik kartı KALIR (başlık 'Onay Eşiği')", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Onay Eşiği" })).toBeInTheDocument();
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

  // IZN-F6a · bilinmezlik kuralı KALKTI: sayfa izni hiç yoksa kapı KAPALI (fail-closed).
  it("sayfa izni YOKSA kapı KAPALI kalır: alan kilitli, Kaydet yok", () => {
    mockSession(undefined);
    renderScreen();
    expect(screen.getByLabelText(/Patron Onay Eşiği/)).toHaveAttribute("readonly");
    expect(screen.queryByTestId("okr-threshold-save")).not.toBeInTheDocument();
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
  it("eşik yüklenirken kadraj alınmaz", () => {
    vi.mocked(useApprovalSettings).mockReturnValue(q(undefined, { isLoading: true }));
    renderScreen();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("403 → AccessDenied (uç `approvals: admin` kapısındadır)", () => {
    vi.mocked(useApprovalSettings).mockReturnValue(
      q(undefined, { isError: true, error: new BackendError(403, undefined) }),
    );
    renderScreen();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("SEKME-F1.3b — kaydedilmemiş değişiklik kaydı (eşik alt-formu)", () => {
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
