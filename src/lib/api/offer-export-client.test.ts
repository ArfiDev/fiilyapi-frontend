import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadOfferExport } from "./offer-export-client";
import { errorResponse, stubExportDownload, xlsxResponse } from "./export-test-stub";
import { BackendError } from "./unwrap";

const OFFER_ID = "55555555-5555-5555-5555-555555555555";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadOfferExport (TKL-F4.3 · §5)", () => {
  it("işveren görünümü: revizyon export yoluna view=employer ile GET atar", async () => {
    const stub = stubExportDownload();
    await downloadOfferExport(OFFER_ID, 3, "employer");
    expect(stub.lastUrl().split("?")[0]).toBe(`/api/backend/offers/${OFFER_ID}/revisions/3/export`);
    expect(stub.lastQuery()).toEqual({ view: "employer" });
    expect(stub.fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("iç döküm: view=internal gönderir", async () => {
    const stub = stubExportDownload();
    await downloadOfferExport(OFFER_ID, 1, "internal");
    expect(stub.lastQuery()).toEqual({ view: "internal" });
  });

  it("offerId encodeURIComponent'ten geçer (yol kaçışı)", async () => {
    const stub = stubExportDownload();
    await downloadOfferExport("../../secrets", 2, "employer");
    expect(stub.lastUrl()).toContain("/api/backend/offers/..%2F..%2Fsecrets/revisions/2/export");
  });

  it("dosya adını Content-Disposition'dan alır ve döndürür", async () => {
    const stub = stubExportDownload(xlsxResponse('attachment; filename="TKL-0014-Rev2-isveren.xlsx"'));
    const name = await downloadOfferExport(OFFER_ID, 2, "employer");
    expect(stub.filename()).toBe("TKL-0014-Rev2-isveren.xlsx");
    expect(name).toBe("TKL-0014-Rev2-isveren.xlsx");
  });

  it("başlık yoksa yedek ad: Rev ve görünüm etiketi (isveren / ic)", async () => {
    const stub = stubExportDownload();
    await downloadOfferExport(OFFER_ID, 4, "employer");
    expect(stub.filename()).toBe("teklif-Rev4-isveren.xlsx");
    const stubInternal = stubExportDownload();
    await downloadOfferExport(OFFER_ID, 4, "internal");
    expect(stubInternal.filename()).toBe("teklif-Rev4-ic.xlsx");
  });

  it("2xx dışı yanıt BackendError fırlatır; status ve gövde taşınır, blob üretilmez", async () => {
    const stub = stubExportDownload(errorResponse(403, { detail: "Yetkiniz yok" }));
    const error = await downloadOfferExport(OFFER_ID, 1, "employer").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackendError);
    expect((error as BackendError).status).toBe(403);
    expect((error as BackendError).body).toEqual({ detail: "Yetkiniz yok" });
    expect(stub.createObjectURL).not.toHaveBeenCalled();
  });
});
