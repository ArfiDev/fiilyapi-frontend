import type { SiteDiarySkeleton } from "@/lib/api/hooks/useSiteDiarySkeleton";

/**
 * GKS-F1.3 · ekran testlerinde `useSiteDiarySkeleton`ın ORTAK varsayılanı:
 * istenen gün + bölüm için BOŞ (`lines: []`) ve güncel bir önizleme döner.
 * Önizlemeyi konu almayan testler böylece kayıtsız günde de gerçekçi kalır.
 * Kullanım: `vi.mocked(useSiteDiarySkeleton).mockImplementation(echoSkeletonQuery as never)`.
 */
export function echoSkeletonQuery(_siteId: string, entryDate: string, sectionId: string) {
  const data: SiteDiarySkeleton = {
    entry_date: entryDate,
    section_id: sectionId === "" ? null : sectionId,
    section_name: null,
    existing_entry_id: null,
    locked: false,
    lock_report_date: null,
    lines: [],
    lines_total: "0.00",
  };
  return { data, isFetching: false, isLoading: false, isError: false, error: null, refetch: () => Promise.resolve() };
}
