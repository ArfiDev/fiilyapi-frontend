import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useSession } from "@/components/shell/SessionProvider";
import type { DiaryCoreActions, DiaryExtension } from "@/components/site-diary/diary-extension";
import { useEvCodeTree, useEvDay, usePreviousAllocation } from "@/lib/api/hooks/useEvDay";
import { useSaveDayAllocation, useUnlockDay } from "@/lib/api/hooks/useEvDayMutations";
import { useEvSettings } from "@/lib/api/hooks/useEvSettings";
import { useEvBudget, useEvBudgetRevisions } from "@/lib/api/hooks/useEvBudget";
import { useSite } from "@/lib/api/hooks/useSites";
import type { EvDayView } from "@/lib/api/models";

import { DAY, ITEM_KALIP, SEC_K610, codeTree, dayView } from "./diary-fixtures";
import { useDiaryProgressExtension } from "./useDiaryProgressExtension";
import { evDiaryMe } from "../ev-session.testkit";

// PLN-F2.5e · adaptörün ÜRETTİĞİ yuvalar (çekirdek ekran render EDİLMEZ —
// çekirdek davranışı `DiaryProgressAdapter.test.tsx` entegrasyonundadır).

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvDay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEvDay")>()),
  useEvDay: vi.fn(),
  useEvCodeTree: vi.fn(),
  usePreviousAllocation: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEvDayMutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEvDayMutations")>()),
  useSaveDayAllocation: vi.fn(),
  useUnlockDay: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEvSettings", () => ({ useEvSettings: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvBudget", () => ({ useEvBudget: vi.fn(), useEvBudgetRevisions: vi.fn() }));

const LOCKED = { locked: true, report_date: "2026-09-25", approved_at: null, approved_by: null, unlock: null };

function query(data: unknown) {
  return { data, isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() } as never;
}

function mockSession(permissions: Record<string, string>) {
  vi.mocked(useSession).mockReturnValue({
    me: evDiaryMe(permissions),
    isLoading: false,
  });
}

function mockDay(view: EvDayView) {
  vi.mocked(useEvDay).mockReturnValue(query(view));
}

function extension(): DiaryExtension | undefined {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const ctx = { siteId: "s-1", day: DAY, entryId: "d-1", entryStatus: "draft" as const, lines: [{ key: "a", boqItemId: ITEM_KALIP, sectionId: SEC_K610, quantityToday: "93" }] };
  return renderHook(() => useDiaryProgressExtension(ctx), { wrapper }).result.current;
}

function renderSlot(node: ReactNode) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/** `fullWidthBlock` karar 6 gereği FONKSİYON; çekirdeğin eylemleriyle çağrılır. */
function renderBlock(ext: DiaryExtension | undefined, actions: DiaryCoreActions) {
  const block = ext?.fullWidthBlock;
  if (typeof block !== "function") throw new Error("fullWidthBlock fonksiyon olmalı");
  return renderSlot(block(actions));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession({ site_diary: "full", earned_value: "draft" });
  mockDay(dayView());
  vi.mocked(useEvCodeTree).mockReturnValue(query(codeTree()));
  vi.mocked(useEvSettings).mockReturnValue(query(undefined));
  vi.mocked(useSite).mockReturnValue(query({ id: "s-1", name: "A-Blok", status: "active", project: { id: "p-1", name: "Güneşkent" } }));
  vi.mocked(useEvBudgetRevisions).mockReturnValue(query([{ id: "rev-1", status: "active", number: 1 }]));
  vi.mocked(useEvBudget).mockReturnValue(query(undefined));
  vi.mocked(usePreviousAllocation).mockReturnValue({ refetch: vi.fn() } as never);
  vi.mocked(useSaveDayAllocation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  vi.mocked(useUnlockDay).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
});

describe("karar 3 · caption İ:213 birebir", () => {
  it("alt başlığın TAMAMI adaptörden", () => {
    expect(extension()?.lineColumns?.caption).toBe("İş tipi × bölüm · kazanılmış = bugün miktar × birim oran (Rev 1)");
  });

  it("revizyon no yoksa caption undefined (çekirdek metni kalır)", () => {
    mockDay(dayView({ revision_number: null }));
    expect(extension()?.lineColumns?.caption).toBeUndefined();
  });
});

describe("karar 5 · kilit bandı `topBanner`da tam genişlik (İ:143-149)", () => {
  it("kilitli gün: lock.banner BOŞ, topBanner = bant metni + 'Kilidi aç (yetkili)' (approve)", () => {
    mockSession({ site_diary: "full", earned_value: "approve" });
    mockDay(dayView({ lock: LOCKED }));
    const ext = extension();
    expect(ext?.lock).toEqual({ isLocked: true });
    expect(ext?.lock?.banner).toBeUndefined();
    renderSlot(ext?.topBanner);
    const band = screen.getByRole("status");
    expect(band).toHaveClass("ev-diary-lock");
    expect(band.textContent).toBe("Bu gün 25.09.2026 raporuyla kilitlendi. Bütün alanlar salt okunur.Kilidi aç (yetkili)");
    expect(within(band).getByText("Bu gün 25.09.2026 raporuyla kilitlendi.").tagName).toBe("B");
    expect(band.querySelector("svg")).not.toBeNull();
  });

  it("kilitli gün + formen: kilit bandı gösterilir, formen bandı GÖSTERİLMEZ (showForemanBand kilitte kapalı)", () => {
    mockSession({ site_diary: "full", earned_value: "view" });
    mockDay(dayView({ lock: LOCKED }));
    const { container } = renderSlot(extension()?.topBanner);
    expect(container.textContent).toContain("raporuyla kilitlendi.");
    expect(container.textContent).not.toContain("Formen görünümü.");
    expect(screen.queryByRole("button", { name: "Kilidi aç (yetkili)" })).not.toBeInTheDocument();
  });

  it("kilitsiz mühendis: lock null, topBanner yok", () => {
    const ext = extension();
    expect(ext?.lock).toBeNull();
    expect(ext?.topBanner).toBeUndefined();
  });
});

describe("karar 6 · fullWidthBlock çekirdeğin eylemlerini alır", () => {
  it("kontrol çubuğu ve tablet çubuğundaki 'Gönder' actions.submit'i çağırır", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    renderBlock(extension(), { submit, canSubmit: true, isSaving: false });
    const buttons = screen.getAllByRole("button", { name: "Gönder" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) await user.click(button);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("canSubmit=false → iki 'Gönder' de PASİF, submit çağrılmaz", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    renderBlock(extension(), { submit, canSubmit: false, isSaving: false });
    for (const button of screen.getAllByRole("button", { name: "Gönder" })) {
      expect(button).toBeDisabled();
      await user.click(button);
    }
    expect(submit).not.toHaveBeenCalled();
  });

  it("tablet şeridi şantiye ADINI ve günü basar (İ:529 '24.09 · A-Blok')", () => {
    renderBlock(extension(), { submit: vi.fn(), canSubmit: true, isSaving: false });
    expect(screen.getByText("24.09 · A-Blok")).toBeInTheDocument();
  });
});
