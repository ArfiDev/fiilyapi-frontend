import { describe, expect, it } from "vitest";

import { paginateByGroup } from "./paginate";

const rows = (group: string, n: number) => Array.from({ length: n }, (_, i) => ({ group, i }));
const groupOf = (row: { group: string }) => row.group;

describe("paginateByGroup — sayfaya göre kapasite (TKL-F3.7)", () => {
  it("kapasite fonksiyonu: ilk sayfa küçük, sonrakiler büyük; grup bölünmez", () => {
    const input = [...rows("a", 3), ...rows("b", 3), ...rows("c", 4)];
    const pages = paginateByGroup(input, (pageIndex) => (pageIndex === 0 ? 4 : 8), groupOf);
    expect(pages.map((page) => page.map((g) => g.rows.length))).toEqual([[3], [3, 4]]);
    expect(pages.flat().every((g) => !g.continued)).toBe(true);
  });

  it("ilk sayfaya sığmayan ama sonraki sayfaya sığan grup bölünmez: ilk sayfa boş kalır", () => {
    const pages = paginateByGroup(rows("a", 6), (pageIndex) => (pageIndex === 0 ? 4 : 8), groupOf);
    expect(pages.map((page) => page.map((g) => g.rows.length))).toEqual([[], [6]]);
  });

  it("sayı kapasite eskisi gibi çalışır", () => {
    const pages = paginateByGroup([...rows("a", 3), ...rows("b", 3)], 4, groupOf);
    expect(pages.map((page) => page.map((g) => g.rows.length))).toEqual([[3], [3]]);
  });
});
