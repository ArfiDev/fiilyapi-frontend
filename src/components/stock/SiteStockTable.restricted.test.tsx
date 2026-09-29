import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SiteStockTable } from "./SiteStockTable";

// DSC-F1.3 · STOK DİSİPLİNSİZ (kullanıcı kararı): stok, disiplin kuralının
// TAMAMEN dışındadır (backend B4 stok süzmesini de kaldırır). Kısıtlı
// kullanıcının gördüğü boş stok listesinin sebebi disiplin OLAMAZ → ortak
// "Disiplininize ait kayıt yok." bildirimi burada YANILTICI olurdu. Bekçi:
// kısıtlı kullanıcı da bugünkü boş metni görür.
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

const EMPTY_TITLE = "Bu şantiyenin depolarında hareket görmüş malzeme yok.";

describe("SiteStockTable — stok disiplinsiz (DSC-F1.3)", () => {
  beforeEach(() => {
    scope.value = { isRestricted: false, names: [] };
  });

  it("kısıtlı kullanıcı + boş liste → bugünkü metin, disiplin bildirimi YOK", () => {
    scope.value = { isRestricted: true, names: ["Mekanik"] };
    render(<SiteStockTable rows={[]} isLoading={false} isError={false} />);
    expect(screen.getByText(EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("atamasız + boş liste → bugünkü metin aynen", () => {
    render(<SiteStockTable rows={[]} isLoading={false} isError={false} />);
    expect(screen.getByText(EMPTY_TITLE)).toBeInTheDocument();
  });
});
