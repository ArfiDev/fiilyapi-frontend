import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { useTimesheetWeekEditor } from "./useTimesheetWeekEditor";

vi.mock("@/lib/api/hooks/useTimesheetMutations", () => ({
  useSaveTimesheetWeek: () => ({
    mutateAsync: async () => {
      throw new BackendError(409, {
        detail: "kilitli",
        locked_days: ["2026-07-13"],
      });
    },
  }),
}));

// "Önceki Haftayı Kopyala" gerçek backend'e gitmesin — sabit (boş) önceki hafta.
vi.mock("@/lib/api/hooks/useTimesheet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/hooks/useTimesheet")>();
  return {
    ...actual,
    timesheetWeekQuery: (siteId: string, week: { isoYear: number; isoWeek: number }) => ({
      queryKey: ["ts-week-test", siteId, week.isoYear, week.isoWeek] as const,
      queryFn: async () => ({ start_date: "2026-07-06", rows: [] }),
    }),
  };
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe("useTimesheetWeekEditor · saveState kapsamı (draft/conflictLocks ile AYNI kural)", () => {
  it("🔴 kilit hata bandı HAFTA değişince düşer — başka haftanın hatası göstermeye devam etmemeli", async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ week }) => useTimesheetWeekEditor({ siteId: "s-1", week, sectionId: null }),
      { wrapper, initialProps: { week: { isoYear: 2026, isoWeek: 29 } } },
    );

    await act(async () => {
      await result.current.save([]);
    });
    expect(result.current.saveState.kind).toBe("locked");

    // Hafta değişti — bant hâlâ "locked" göstermemeli.
    rerender({ week: { isoYear: 2026, isoWeek: 30 } });
    expect(result.current.saveState.kind).toBe("idle");
  });

  it("kilit hata bandı ŞANTİYE değişince de düşer", async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ siteId }) =>
        useTimesheetWeekEditor({ siteId, week: { isoYear: 2026, isoWeek: 29 }, sectionId: null }),
      { wrapper, initialProps: { siteId: "s-1" } },
    );

    await act(async () => {
      await result.current.save([]);
    });
    expect(result.current.saveState.kind).toBe("locked");

    rerender({ siteId: "s-2" });
    expect(result.current.saveState.kind).toBe("idle");
  });

  it("AYNI hafta+şantiyede kalırken bant kalıcıdır — yalnız kapsam değişimi düşürür", async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ week }) => useTimesheetWeekEditor({ siteId: "s-1", week, sectionId: null }),
      { wrapper, initialProps: { week: { isoYear: 2026, isoWeek: 29 } } },
    );

    await act(async () => {
      await result.current.save([]);
    });
    expect(result.current.saveState.kind).toBe("locked");

    // Aynı kapsamla yeniden render — bant DÜŞMEMELİ.
    rerender({ week: { isoYear: 2026, isoWeek: 29 } });
    expect(result.current.saveState.kind).toBe("locked");
  });
});

describe("useTimesheetWeekEditor · copyState kapsamı", () => {
  it("🔴 kopyalama bandı HAFTA değişince düşer — başka haftanın 'kopyalandı' bildirimi göstermeye devam etmemeli", async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ week }) => useTimesheetWeekEditor({ siteId: "s-1", week, sectionId: null }),
      { wrapper, initialProps: { week: { isoYear: 2026, isoWeek: 29 } } },
    );

    await act(async () => {
      await result.current.copyPreviousWeek([], new Set());
    });
    expect(result.current.copyState.kind).toBe("copied");

    // Hafta değişti — bant hâlâ "copied" göstermemeli.
    rerender({ week: { isoYear: 2026, isoWeek: 30 } });
    expect(result.current.copyState.kind).toBe("idle");
  });

  it("kopyalama bandı ŞANTİYE değişince de düşer", async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ siteId }) =>
        useTimesheetWeekEditor({ siteId, week: { isoYear: 2026, isoWeek: 29 }, sectionId: null }),
      { wrapper, initialProps: { siteId: "s-1" } },
    );

    await act(async () => {
      await result.current.copyPreviousWeek([], new Set());
    });
    expect(result.current.copyState.kind).toBe("copied");

    rerender({ siteId: "s-2" });
    expect(result.current.copyState.kind).toBe("idle");
  });

  it("AYNI hafta+şantiyede kalırken bant kalıcıdır — yalnız kapsam değişimi düşürür", async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ week }) => useTimesheetWeekEditor({ siteId: "s-1", week, sectionId: null }),
      { wrapper, initialProps: { week: { isoYear: 2026, isoWeek: 29 } } },
    );

    await act(async () => {
      await result.current.copyPreviousWeek([], new Set());
    });
    expect(result.current.copyState.kind).toBe("copied");

    rerender({ week: { isoYear: 2026, isoWeek: 29 } });
    expect(result.current.copyState.kind).toBe("copied");
  });
});

// SEKME-F1.3 · üst çubuk sekme onayı bu ekranın kaydedilmemiş verisini
// `unsavedRegistry`den okur — burada hücreye değer yazmanın kaydı GERÇEKTEN
// bildirdiğini, kapsam sıfırlanınca (hafta değişimi ⇒ taslak sıfırlanır)
// kaydın da düştüğünü doğruluyoruz.
describe("useTimesheetWeekEditor · unsavedRegistry bağlantısı", () => {
  it("hücreye saat yazmak kaydı 'kirli' işaretler, hafta değişip taslak sıfırlanınca kayıt düşer", async () => {
    const { wrapper } = setup();
    const { result, rerender, unmount } = renderHook(
      ({ week }) => useTimesheetWeekEditor({ siteId: "s-1", week, sectionId: null }),
      { wrapper, initialProps: { week: { isoYear: 2026, isoWeek: 29 } } },
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    act(() => result.current.commitHours([], "p-1", "2026-07-13", "8"));
    expect(result.current.isDirty).toBe(true);
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    // Hafta değişince taslak KENDİ kuralıyla sıfırlanır (kapsam anahtarı
    // değişir) — kayıt da bunu izler.
    rerender({ week: { isoYear: 2026, isoWeek: 30 } });
    expect(result.current.isDirty).toBe(false);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    unmount();
  });
});
