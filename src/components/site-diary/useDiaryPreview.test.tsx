import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useSiteDiarySkeleton, type SiteDiarySkeleton } from "@/lib/api/hooks/useSiteDiarySkeleton";
import type { SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";

import {
  diaryCoreLock,
  diaryTreeSource,
  useDiaryPreview,
  useExistingEntryRaceNotice,
  type UseDiaryPreviewInput,
} from "./useDiaryPreview";

// GKS-F1.3 · önizleme hook'u: sorgu ne zaman açık, `matchedId` birleşimi,
// "önizleme güncel mi" ve saf türevler (ağaç kaynağı, kilit).
vi.mock("@/lib/api/hooks/useSiteDiarySkeleton", () => ({ useSiteDiarySkeleton: vi.fn() }));

const refetchSkeleton = vi.fn();

function skeleton(overrides: Partial<SiteDiarySkeleton> = {}): SiteDiarySkeleton {
  return {
    entry_date: "2026-09-24",
    section_id: null,
    section_name: null,
    existing_entry_id: null,
    locked: false,
    lock_report_date: null,
    lines: [],
    lines_total: "12.50",
    ...overrides,
  } satisfies SiteDiarySkeleton;
}

function mockQuery(state: { data?: SiteDiarySkeleton; isFetching?: boolean; isError?: boolean } = {}) {
  vi.mocked(useSiteDiarySkeleton).mockReturnValue({
    data: state.data,
    isFetching: state.isFetching ?? false,
    isError: state.isError ?? false,
    refetch: refetchSkeleton,
  } as never);
}

function input(overrides: Partial<UseDiaryPreviewInput> = {}): UseDiaryPreviewInput {
  return {
    siteId: "s-1",
    activeDate: "2026-09-24",
    sectionId: "",
    listMatchedId: "",
    isListLoading: false,
    refetchEntries: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery({ data: skeleton() });
});

describe("useDiaryPreview · sorgu koşulu", () => {
  it("liste eşleşmesi YOKKEN ve liste yüklendiyse açık", () => {
    renderHook(() => useDiaryPreview(input()));
    expect(vi.mocked(useSiteDiarySkeleton)).toHaveBeenCalledWith("s-1", "2026-09-24", "", { enabled: true });
  });

  it("liste eşleşmesi VARKEN kapalı", () => {
    renderHook(() => useDiaryPreview(input({ listMatchedId: "d-1" })));
    expect(vi.mocked(useSiteDiarySkeleton).mock.calls.at(-1)?.[3]).toEqual({ enabled: false });
  });

  it("liste yüklenirken kapalı", () => {
    renderHook(() => useDiaryPreview(input({ isListLoading: true })));
    expect(vi.mocked(useSiteDiarySkeleton).mock.calls.at(-1)?.[3]).toEqual({ enabled: false });
  });

  it("existing_entry_id gelince sorgu AÇIK kalır (döngü yok: koşul liste eşleşmesine bağlı)", () => {
    mockQuery({ data: skeleton({ existing_entry_id: "d-9" }) });
    const { result } = renderHook(() => useDiaryPreview(input()));
    expect(result.current.matchedId).toBe("d-9");
    expect(vi.mocked(useSiteDiarySkeleton).mock.calls.at(-1)?.[3]).toEqual({ enabled: true });
  });
});

describe("useDiaryPreview · matchedId", () => {
  it("öncelik: liste eşleşmesi > önizleme existing_entry_id", () => {
    mockQuery({ data: skeleton({ existing_entry_id: "d-9" }) });
    const { result } = renderHook(() => useDiaryPreview(input({ listMatchedId: "d-1" })));
    expect(result.current.matchedId).toBe("d-1");
    expect(result.current.existingEntryId).toBe("");
  });

  it("hiçbiri yoksa boş", () => {
    const { result } = renderHook(() => useDiaryPreview(input()));
    expect(result.current.matchedId).toBe("");
  });

  it("existing_entry_id için ay listesi BİR KEZ yenilenir", () => {
    mockQuery({ data: skeleton({ existing_entry_id: "d-9" }) });
    const refetchEntries = vi.fn();
    const { rerender } = renderHook(() => useDiaryPreview(input({ refetchEntries })));
    rerender();
    expect(refetchEntries).toHaveBeenCalledTimes(1);
  });

  it("adoptCreatedEntry liste tazelenene dek yeni kaydı tutar ve önizlemeyi kapatır", () => {
    const { result } = renderHook(() => useDiaryPreview(input()));
    act(() => result.current.adoptCreatedEntry({ id: "d-new", entry_date: "2026-09-24" }));
    expect(result.current.matchedId).toBe("d-new");
    expect(vi.mocked(useSiteDiarySkeleton).mock.calls.at(-1)?.[3]).toEqual({ enabled: false });
  });

  it("başka güne ait adopt edilmiş kayıt bu günü etkilemez", () => {
    const { result } = renderHook(() => useDiaryPreview(input()));
    act(() => result.current.adoptCreatedEntry({ id: "d-new", entry_date: "2026-01-01" }));
    expect(result.current.matchedId).toBe("");
  });
});

describe("useDiaryPreview · güncellik ve durum", () => {
  it("gün + bölüm eşleşir, yenilenmiyor → güncel", () => {
    const { result } = renderHook(() => useDiaryPreview(input()));
    expect(result.current.isCurrent).toBe(true);
    expect(result.current.status).toBe("ready");
  });

  it("yenileniyorsa güncel DEĞİL", () => {
    mockQuery({ data: skeleton(), isFetching: true });
    expect(renderHook(() => useDiaryPreview(input())).result.current.isCurrent).toBe(false);
  });

  it("gün ya da bölüm farklıysa güncel DEĞİL", () => {
    mockQuery({ data: skeleton({ entry_date: "2001-01-01" }) });
    expect(renderHook(() => useDiaryPreview(input())).result.current.isCurrent).toBe(false);
    mockQuery({ data: skeleton({ section_id: "sec-1" }) });
    expect(renderHook(() => useDiaryPreview(input())).result.current.isCurrent).toBe(false);
    expect(renderHook(() => useDiaryPreview(input({ sectionId: "sec-1" }))).result.current.isCurrent).toBe(true);
  });

  it("veri yok → loading; hata → error", () => {
    mockQuery({ data: undefined });
    expect(renderHook(() => useDiaryPreview(input())).result.current.status).toBe("loading");
    mockQuery({ data: undefined, isError: true });
    const { result } = renderHook(() => useDiaryPreview(input()));
    expect(result.current.status).toBe("error");
    result.current.refetch();
    expect(refetchSkeleton).toHaveBeenCalledTimes(1);
  });
});

describe("diaryTreeSource", () => {
  it("kayıtta entry.lines + entry.lines_total, önizleme DEĞİL", () => {
    const entry = { lines: [{ id: "l-1" }], lines_total: "99.00" } as unknown as SiteDiaryEntryDetail;
    expect(diaryTreeSource(entry, skeleton())).toEqual({ lines: entry.lines, linesTotal: "99.00", isPreview: false });
  });

  it("kayıtsızda skeleton.lines + skeleton.lines_total, önizleme", () => {
    const sk = skeleton();
    expect(diaryTreeSource(undefined, sk)).toEqual({ lines: sk.lines, linesTotal: "12.50", isPreview: true });
  });

  it("önizleme de yoksa boş ve '0'", () => {
    expect(diaryTreeSource(undefined, undefined)).toEqual({ lines: [], linesTotal: "0", isPreview: true });
  });
});

describe("diaryCoreLock", () => {
  it("kayıt varsa entry.locked esastır (önizleme kilitli olsa bile)", () => {
    const entry = { locked: false, lock_report_date: null } as unknown as SiteDiaryEntryDetail;
    expect(diaryCoreLock(entry, skeleton({ locked: true })).isLocked).toBe(false);
  });

  it("kayıtsızda skeleton.locked; metin tek kaynaktan", () => {
    expect(diaryCoreLock(undefined, skeleton({ locked: true, lock_report_date: "2026-09-25" }))).toEqual({
      isLocked: true,
      bannerText: "Bu gün 25.09.2026 raporuyla kilitlendi. Bütün alanlar salt okunur.",
    });
    expect(diaryCoreLock(undefined, skeleton({ locked: true })).bannerText).toBe(
      "Bu gün rapor onayıyla kilitlendi. Bütün alanlar salt okunur.",
    );
  });

  it("kilitsiz ya da önizleme yok → kilit yok", () => {
    expect(diaryCoreLock(undefined, skeleton())).toEqual({ isLocked: false, bannerText: null });
    expect(diaryCoreLock(undefined, undefined)).toEqual({ isLocked: false, bannerText: null });
  });
});

describe("useExistingEntryRaceNotice", () => {
  it("kimlik görünmeden ÖNCE form kirliydiyse ve kayıt yüklendiyse bant", () => {
    const { result, rerender } = renderHook((props) => useExistingEntryRaceNotice(props), {
      initialProps: { existingEntryId: "", matchedId: "", isFormDirty: true },
    });
    expect(result.current).toBe(false);
    // Kayıt yüklenince form kayıttan kurulur → kirlilik düşer; bant yine de basılır.
    rerender({ existingEntryId: "d-9", matchedId: "d-9", isFormDirty: false });
    expect(result.current).toBe(true);
  });

  it("form kirli değilse bant YOK", () => {
    const { result, rerender } = renderHook((props) => useExistingEntryRaceNotice(props), {
      initialProps: { existingEntryId: "", matchedId: "", isFormDirty: false },
    });
    rerender({ existingEntryId: "d-9", matchedId: "d-9", isFormDirty: false });
    expect(result.current).toBe(false);
  });

  it("başka güne geçilince (matchedId değişince) bant kalkar", () => {
    const { result, rerender } = renderHook((props) => useExistingEntryRaceNotice(props), {
      initialProps: { existingEntryId: "", matchedId: "", isFormDirty: true },
    });
    rerender({ existingEntryId: "d-9", matchedId: "d-9", isFormDirty: false });
    rerender({ existingEntryId: "", matchedId: "", isFormDirty: false });
    expect(result.current).toBe(false);
  });
});
