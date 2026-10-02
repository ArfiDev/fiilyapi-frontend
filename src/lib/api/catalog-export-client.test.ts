import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadCatalogExport } from "./catalog-export-client";
import { errorResponse, stubExportDownload, xlsxResponse } from "./export-test-stub";
import { BackendError } from "./unwrap";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadCatalogExport (TKL-F4.3 · §5 · ÜS-F4-14)", () => {
  it("süzgeçsiz: sorgu dizesi YOK", async () => {
    const stub = stubExportDownload();
    await downloadCatalogExport();
    expect(stub.lastUrl()).toBe("/api/backend/catalog/items/export");
  });

  it("disiplin sekmesi discipline_id olarak gider; arama q ASLA gönderilmez", async () => {
    const stub = stubExportDownload();
    await downloadCatalogExport({ disciplineId: "disc-1" });
    expect(stub.lastQuery()).toEqual({ discipline_id: "disc-1" });
    expect(stub.lastUrl()).not.toContain("q=");
  });

  it("disiplin kimliği sorguda kaçışlanır (& ve boşluk ek parametre açmaz)", async () => {
    const stub = stubExportDownload();
    await downloadCatalogExport({ disciplineId: "a&q=x y" });
    expect(stub.lastQuery()).toEqual({ discipline_id: "a&q=x y" });
  });

  it("dosya adını Content-Disposition'dan alır; yoksa yedek ad", async () => {
    const stub = stubExportDownload(xlsxResponse('attachment; filename="Is-Kalemi-Katalogu.xlsx"'));
    const name = await downloadCatalogExport();
    expect(stub.filename()).toBe("Is-Kalemi-Katalogu.xlsx");
    expect(name).toBe("Is-Kalemi-Katalogu.xlsx");
    const fallback = stubExportDownload();
    await downloadCatalogExport();
    expect(fallback.filename()).toBe("is-kalemi-katalogu.xlsx");
  });

  it("2xx dışı yanıt BackendError fırlatır", async () => {
    stubExportDownload(errorResponse(403, { detail: "Yetkiniz yok" }));
    await expect(downloadCatalogExport()).rejects.toBeInstanceOf(BackendError);
  });
});
