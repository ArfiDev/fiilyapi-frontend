import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";

import type { SitePlanWeek } from "@/lib/api/hooks/useSitePlan";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { usePlanDraft } from "./usePlanDraft";

// F-PL T4 · `usePlanDraft`in TEK kuralı burada korunur: sunucu yanıtı taslağı
// yeniden kurar, AMA kullanıcının yazdığının üstüne yazamaz. Bu kural bozulursa
// arka plan tazelemesi (kaydetme sonrası invalidate, hafta gezinmesi) kullanıcı
// girdisini sessizce yutar — geri alınamaz veri kaybı.

const WEEK_START = "2026-08-03";

function planWeek(overrides: Partial<SitePlanWeek> = {}): SitePlanWeek {
  return {
    site_id: "s-1",
    site_name: "A-Blok",
    project_id: "p-1",
    project_name: "Güneşkent Konut",
    week_start: WEEK_START,
    week_end: "2026-08-09",
    days: [
      { plan_date: "2026-08-03", is_weekend: false },
      { plan_date: "2026-08-04", is_weekend: false },
      { plan_date: "2026-08-05", is_weekend: false },
      { plan_date: "2026-08-06", is_weekend: false },
      { plan_date: "2026-08-07", is_weekend: false },
      { plan_date: "2026-08-08", is_weekend: true },
      { plan_date: "2026-08-09", is_weekend: true },
    ],
    groups: [
      {
        kind: "crew",
        section_id: "sec-1",
        section_name: "Kat 6–10 Kaba",
        section_manager_name: "Sercan Öztürk",
        rows: [
          {
            id: "pr-1",
            kind: "crew",
            section_id: "sec-1",
            label: "Kalıpçı",
            planned_worker_count: 14,
            sort_order: 0,
            cells: [{ plan_date: "2026-08-05", text: "Kat 9 Kalıp", tag: "blue" }],
          },
        ],
      },
    ],
    goals: [],
    active_sprint: { id: "ps-1", name: "Kat 8–9 Tamamlama" },
    ...overrides,
  };
}

describe("usePlanDraft", () => {
  it("plan gelmeden BOS taslak kurar (hafta korunur)", () => {
    const { result } = renderHook(() => usePlanDraft(undefined, WEEK_START));
    expect(result.current.draft.weekStart).toBe(WEEK_START);
    expect(result.current.draft.rows).toHaveLength(0);
    expect(result.current.isDirty).toBe(false);
  });

  it("ilk yanit taslagi sunucu gerceginden kurar", () => {
    // ⚠️ Yanıt nesnesi RENDER DIŞINDA kurulur: taslağın "aynı yanıt" koruması
    // KİMLİK karşılaştırmasıdır (React Query önbelleği kararlı referans verir).
    // Her render'da yeni nesne üreten bir çağıran sonsuz reset döngüsüne girer.
    const plan = planWeek();
    const { result } = renderHook(() => usePlanDraft(plan, WEEK_START));
    expect(result.current.draft.rows[0]?.label).toBe("Kalıpçı");
    expect(result.current.draft.sprintName).toBe("Kat 8–9 Tamamlama");
    expect(result.current.isDirty).toBe(false);
  });

  it("KIRLIYKEN ayni haftanin yeni yaniti taslagi EZMEZ", () => {
    const { result, rerender } = renderHook(
      ({ plan }: { plan: SitePlanWeek }) => usePlanDraft(plan, WEEK_START),
      { initialProps: { plan: planWeek() } },
    );

    act(() => result.current.dispatch({ type: "setSprintName", name: "Kullanıcının yazdığı" }));
    expect(result.current.isDirty).toBe(true);

    // Arka plan tazelemesi: YENİ nesne, aynı hafta, farklı sunucu değeri.
    rerender({ plan: planWeek({ active_sprint: { id: "ps-2", name: "Sunucudan gelen" } }) });

    expect(result.current.draft.sprintName).toBe("Kullanıcının yazdığı");
    expect(result.current.isDirty).toBe(true);
  });

  it("kirlilik dustukten sonraki yanit taslagi sunucuyla ESITLER", () => {
    const { result, rerender } = renderHook(
      ({ plan }: { plan: SitePlanWeek }) => usePlanDraft(plan, WEEK_START),
      { initialProps: { plan: planWeek() } },
    );

    act(() => result.current.dispatch({ type: "setSprintName", name: "Yerel" }));
    act(() => result.current.dispatch({ type: "sectionSaved", section: "sprint" }));
    expect(result.current.isDirty).toBe(false);

    rerender({ plan: planWeek({ active_sprint: { id: "ps-2", name: "Sunucudan gelen" } }) });
    expect(result.current.draft.sprintName).toBe("Sunucudan gelen");
  });

  it("HAFTA degisince kirlilik KORUNMAZ — taslak yeni haftadan kurulur", () => {
    const nextWeek = "2026-08-10";
    const { result, rerender } = renderHook(
      ({ plan, week }: { plan: SitePlanWeek; week: string }) => usePlanDraft(plan, week),
      { initialProps: { plan: planWeek(), week: WEEK_START } },
    );

    act(() =>
      result.current.dispatch({
        type: "setCell",
        rowKey: "row-pr-1",
        planDate: "2026-08-04",
        cell: { text: "Bu hafta yazıldı", tag: null },
      }),
    );
    expect(result.current.isDirty).toBe(true);

    // Başka haftanın hücrelerini yeni ızgarada tutmak yanlış veri gösterirdi
    // (ve o gövde 422 alırdı) — bu yüzden hafta değişimi kirliliği ezer.
    rerender({
      plan: planWeek({ week_start: nextWeek, week_end: "2026-08-16", groups: [] }),
      week: nextWeek,
    });

    expect(result.current.draft.weekStart).toBe(nextWeek);
    expect(result.current.draft.rows).toHaveLength(0);
    expect(result.current.isDirty).toBe(false);
  });
});

// SEKME-F1.3-FIX O7 · `usePlanDraft`in `useUnsavedChanges` bağlanması için
// davranış bekçisi — `result.current.isDirty`nin KENDİSİ değil, üst çubuğun
// GERÇEKTEN okuduğu merkezi kayıt (`unsavedRegistry`) doğrulanır. Bağlantı
// sessizce kopsa (satır silinir/yorumlanır) bile hook'un kendi `isDirty`
// alanı doğru kalabilir — kayıt bunu YAKALAMAZ, bu yüzden ayrı bir bekçi şart.
describe("usePlanDraft — unsavedRegistry davranış bekçisi (O7)", () => {
  it("yükle, dokunma → temiz; hücre değiştir → kirli; kaydetme (sectionSaved) → tekrar temiz", () => {
    const { result } = renderHook(
      ({ plan }: { plan: SitePlanWeek }) => usePlanDraft(plan, WEEK_START),
      { initialProps: { plan: planWeek() } },
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    act(() => result.current.dispatch({ type: "setSprintName", name: "Kullanıcının yazdığı" }));
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    act(() => result.current.dispatch({ type: "sectionSaved", section: "sprint" }));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
