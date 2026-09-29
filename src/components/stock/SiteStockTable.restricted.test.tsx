import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SiteStockTable } from "./SiteStockTable";

// DSC-F1.3 · kısıtlı kullanıcıda boş liste bildirimi; yükleniyor/hata dalları değişmez.
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

const EMPTY_TITLE = "Bu şantiyenin depolarında hareket görmüş malzeme yok.";

describe("SiteStockTable — kısıtlı boş durum (DSC-F1.3)", () => {
  beforeEach(() => {
    scope.value = { isRestricted: false, names: [] };
  });

  it("kısıtlı + boş liste → ortak bildirim, eski başlık yok", () => {
    scope.value = { isRestricted: true, names: ["Mekanik"] };
    render(<SiteStockTable rows={[]} isLoading={false} isError={false} />);
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TITLE)).not.toBeInTheDocument();
  });

  it("kısıtlı iken hata dalı DEĞİŞMEZ", () => {
    scope.value = { isRestricted: true, names: ["Mekanik"] };
    render(<SiteStockTable rows={undefined} isLoading={false} isError />);
    expect(screen.getByText("Şantiye stok listesi yüklenemedi.")).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("atamasız + boş liste → bugünkü metin aynen", () => {
    render(<SiteStockTable rows={[]} isLoading={false} isError={false} />);
    expect(screen.getByText(EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("kısıtlı + bölüm süzgeçli + boş liste → eski metin (süzgeç sızıntısı yok)", () => {
    scope.value = { isRestricted: true, names: ["Mekanik"] };
    render(<SiteStockTable rows={[]} isLoading={false} isError={false} isFiltered />);
    expect(screen.getByText(EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("kısıtlı + yükleniyor → bildirim YOK, yükleniyor metni", () => {
    scope.value = { isRestricted: true, names: ["Mekanik"] };
    render(<SiteStockTable rows={undefined} isLoading isError={false} />);
    expect(screen.getByText("Şantiye stok listesi yükleniyor…")).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });
});
