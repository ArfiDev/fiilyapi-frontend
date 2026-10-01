import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH, POST, PUT } from "./route";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/constants";

function req(url: string, method: string, cookies: Record<string, string>, body?: unknown): NextRequest {
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const r = new NextRequest("http://localhost:3000" + url, init);
  for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
  return r;
}

function ctx(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) };
}

/**
 * Ham gövdeli istek (multipart) — `req()` gövdeyi JSON'a çevirdiği için
 * belge yükleme akışı onunla temsil EDILEMEZ.
 */
function rawReq(
  url: string,
  method: string,
  contentType: string,
  body: string,
  cookies: Record<string, string>,
): NextRequest {
  const r = new NextRequest("http://localhost:3000" + url, {
    method,
    body,
    headers: { "content-type": contentType },
  });
  for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
  return r;
}

describe("BFF /api/backend/[...path]", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend:8000";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BACKEND_URL;
  });

  it("GET izinli kok — backend body+status gecirir", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }),
    ));
    const res = await GET(req("/api/backend/users?limit=20&offset=0", "GET", { [ACCESS_COOKIE]: "acc", [REFRESH_COOKIE]: "ref" }), ctx(["users"]));
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(0);
  });

  // TKL-F1.2 — Is kalemi katalogu (`/catalog/items`, `/catalog/disciplines`) kendi
  // kokunden gecer. Eksikse YALNIZ CANLIDA 404 (mock-backend BFF'yi atlar).
  it("catalog koku — /catalog/items istegi 404 DEGIL, backend'e proxylenir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(
      req("/api/backend/catalog/items", "GET", { [ACCESS_COOKIE]: "acc", [REFRESH_COOKIE]: "ref" }),
      ctx(["catalog", "items"]),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://backend:8000/catalog/items");
  });

  it("izinsiz kok — 404 doner, backend cagrilmaz", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(req("/api/backend/secrets", "GET", { [ACCESS_COOKIE]: "acc" }), ctx(["secrets"]));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("path-traversal segmenti (..) — 404 doner, backend cagrilmaz", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(
      req("/api/backend/users/../roles", "GET", { [ACCESS_COOKIE]: "acc" }),
      ctx(["users", "..", "roles"]),
    );
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST body iletir ve 409 govdesini gecirir (Turkce hata gorunsun)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "e-posta kullanimda" }), { status: 409 }),
    ));
    const res = await POST(req("/api/backend/users", "POST", { [ACCESS_COOKIE]: "acc", [REFRESH_COOKIE]: "ref" }, { email: "a@b.com" }), ctx(["users"]));
    expect(res.status).toBe(409);
    expect((await res.json()).detail).toBe("e-posta kullanimda");
  });

  it("401 — cookie temizler, generic doner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const res = await GET(req("/api/backend/users", "GET", {}), ctx(["users"]));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthenticated");
    expect(res.cookies.get(ACCESS_COOKIE)?.maxAge).toBe(0);
  });

  it("audit-log izinli kok — filtreler query olarak iletilir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(
      req("/api/backend/audit-log?action=login&limit=50", "GET", { [ACCESS_COOKIE]: "acc" }),
      ctx(["audit-log"]),
    );
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/audit-log?action=login&limit=50");
  });

  it("dashboard izinli kok — ozet ucu backend'e iletilir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ role_name: "Patron" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(
      req("/api/backend/dashboard/summary", "GET", { [ACCESS_COOKIE]: "acc" }),
      ctx(["dashboard", "summary"]),
    );
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/dashboard/summary");
  });

  it(".xlsx — ikili govde ve indirme basliklari aynen gecirilir", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          status: 200,
          headers: {
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition": 'attachment; filename="denetim-gunlugu.xlsx"',
          },
        }),
      ),
    );
    const res = await GET(
      req("/api/backend/audit-log/export.xlsx?action=delete", "GET", { [ACCESS_COOKIE]: "acc" }),
      ctx(["audit-log", "export.xlsx"]),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="denetim-gunlugu.xlsx"');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  // F9 · spec §8.1 (T4): `status >= 400` ARTIK her zaman JSON dalina gider —
  // eski davranis 403/409/422 Turkce govdelerini `{code:"forbidden"}` ile
  // degistirip kaybediyordu. 5xx sizdirmama kurali degismedi (asagida).
  it(".xlsx 403 — Turkce hata govdesi aynen gecer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Bu işlem için yetkiniz yok" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    ));
    const res = await GET(
      req("/api/backend/audit-log/export.xlsx", "GET", { [ACCESS_COOKIE]: "acc" }),
      ctx(["audit-log", "export.xlsx"]),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).detail).toBe("Bu işlem için yetkiniz yok");
  });

  it(".xlsx 500 — ham govde hala sizmaz", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "boom" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    ));
    const res = await GET(
      req("/api/backend/audit-log/export.xlsx", "GET", { [ACCESS_COOKIE]: "acc" }),
      ctx(["audit-log", "export.xlsx"]),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("unavailable");
    expect(JSON.stringify(body)).not.toContain("boom");
  });

  it(".xlsx 401 — cookie temizler", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const res = await GET(
      req("/api/backend/audit-log/export.xlsx", "GET", {}),
      ctx(["audit-log", "export.xlsx"]),
    );
    expect(res.status).toBe(401);
    expect(res.cookies.get(ACCESS_COOKIE)?.maxAge).toBe(0);
  });

  it("500 — generic unavailable, ham govde sizmaz", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "boom" }), { status: 500 }),
    ));
    const res = await GET(req("/api/backend/roles", "GET", { [ACCESS_COOKIE]: "acc" }), ctx(["roles"]));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("unavailable");
    expect(JSON.stringify(body)).not.toContain("boom");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // F9 · spec §8.1 regresyon tablosu (ALTI SATIRIN TAMAMI kabul kriteridir).
  // Ikili/JSON karari `Content-Type`'tan verilir; `.xlsx` uzantisi YEDEK kural
  // olarak kalir; `status >= 400` HER ZAMAN JSON dalina gider.
  // ─────────────────────────────────────────────────────────────────────────
  describe("ikili indirme — Content-Type tabanli karar (spec §8.1)", () => {
    const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);

    function binaryBackendResponse(headers: Record<string, string>): Response {
      return new Response(BYTES, { status: 200, headers });
    }

    // 1) ASIL REGRESYON KAPISI: uzantisiz export ucu (son segment "export").
    it("uzantisiz export ikili gecer: sites/{id}/boq/export bayt bayt ayni doner", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          binaryBackendResponse({
            "content-type": XLSX_TYPE,
            "content-disposition": 'attachment; filename="is-kalemleri-STE-01.xlsx"',
          }),
        ),
      );
      const res = await GET(
        req("/api/backend/sites/s1/boq/export", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["sites", "s1", "boq", "export"]),
      );
      expect(res.status).toBe(200);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
    });

    // 2) Indirme basliklari korunur (aksi halde tarayici dosyayi adlandiramaz).
    it("content-type ve content-disposition basliklari korunur", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          binaryBackendResponse({
            "content-type": XLSX_TYPE,
            "content-disposition": 'attachment; filename="is-kalemleri-STE-01.xlsx"',
          }),
        ),
      );
      const res = await GET(
        req("/api/backend/sites/s1/boq/export", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["sites", "s1", "boq", "export"]),
      );
      expect(res.headers.get("content-type")).toBe(XLSX_TYPE);
      expect(res.headers.get("content-disposition")).toBe(
        'attachment; filename="is-kalemleri-STE-01.xlsx"',
      );
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    // 2b) F-BC CANLI SMOKE BULGUSU: ikili dal basliklari SIFIRDAN kurdugu icin
    // backend'in `X-Content-Type-Options: nosniff`i DUSUYORDU. Belge arsivinde
    // icerik KULLANICIDAN geldigi icin bu, depolanmis-XSS savunmasinin ikinci
    // katmanidir (birincisi: `mime_type` uzantidan turetilir).
    it("ikili indirmede nosniff basligi HER ZAMAN basilir", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          binaryBackendResponse({
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="SMOKE_Belge.pdf"',
          }),
        ),
      );
      const res = await GET(
        req("/api/backend/documents/d1/download", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["documents", "d1", "download"]),
      );
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-disposition")).toBe(
        'attachment; filename="SMOKE_Belge.pdf"',
      );
    });

    // 3) Mevcut davranis korunur — denetim gunlugu indirmesi kirilmaz.
    it("uzantili export hala ikili: audit-log/export.xlsx", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(binaryBackendResponse({ "content-type": XLSX_TYPE })),
      );
      const res = await GET(
        req("/api/backend/audit-log/export.xlsx", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["audit-log", "export.xlsx"]),
      );
      expect(res.status).toBe(200);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
    });

    // 4) `.xlsx` deseni SILINMEZ: Content-Type yoksa yedek kural devreye girer.
    it("Content-Type yokken uzanti yedegi devreye girer", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(BYTES, { status: 200 })));
      const res = await GET(
        req("/api/backend/audit-log/export.xlsx", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["audit-log", "export.xlsx"]),
      );
      expect(res.status).toBe(200);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
    });

    // 5) JSON regresyonu: TUM okuma trafigi bu daldan geciyor.
    it("JSON regresyonu: sites/{id}/boq application/json ile JSON dalina gider", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ groups: [], totals: { grand_total: "0.00" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
      const res = await GET(
        req("/api/backend/sites/s1/boq", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["sites", "s1", "boq"]),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).totals.grand_total).toBe("0.00");
    });

    // 6) Hata govdesi korunur: `status >= 400` ikili SAYILMAZ (T4).
    it("hata govdesi korunur: 403 + application/json Turkce govde aynen gecer", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ detail: "Bu şantiyeye erişim yetkiniz yok." }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
      const res = await GET(
        req("/api/backend/sites/s1/boq/export", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["sites", "s1", "boq", "export"]),
      );
      expect(res.status).toBe(403);
      expect((await res.json()).detail).toBe("Bu şantiyeye erişim yetkiniz yok.");
    });

    // 6b) Ikili Content-Type tasiyan hata yaniti bile JSON dalindan gecer —
    // kural `Content-Type` degil STATUS tabanlidir.
    it("403 ikili content-type ile gelse bile ikili sayilmaz", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ detail: "yasak" }), {
            status: 403,
            headers: { "content-type": XLSX_TYPE },
          }),
        ),
      );
      const res = await GET(
        req("/api/backend/sites/s1/boq/export", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["sites", "s1", "boq", "export"]),
      );
      expect(res.status).toBe(403);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect((await res.json()).detail).toBe("yasak");
    });

    // 7) 401 + refresh davranisi DEGISMEDI.
    it("401 + refresh davranisi degismedi: yeni access ile retry ve cerez tazelenir", async () => {
      const jwt = `h.${Buffer.from(JSON.stringify({ exp: 9999999999 })).toString("base64url")}.s`;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 401 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: jwt, refresh_token: jwt }), { status: 200 }),
        )
        .mockResolvedValueOnce(binaryBackendResponse({ "content-type": XLSX_TYPE }));
      vi.stubGlobal("fetch", fetchMock);
      const res = await GET(
        req("/api/backend/sites/s1/boq/export", "GET", {
          [ACCESS_COOKIE]: "old",
          [REFRESH_COOKIE]: "ref",
        }),
        ctx(["sites", "s1", "boq", "export"]),
      );
      expect(res.status).toBe(200);
      expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe(jwt);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
    });

    it("401 + refresh yoksa cerez temizlenir (mevcut davranis)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
      const res = await GET(
        req("/api/backend/sites/s1/boq/export", "GET", {}),
        ctx(["sites", "s1", "boq", "export"]),
      );
      expect(res.status).toBe(401);
      expect(res.cookies.get(ACCESS_COOKIE)?.maxAge).toBe(0);
    });

    it("204 yaniti bos govdeyle gecer (JSON dali)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
      const res = await GET(
        req("/api/backend/sites/s1/boq", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["sites", "s1", "boq"]),
      );
      expect(res.status).toBe(204);
    });

    it("backend erisilemezse 502 doner", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
      const res = await GET(
        req("/api/backend/sites/s1/boq/export", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["sites", "s1", "boq", "export"]),
      );
      expect(res.status).toBe(502);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // F-BC · T1 — Belge Arşivi: multipart yükleme + ikili indirme.
  // Iki uc de bu depoda ILK KEZ acilir: `POST /documents` GET DISI ilk ham
  // (JSON olmayan) govdedir, `GET /documents/{id}/download` ise uzantisiz VE
  // icerik tipi ONCEDEN BILINMEYEN ilk indirmedir.
  // ─────────────────────────────────────────────────────────────────────────
  describe("belge yükleme/indirme (F-BC spec §3)", () => {
    const BOUNDARY = "----fiilBelgeSinir123";
    const MULTIPART_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;
    const MULTIPART_BODY = [
      `--${BOUNDARY}`,
      'Content-Disposition: form-data; name="project_id"',
      "",
      "p-1",
      `--${BOUNDARY}`,
      'Content-Disposition: form-data; name="file"; filename="sozlesme.pdf"',
      "Content-Type: application/pdf",
      "",
      "%PDF-1.4 sahte icerik",
      `--${BOUNDARY}--`,
      "",
    ].join("\r\n");

    function lastFetchInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit {
      return fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1] as RequestInit;
    }

    /**
     * ASIL KAPI: multipart gövde backend'e OLDUĞU GİBİ gitmeli. Eski yol
     * `request.json()` okuyup gövdeyi `JSON.stringify` ile yeniden kodluyordu;
     * o yolda gövde `undefined`a düşer, boundary kaybolur ve backend her
     * yüklemeye 422 döner. jsdom testleri bunu GÖRMEZ, yalnız canlıda çıkar.
     */
    it("POST /documents — multipart gövde bayt bayt aynen geçer, boundary korunur", async () => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "doc-1", filename: "sozlesme.pdf" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const res = await POST(
        rawReq("/api/backend/documents", "POST", MULTIPART_TYPE, MULTIPART_BODY, {
          [ACCESS_COOKIE]: "acc",
        }),
        ctx(["documents"]),
      );

      // Assert
      expect(res.status).toBe(201);
      expect((await res.json()).id).toBe("doc-1");
      const init = lastFetchInit(fetchMock);
      const headers = init.headers as Record<string, string>;
      expect(headers["content-type"]).toBe(MULTIPART_TYPE);
      expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(MULTIPART_BODY);
    });

    it("POST /documents — 413 Türkçe gövdesi görünür kalır", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Dosya boyutu sınırı aşıldı." }), {
          status: 413,
          headers: { "content-type": "application/json" },
        }),
      ));
      const res = await POST(
        rawReq("/api/backend/documents", "POST", MULTIPART_TYPE, MULTIPART_BODY, {
          [ACCESS_COOKIE]: "acc",
        }),
        ctx(["documents"]),
      );
      expect(res.status).toBe(413);
      expect((await res.json()).detail).toBe("Dosya boyutu sınırı aşıldı.");
    });

    it("POST /projects/{id}/document-folders — JSON gövde yolu bozulmadı", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "df-9", name: "Sözleşmeler" }), { status: 201 }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const res = await POST(
        req("/api/backend/projects/p-1/document-folders", "POST", { [ACCESS_COOKIE]: "acc" }, {
          name: "Sözleşmeler",
        }),
        ctx(["projects", "p-1", "document-folders"]),
      );
      expect(res.status).toBe(201);
      const init = lastFetchInit(fetchMock);
      expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
      expect(init.body).toBe(JSON.stringify({ name: "Sözleşmeler" }));
    });

    it("indirme — PDF baytları ve Content-Disposition aynen geçer", async () => {
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(bytes, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="sozlesme.pdf"',
          },
        }),
      ));
      const res = await GET(
        req("/api/backend/documents/doc-1/download", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["documents", "doc-1", "download"]),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toBe('attachment; filename="sozlesme.pdf"');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    });

    /**
     * TUZAK: indirilen belgenin içerik tipi KULLANICI dosyasından gelir; bir
     * `.txt`/`.csv`/`.json` belgesi `text/*` veya `application/json` taşır.
     * Genel `Content-Type` kuralı bunları METİN sayıp JSON dalına düşürür ve
     * `decodeJson` çözemediği gövde için `null` basar — dosya hiç inmez.
     * İndirme ucunda karar SEGMENTten verilir.
     */
    it.each([
      ["text/plain; charset=utf-8", "ölçüm notları\r\nsatır 2"],
      ["application/json", '{"a": 1}'],
    ])("indirme — metin içerik tipli belge (%s) de ikili dal ile geçer", async (type, content) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(content, {
          status: 200,
          headers: {
            "content-type": type,
            "content-disposition": 'attachment; filename="notlar.txt"',
          },
        }),
      ));
      const res = await GET(
        req("/api/backend/documents/doc-2/download", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["documents", "doc-2", "download"]),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(type);
      expect(res.headers.get("content-disposition")).toBe('attachment; filename="notlar.txt"');
      expect(await res.text()).toBe(content);
    });

    // F-TH tuzağı: `status >= 400` HER ZAMAN JSON dalı — indirme ucu istisna değil.
    it("indirme — 403 Türkçe gövdesi ikili sayılmaz", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Bu belgeye erişim yetkiniz yok." }), {
          status: 403,
          headers: { "content-type": "application/pdf" },
        }),
      ));
      const res = await GET(
        req("/api/backend/documents/doc-3/download", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["documents", "doc-3", "download"]),
      );
      expect(res.status).toBe(403);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect((await res.json()).detail).toBe("Bu belgeye erişim yetkiniz yok.");
    });

    it("indirme — 404 gövdesi JSON dalından geçer", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Belge bulunamadı." }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ));
      const res = await GET(
        req("/api/backend/documents/yok/download", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["documents", "yok", "download"]),
      );
      expect(res.status).toBe(404);
      expect((await res.json()).detail).toBe("Belge bulunamadı.");
    });

    it("GET /documents — kapsam süzgeçleri query olarak iletilir", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ documents: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const res = await GET(
        req("/api/backend/documents?project_id=p-1&site_id=s-1&q=ruhsat", "GET", {
          [ACCESS_COOKIE]: "acc",
        }),
        ctx(["documents"]),
      );
      expect(res.status).toBe(200);
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain("project_id=p-1");
      expect(url).toContain("site_id=s-1");
      expect(url).toContain("q=ruhsat");
    });
  });

  // Regresyon korkulugu: uygulama katmani yeni bir backend koku cagirdiginda
  // (or. Santiye Detay'in "/sites/{site_id}" ucu) BFF allow-list'i guncellenmezse
  // ekran sessizce 404 alir ve yalniz gorsel/e2e testte patlar. Bu test istemci
  // kaynagindan cagrilan tum kokleri cikarip her birinin forward edildigini dogrular.
  describe("allow-list, istemcinin cagirdigi tum kokleri kapsar", () => {
    const productSourceDir = resolve(process.cwd(), "src");
    const routeSourcePath = resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts");

    /** `src/` altindaki TUM urun kaynagi (test dosyalari haric). */
    function collectSourceFiles(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(full);
        if (!/\.(ts|tsx)$/.test(entry.name)) return [];
        if (/\.test\.(ts|tsx)$/.test(entry.name)) return [];
        return [full];
      });
    }

    /**
     * F-TB3 · T3 — kok cikarma desenleri. Envanter GREP'LE cikarildi, tahminle
     * DEGIL; iki cagri bicimi vardir ve ikisi de yakalanmalidir:
     *
     *   1. `backendClient.<METOD>("/<kok>/…")` — openapi tipli istemci
     *      (`baseUrl: "/api/backend"`). Cagri COK SATIRA bolunmus olabilir
     *      (`backendClient.POST(\n  "/subcontractor-contracts/…"`), bu yuzden
     *      parantezden sonra `\s*` (satir sonu dahil) beklenir.
     *   2. Ham `"/api/backend/<kok>/…"` dizeleri — ikili indirme/yukleme
     *      istemcileri (`documents-client`, `boq-client`, `timesheet-client`,
     *      `audit-client`, `purchase-quote-client`) `backendClient`i DEGIL
     *      dogrudan `globalThis.fetch`i kullanir; birinci desen bunlari GORMEZ.
     *
     * `/api/backend/[...path]` gibi rota-dosyasina yapilan yorum atiflari
     * `[a-z0-9-]` sinifina takilmadigi icin dogal olarak elenir.
     */
    const ROOT_PATTERNS = [
      /backendClient\s*\.\s*[A-Z]+\s*\(\s*"\/([a-z0-9-]+)/g,
      /["'`]\/api\/backend\/([a-z0-9-]+)/g,
    ];

    /** Kok → onu cagiran dosyalar (bekci mesajinin eyleme donuk olmasi icin). */
    const callSites = new Map<string, Set<string>>();
    for (const file of collectSourceFiles(productSourceDir)) {
      const source = readFileSync(file, "utf8");
      for (const pattern of ROOT_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          const relative = file.slice(process.cwd().length + 1);
          const sites = callSites.get(match[1]) ?? new Set<string>();
          sites.add(relative);
          callSites.set(match[1], sites);
        }
      }
    }
    const calledRoots = [...callSites.keys()].sort();

    /** `route.ts`teki gercek Set girdileri — yorum metni DEGIL. */
    function readAllowedRoots(): string[] {
      const source = readFileSync(routeSourcePath, "utf8");
      const allowList = source.slice(
        source.indexOf("const ALLOWED_ROOTS"),
        source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
      );
      return [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
    }

    it("istemci kaynagindan en az bir kok cikarilabilir", () => {
      expect(calledRoots.length).toBeGreaterThan(0);
    });

    // 🔴 ASIL BEKCI (F-TB3 · T3): `ALLOWED_ROOTS`a eklenmeyen bir kok YALNIZ
    // CANLIDA 404 verir — dort kapinin hicbiri, jsdom testleri de gormez.
    // Bugune kadar her dilimde ELLE hatirlandi; bu iddia tuzagi YAPISAL kapatir.
    it("cagrilan her kok ALLOWED_ROOTS'ta tanimlidir", () => {
      const allowed = new Set(readAllowedRoots());
      const missing = calledRoots.filter((root) => !allowed.has(root));
      const report = missing
        .map((root) => `  · "${root}" → ${[...(callSites.get(root) ?? [])].sort().join(", ")}`)
        .join("\n");

      expect(
        missing,
        missing.length === 0
          ? ""
          : [
              "BFF allow-list eksik — bu kokler YALNIZ CANLIDA 404 alir:",
              report,
              "Yapilacak: src/app/api/backend/[...path]/route.ts icindeki ALLOWED_ROOTS",
              "kumesine bu kok(ler)i GEREKCE YORUMUYLA ekle (hangi dilim, hangi uclar,",
              "eksikse ne bozulur). Kok gercekten cagrilmiyorsa cagri yerini kaldir.",
            ].join("\n"),
      ).toEqual([]);
    });

    // Santiye formunun (T5–T12) uc bagimliligi: proje bilgi kutusu, gonderim
    // ucu ve kisi seciciler. Dinamik tarama bunlari zaten yakalar; bu ADLI
    // kapi, koklerden biri sessizce dusurulurse gerekcesini de birlikte kirar.
    it.each(["projects", "sites", "users"])(
      "%s koku santiye formu icin allow-list'te tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        expect(allowList).toContain(`"${root}"`);
      },
    );

    // BLF-F1.2 — Bolum formunun tip secicisi (`GET/POST /section-types`) YENI
    // bir kokten gecer: ilk path segmenti "sites" DEGIL "section-types"tir.
    // Eksikse tip listesi YALNIZ CANLIDA 404 alir (jsdom/mock gormez). Dinamik
    // tarama (cagrilan ⊆ izinli, openapi ⊆ izinli, kok forward) zaten yakalar;
    // ADLI kapi kok dusurulurse gerekcesiyle de kirar.
    it("section-types koku allow-list'te GERCEK girdi olarak tanimlidir (yorum metni DEGIL)", () => {
      expect(readAllowedRoots()).toContain("section-types");
    });

    // P7 · T1 — hakediş ekranlari icin yeni eklenen iki kok ADLI olarak da
    // kapiya baglanir: dinamik tarama zaten yakalar, ama bu test kokler
    // sessizce dusurulurse gerekcesini de birlikte kirar.
    it.each(["progress-payments", "contracts"])(
      "%s koku hakediş ekranlari icin allow-list'te tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        expect(allowList).toContain(`"${root}"`);
      },
    );

    // P6 · T1 — Bölüm Detay ekraninin GET/PATCH ucu ("sites" DEGIL, kendi
    // koku "sections" uzerinden gecer) ADLI olarak da kapiya baglanir.
    it.each(["sections"])(
      "%s koku bolum detay ekrani icin allow-list'te tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        expect(allowList).toContain(`"${root}"`);
      },
    );

    // F-TH · T1 — Taşeron Hakedişi ekranlarının üç yeni kökü ADLI olarak da
    // kapiya baglanir: dinamik tarama zaten yakalar, ama bu test kokler
    // sessizce dusurulurse gerekcesini de birlikte kirar.
    it.each(["subcontractor-progress-payments", "subcontractor-contracts", "subcontractors"])(
      "%s koku tasaron hakedisi ekranlari icin allow-list'te tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        expect(allowList).toContain(`"${root}"`);
      },
    );

    // F-SD · T1 — Şantiye Günlüğü kaydinin detay/lines/submit/reopen uclari
    // ("sites" DEGIL, kendi koku "diary" uzerinden gecer) ADLI olarak da
    // kapiya baglanir. Liste/olusturma/ozet ("/sites/{site_id}/diary*") ve
    // gomulu planlama blogu ("/sites/{site_id}/plan/day-summary") "sites"
    // kokunden gectigi icin o da birlikte dogrulanir.
    it.each(["diary", "sites"])(
      "%s koku santiye gunlugu ekrani icin allow-list'te tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        expect(allowList).toContain(`"${root}"`);
      },
    );

    // F-PL · T1 — Planlama ekraninin TUM uclari ("/sites/{id}/plan",
    // ".../plan/rows|cells|goals|sprint") ilk segmenti "sites" oldugu icin
    // MEVCUT kokten gecer; YENI kok gerekmez. Bu test o gerekceyi kapiya
    // baglar: "sites" koku sessizce dusurulurse (ya da plan uclari kendi
    // kokune tasinirsa) planlama ekrani canlida tamamen 404 olur, jsdom
    // testleri bunu GORMEZ.
    it.each([
      "/sites/{site_id}/plan",
      "/sites/{site_id}/plan/rows",
      "/sites/{site_id}/plan/cells",
      "/sites/{site_id}/plan/goals",
      "/sites/{site_id}/plan/sprint",
    ])("%s ucu allow-list'teki 'sites' kokunden gecer", (endpoint) => {
      const root = endpoint.split("/")[1];
      expect(root).toBe("sites");
      const source = readFileSync(
        resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
        "utf8",
      );
      const allowList = source.slice(
        source.indexOf("const ALLOWED_ROOTS"),
        source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
      );
      expect(allowList).toContain(`"${root}"`);
    });

    // F-PT · T1 — Puantaj dilimi TEK yeni kok ekler: `personnel`. Matrisin
    // kendi uclari ("/sites/{id}/timesheet", ".../timesheet/export.xlsx")
    // ilk segmenti "sites" oldugu icin MEVCUT kokten gecer; "timesheet" diye
    // AYRI bir kok EKLENMEZ (yanlis kok eklemek allow-list yuzeyini bosuna
    // genisletir). Eksik `personnel` koku YALNIZ CANLIDA 404 verir — jsdom
    // testleri bunu GORMEZ.
    it.each(["personnel", "sites"])(
      "%s koku puantaj ekranlari icin allow-list'te tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        expect(allowList).toContain(`"${root}"`);
      },
    );

    // PUAN-SAAT: haftalik uc EKLENDI (`.../timesheet/week`). Yeni KOK YOK —
    // ilk segment yine "sites"tir; `timesheet` kokunu eklemek allow-list
    // yuzeyini bosuna genisletirdi.
    it.each([
      "/sites/{site_id}/timesheet",
      "/sites/{site_id}/timesheet/week",
      "/sites/{site_id}/timesheet/export.xlsx",
    ])("%s ucu allow-list'teki 'sites' kokunden gecer", (endpoint) => {
      const root = endpoint.split("/")[1];
      expect(root).toBe("sites");
      const source = readFileSync(
        resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
        "utf8",
      );
      const allowList = source.slice(
        source.indexOf("const ALLOWED_ROOTS"),
        source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
      );
      expect(allowList).toContain(`"${root}"`);
      // "timesheet" AYRI bir kok DEGILDIR — yanlis kok eklemek ihlaldir.
      // Yorum metni degil, GERCEK girdiler okunur (satir basindaki tirnakli ad).
      const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
      expect(entries).toContain(root);
      expect(entries).not.toContain("timesheet");
    });

    it("personnel koku forward edilir; uydurma 'timesheet' koku 404 alir", async () => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const forwarded = await GET(
        req("/api/backend/personnel?limit=200", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["personnel"]),
      );
      const rejected = await GET(
        req("/api/backend/timesheet", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["timesheet"]),
      );

      // Assert
      expect(forwarded.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain("/personnel?limit=200");
      expect(rejected.status).toBe(404);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // PLN-F1.1 — Planlama (EV) sirket uclari YENI kok acar: `earned-value`
    // (`/earned-value/disciplines`, `/earned-value/catalog`). Santiye uclari
    // (`/sites/{id}/earned-value/...`) MEVCUT `sites` kokunden gecer. Kok
    // eklenmezse Katalog/Disiplin ekranlari YALNIZ CANLIDA 404 alir (MU-2/MT-1
    // dersi); cagiran ekran F1.5'te geldigi icin `cagrilan ⊆ izinli` bekcisi
    // bugun onu GORMEZ — ADLI bekci onden yazilir.
    it("earned-value koku (PLN-F1.1) allow-list'te GERCEK girdi olarak tanimlidir", () => {
      const entries = [...readAllowedRoots()];
      expect(entries).toContain("earned-value");
      // "earned_value" (alt cizgili backend modul adi) ya da "planning" diye
      // AYRI bir kok EKLENMEZ: URL'nin ilk segmenti "earned-value"dir.
      expect(entries).not.toContain("earned_value");
      expect(entries).not.toContain("planning");
    });

    // PLN-F1.1 · TERS YON BEKCISI (`sozlesmedeki ⊆ izinli`). Yukaridaki
    // `cagrilan ⊆ izinli` bekcisi cagiran kod YOKSA kor kalir; adli bekciler
    // ise yalniz bir insan hatirladiginda yazilir (MU-2, MT-1, PLN-F1.1 — uc
    // kez). Bu bekci openapi devri aninda YENI her koku zorla goruntuler:
    // ya ALLOWED_ROOTS'a girer ya asagidaki GEREKCELI dislama listesine.
    it("openapi sozlesmesindeki her kok ya izinlidir ya gerekceli olarak dislanmistir", () => {
      const EXCLUDED_ROOTS: Record<string, string> = {
        auth: "BFF'nin kendi /api/auth/* rotalari (cerez yonetimi) — proxy'den GECMEZ",
        health: "altyapi saglik ucu — urun ekrani cagirmaz",
        blocks: "/blocks/{id} — bugun cagiran ekran yok; cagrilirsa `cagrilan ⊆ izinli` bekcisi yakalar",
        units: "/units/* — bugun cagiran ekran yok; cagrilirsa `cagrilan ⊆ izinli` bekcisi yakalar",
      };
      const contract = JSON.parse(
        readFileSync(resolve(process.cwd(), "openapi/openapi.json"), "utf8"),
      ) as { paths: Record<string, unknown> };
      const contractRoots = [...new Set(Object.keys(contract.paths).map((p) => p.split("/")[1]))];
      const allowed = new Set(readAllowedRoots());
      const unaccounted = contractRoots
        .filter((root) => !allowed.has(root) && !(root in EXCLUDED_ROOTS))
        .sort();

      expect(
        unaccounted,
        `openapi'de yeni kok: ${unaccounted.join(", ")} — ALLOWED_ROOTS'a ekle ya da gerekceyle disla`,
      ).toEqual([]);
      // Dislama listesi bayatlamaz: izinli olan ya da sozlesmeden kalkan bir
      // kok burada kalamaz.
      for (const root of Object.keys(EXCLUDED_ROOTS)) {
        expect(allowed.has(root), `${root} hem izinli hem dislanmis`).toBe(false);
        expect(contractRoots, `${root} sozlesmede yok — dislamadan sil`).toContain(root);
      }
    });

    // F-MU1 ek gorev — MU-2 (donem kapanisi + mizan + KDV) UC kokU.
    // 🔴 BU BEKCININ VARLIK SEBEBI: yukaridaki "cagrilan her kok
    // ALLOWED_ROOTS'ta tanimlidir" bekcisi `cagrilan ⊆ izinli` yonunu
    // olcer. Bu uc kokU CAGIRAN KOD HENUZ YOK (Mizan/KDV/Donem ekranlari
    // sonraki dilimin isi), dolayisiyla o bekci onlari HIC GORMEZ — biri
    // silse tek bir test bile kirmiziya donmezdi. Yonetim canlida OLCTU:
    // uc kok de BFF uzerinden 404 doneriyordu ve govde
    // `{"ok":false,"code":"not_found"}` idi (backend'in 404'u DEGIL, bu
    // listenin kendi reddi). Kok duserse o ekranlar YALNIZ CANLIDA 404
    // alir; jsdom testleri bunu GORMEZ.
    it.each(["accounting-periods", "trial-balance", "vat-return"])(
      "%s koku (MU-2) allow-list'te GERCEK girdi olarak tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        // 🔴 Yorum metni DEGIL, tirnakli GERCEK girdiler okunur — aksi halde
        // koku yalnizca aciklama satirinda gecen bir liste testi GECIRIRDI
        // (sahte bekci). Ayrica "accounting" diye AYRI bir kok EKLENMEZ:
        // donem uclarinin ilk segmenti "accounting-periods"tir.
        const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
        expect(entries).toContain(root);
        expect(entries).not.toContain("accounting");
      },
    );

    // MT-1 (mali tablolar) IKI kokU — ayni ADLI kapi, ayni gerekce.
    // 🔴 Bu kokleri CAGIRAN KOD YOK (mali tablo ekranlari F-MT diliminin isi),
    // dolayisiyla `cagrilan ⊆ izinli` bekcisi onlari HIC GORMEZ. MU-2'nin uc
    // kokUnde ayni bosluk YASANDI: kokler eklenmedigi icin uclar canlida
    // `{"ok":false,"code":"not_found"}` donuyordu ve dort kapinin dordU de
    // yesildi. Ayni hataya ucuncu kez dusmemek icin ADLI bekci ONDEN yazilir.
    it.each(["balance-sheet", "cash-flow-statement"])(
      "%s koku (MT-1) allow-list'te GERCEK girdi olarak tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        // Yorum metni DEGIL, tirnakli GERCEK girdiler okunur (sahte bekci onlemi).
        const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
        expect(entries).toContain(root);
        // 🔴 `cash-flow-statement` MT-1'in yevmiye tablosudur; `treasury` ise
        // HZ-1'in gunluk serisinin kokUdUr. IKISI DE AYRI AYRI durur — biri
        // otekinin yerine gecmez, birlestirilmez.
        expect(entries).toContain("treasury");
      },
    );

    // F-MUF · T-son — Muhasebe formlarinin IKI kokU ADLI kapiya baglanir.
    // 🔴 DURUSTLUK NOTU — bu bekcinin gerekcesi MU-2/MT-1'inkiyle AYNI DEGIL:
    // o kokleri cagiran kod HENUZ YOKTU ve `cagrilan ⊆ izinli` bekcisi onlari
    // HIC GORMUYORDU. Bunlarin ise cagiran kodu VAR (`useChartOfAccounts` ·
    // `useJournalEntries` ve mutasyon kancalari), yani dinamik bekci su an
    // ikisini de goruyor. Adli kapi buraya yine de yazilir cunku dinamik
    // bekcinin kapsami CAGIRAN KODUN VARLIGINA baglidir: muhasebe ekranlari
    // ileride yeniden duzenlenir ya da bir kanca gecici olarak devre disi
    // birakilirsa kok sessizce bekcisiz kalir ve YALNIZ CANLIDA 404 doner
    // (jsdom bunu GORMEZ). *Arac varligi koruma degildir; koruma, yuzeyin
    // araca KAYDEDILMESIDIR* (F-PRJTAB dersi).
    //   · `chart-of-accounts` → GET/POST /chart-of-accounts,
    //                           GET/PATCH/DELETE /chart-of-accounts/{id}
    //   · `journal-entries`   → GET/POST /journal-entries, .../{id}/lines,
    //                           .../{id}/post, .../{id}/reverse
    it.each(["chart-of-accounts", "journal-entries"])(
      "%s koku (F-MUF muhasebe formlari) allow-list'te GERCEK girdi olarak tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        // 🔴 Yorum metni DEGIL, tirnakli GERCEK girdiler okunur — iki kok de
        // `route.ts`in ACIKLAMA blogunda ADIYLA geciyor, dolayisiyla ham metin
        // taramasi yapan bir test allow-list'ten silinseler bile GECERDI
        // (sahte bekci). Bu ayrim burada teorik degil: olculdu.
        const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
        expect(entries).toContain(root);
      },
    );

    // AI-0b · T6 — FİİL AI'in akis-DISI iki ucu (`GET /ai/tools`,
    // `GET /ai/context`). 🔴 Bu kokU CAGIRAN KOD HENUZ YOK (panel AI-1'in
    // isi), dolayisiyla `cagrilan ⊆ izinli` bekcisi onu HIC GORMEZ — MU-2 ve
    // MT-1'de ayni bosluk yasandi ve kokler eklenmedigi icin uclar canlida
    // `{"ok":false,"code":"not_found"}` donuyordu, dort kapi da yesildi.
    // Ayni hataya DORDUNCU kez dusmemek icin ADLI bekci ONDEN yazilir.
    it("ai koku (AI-0b) allow-list'te GERCEK girdi olarak tanimlidir", () => {
      const source = readFileSync(
        resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
        "utf8",
      );
      const allowList = source.slice(
        source.indexOf("const ALLOWED_ROOTS"),
        source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
      );
      // 🔴 Yorum metni DEGIL, tirnakli GERCEK girdiler okunur: "ai" dizesi
      // `route.ts`in aciklama bloklarinda defalarca geciyor, dolayisiyla ham
      // metin taramasi yapan bir test allow-list'ten silinse bile GECERDI.
      const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
      expect(entries).toContain("ai");
    });

    it.each(["ai/tools", "ai/context"])("%s forward edilir (AI-0b)", async (yol) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const segmentler = yol.split("/");
      const res = await GET(
        req(`/api/backend/${yol}`, "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(segmentler),
      );
      expect(res.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`/${yol}`);
    });

    // 🔴 `POST /ai/chat` (SSE) BU KOKTEN GECMEYECEK — catch-all govdeyi
    // tamponlar ve akis olur. AI-1 onu AYRI bir rota olarak yazacak. Bugun
    // olculen olgu: bu kok GET disi metodu `proxyAuthenticated` yoluna sokar,
    // yani akis burada YASAMAZ. Bu test o karari KAYDA GECIRIR.
    it("ai koku SSE icin KULLANILMAZ — POST govdeyi tamponlar", () => {
      const source = readFileSync(
        resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
        "utf8",
      );
      expect(source).toContain("proxyAuthenticated");
      expect(source).not.toContain("text/event-stream");
    });

    it.each(["chart-of-accounts", "journal-entries"])(
      "%s koku forward edilir (F-MUF)",
      async (root) => {
        const fetchMock = vi.fn().mockResolvedValue(
          new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const res = await GET(
          req(`/api/backend/${root}/x`, "GET", { [ACCESS_COOKIE]: "acc" }),
          ctx([root, "x"]),
        );
        expect(res.status).toBe(200);
        expect(String(fetchMock.mock.calls[0][0])).toContain(`/${root}/x`);
      },
    );

    // F-BC · T1 — Belge Arşivi IKI yeni kok ekler ve ikisi de ADLI kapiya
    // baglanir:
    //   · `documents`        → POST/GET /documents, /documents/{id}[/download]
    //   · `document-folders` → PATCH/DELETE /document-folders/{id}
    // Klasor LISTELEME/OLUSTURMA (`/projects/{id}/document-folders`) MEVCUT
    // "projects" kokunden gecer. `document-folders` koku bu dilimde UI'dan
    // cagrilmadigi icin (rename/sil BASILMAZ, spec §4) dinamik tarama onu
    // GORMEZ — kok yalnizca bu adli test sayesinde kapiya bagli kalir.
    it.each(["documents", "document-folders", "projects"])(
      "%s koku belge arsivi ekranlari icin allow-list'te tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
        expect(entries).toContain(root);
      },
    );

    it.each(["documents", "document-folders"])("%s koku forward edilir", async (root) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const res = await GET(
        req(`/api/backend/${root}/x`, "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx([root, "x"]),
      );
      expect(res.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`/${root}/x`);
    });

    // F-ST · T1 — Stok & Depo dilimi IKI yeni kok ekler ve ikisi de AYRI ADLI
    // kapiya baglanir (dilimin en buyuk tuzagi — grep'siz "zaten var" varsayimi
    // canlida 404 uretir):
    //   · `stock`      → GET/POST /stock/items, PATCH /stock/items/{id},
    //                    POST/GET /stock/entries, GET /stock/summary
    //   · `warehouses` → GET/POST /warehouses, PATCH/DELETE /warehouses/{id}
    // SANTIYE stok ucu (`/sites/{site_id}/stock`) ilk segmenti "sites" oldugu
    // icin MEVCUT kokten gecer; ayri bir kok EKLENMEZ (asagidaki test).
    it("stock koku stok ekranlari icin allow-list'te tanimlidir", () => {
      const source = readFileSync(
        resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
        "utf8",
      );
      const allowList = source.slice(
        source.indexOf("const ALLOWED_ROOTS"),
        source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
      );
      // Yorum metni DEGIL, gercek girdiler okunur (satir basindaki tirnakli ad).
      const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
      expect(entries).toContain("stock");
    });

    it("warehouses koku depo uclari icin allow-list'te tanimlidir", () => {
      const source = readFileSync(
        resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
        "utf8",
      );
      const allowList = source.slice(
        source.indexOf("const ALLOWED_ROOTS"),
        source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
      );
      const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
      expect(entries).toContain("warehouses");
    });

    it("/sites/{site_id}/stock ucu allow-list'teki 'sites' kokunden gecer", () => {
      const root = "/sites/{site_id}/stock".split("/")[1];
      expect(root).toBe("sites");
      const source = readFileSync(
        resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
        "utf8",
      );
      const allowList = source.slice(
        source.indexOf("const ALLOWED_ROOTS"),
        source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
      );
      const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
      expect(entries).toContain(root);
    });

    it.each(["stock/items", "stock/summary", "stock/entries", "warehouses"])(
      "%s ucu forward edilir",
      async (endpoint) => {
        const fetchMock = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const res = await GET(
          req(`/api/backend/${endpoint}`, "GET", { [ACCESS_COOKIE]: "acc" }),
          ctx(endpoint.split("/")),
        );
        expect(res.status).toBe(200);
        expect(String(fetchMock.mock.calls[0][0])).toContain(`/${endpoint}`);
      },
    );

    // F-P8 · T1 — Satis ekranlari IKI yeni kok ekler ve ikisi de AYRI ADLI
    // kapiya baglanir (P8 backend kaydindan beri bilinen sart):
    //   · `sales`     → /sales/{id}[/installments|/generate-plan|/activate|
    //                   /transfer-deed|/cancel] + /sales/installments/{id}/pay
    //   · `customers` → GET/POST /customers, GET/PATCH /customers/{id}
    // Satis LISTESI/OLUSTURMA/OZET (`/projects/{id}/sales[/summary]`) ilk
    // segmenti "projects" oldugu icin MEVCUT kokten gecer.
    // `activate`/`transfer-deed`/`cancel` bu dilimde UI'dan CAGRILMAZ (spec
    // §2/K3: satis detay ekrani yok) — dinamik `calledRoots` taramasi bu
    // kokleri GORMEZ, yalniz bu ADLI testler kapiya bagli tutar.
    it.each(["sales", "customers", "projects"])(
      "%s koku satis ekranlari icin allow-list'te tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        // Yorum metni DEGIL, gercek girdiler okunur (satir basindaki tirnakli ad).
        const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
        expect(entries).toContain(root);
      },
    );

    it.each([
      "customers",
      "customers/c-1",
      "projects/p-1/sales",
      "projects/p-1/sales/summary",
      "sales/sale-1",
      "sales/sale-1/generate-plan",
      "sales/sale-1/installments",
      "sales/installments/inst-1/pay",
    ])("%s ucu forward edilir", async (endpoint) => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const res = await GET(
        req(`/api/backend/${endpoint}`, "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(endpoint.split("/")),
      );

      // Assert
      expect(res.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`/${endpoint}`);
    });

    it("uydurma 'installments' koku 404 alir — tahsilat ucunun ilk segmenti 'sales'tir", async () => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const rejected = await GET(
        req("/api/backend/installments/inst-1/pay", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["installments", "inst-1", "pay"]),
      );

      // Assert
      expect(rejected.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
      const source = readFileSync(
        resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
        "utf8",
      );
      const allowList = source.slice(
        source.indexOf("const ALLOWED_ROOTS"),
        source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
      );
      const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
      expect(entries).not.toContain("installments");
    });

    // F-SA · T1 — Satinalma ekranlari DORT yeni kok ekler. Spec K2 "HEPSI ADLI
    // kapi testiyle acilir" der: asagida her kok icin AYRI adli test vardir
    // (it.each ile tek testte toplanmaz — bir kok dusurulurse hangisi oldugu
    // test ADINDAN okunsun).
    function allowListEntries(): string[] {
      const source = readFileSync(
        resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
        "utf8",
      );
      const allowList = source.slice(
        source.indexOf("const ALLOWED_ROOTS"),
        source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
      );
      // Yorum metni DEGIL, gercek girdiler okunur (satir basindaki tirnakli ad).
      return [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
    }

    it("suppliers koku tedarikci ekrani icin allow-list'te tanimlidir", () => {
      expect(allowListEntries()).toContain("suppliers");
    });

    it("purchase-requests koku talep + teklif uclari icin allow-list'te tanimlidir", () => {
      expect(allowListEntries()).toContain("purchase-requests");
    });

    it("purchase-orders koku siparis ekrani icin allow-list'te tanimlidir", () => {
      expect(allowListEntries()).toContain("purchase-orders");
    });

    /**
     * `purchasing` KPI seridinin TEK ucudur (`GET /purchasing/summary`) ve
     * ilk segmenti "purchase-requests" DEGILDIR. Bu kok tek basina duserse
     * ekranlar acilir ama dort kart sonsuza dek bos kalir — en sinsi dusus.
     */
    it("purchasing koku KPI seridi icin allow-list'te tanimlidir", () => {
      expect(allowListEntries()).toContain("purchasing");
    });

    it.each([
      "suppliers",
      "suppliers/sup-1",
      "purchase-requests",
      "purchase-requests/pr-1",
      "purchase-requests/pr-1/quotes",
      "purchase-requests/pr-1/quotes/export.xlsx",
      "purchase-orders",
      "purchase-orders/po-1",
      "purchasing/summary",
    ])("%s ucu forward edilir", async (endpoint) => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const res = await GET(
        req(`/api/backend/${endpoint}`, "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(endpoint.split("/")),
      );

      // Assert
      expect(res.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`/${endpoint}`);
    });

    /**
     * Teklif uclarinin ilk segmenti TALEBIN kokudur; "quotes" AYRI bir kok
     * DEGILDIR. Yanlis kok eklemek allow-list yuzeyini bosuna genisletir.
     */
    it("uydurma 'quotes' koku 404 alir — teklif ucunun ilk segmenti 'purchase-requests'tir", async () => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const rejected = await GET(
        req("/api/backend/quotes/q-1", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["quotes", "q-1"]),
      );

      // Assert
      expect(rejected.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(allowListEntries()).not.toContain("quotes");
    });

    // F-IK · T1 — IK Belge & Sertifika sekmesi TEK yeni kok ekler: `hr`.
    // ADLI kapi testi (F-SA emsali): kok dusurulurse hangisi oldugu test
    // ADINDAN okunsun.
    it("hr koku IK belge/izin ozet uclari icin allow-list'te tanimlidir", () => {
      expect(allowListEntries()).toContain("hr");
    });

    /**
     * Personelin KENDI belge alt-kaynaginin ilk segmenti "personnel"dir;
     * "hr" DEGILDIR. Iki uc ayri koklerden gecer — birini otekinin altinda
     * sanmak sessiz 404 uretir.
     */
    it("personel belge alt-kaynagi MEVCUT 'personnel' kokunden gecer", () => {
      expect("/personnel/{personnel_id}/documents".split("/")[1]).toBe("personnel");
      expect("/personnel/documents/{document_id}".split("/")[1]).toBe("personnel");
      expect(allowListEntries()).toContain("personnel");
    });

    it.each([
      "hr/documents/summary",
      "personnel/p-1/documents",
      "personnel/documents/d-1",
    ])("%s ucu forward edilir", async (endpoint) => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ total_documents: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const res = await GET(
        req(`/api/backend/${endpoint}`, "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(endpoint.split("/")),
      );

      // Assert
      expect(res.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`/${endpoint}`);
    });

    // F-TB1 · T1 — IK-3 bordro cekirdeginin TEK yeni koku: `payroll`. ADLI
    // kapi testi (F-IK/F-SA emsali): kok dusurulurse hangisi oldugu test
    // ADINDAN okunsun. Bu dilimde EKRANA BAGLANMAZ (bordro ekrani mockup'i
    // yok) — dinamik `calledRoots` taramasi bu yuzden yakalamaz.
    it("payroll koku bordro cekirdegi uclari icin allow-list'te tanimlidir", () => {
      expect(allowListEntries()).toContain("payroll");
    });

    it.each([
      "payroll/periods",
      "payroll/periods/per-1",
      "payroll/lines/line-1",
      "payroll/rates",
    ])("%s ucu forward edilir", async (endpoint) => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const res = await GET(
        req(`/api/backend/${endpoint}`, "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(endpoint.split("/")),
      );

      // Assert
      expect(res.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`/${endpoint}`);
    });

    it.each(calledRoots)("%s koku forward edilir", async (root) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const res = await GET(
        req(`/api/backend/${root}`, "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx([root]),
      );
      expect(res.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`/${root}`);
    });

    // F-MK · T1 — Makine Ekipman ekranlarinin TEK yeni koku: `equipment`. ADLI
    // kapi testi (F-IK/F-SA/F-TB1 emsali): kok dusurulurse hangisi oldugu test
    // ADINDAN okunsun.
    it("equipment koku makine ekipman uclari icin allow-list'te tanimlidir", () => {
      expect(allowListEntries()).toContain("equipment");
    });

    it.each([
      "equipment",
      "equipment/eq-1",
      "equipment/summary",
      "equipment/work-logs",
      "equipment/work-logs/log-1",
      "equipment/work-summary",
      "equipment/fuel-logs",
      "equipment/fuel-logs/log-1",
      "equipment/fuel-summary",
    ])("%s ucu forward edilir", async (endpoint) => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const res = await GET(
        req(`/api/backend/${endpoint}`, "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(endpoint.split("/")),
      );

      // Assert
      expect(res.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`/${endpoint}`);
    });

    // F-FAT · T2 — Fatura Çekirdeği + Hazine Çekirdeği ekranlarının DÖRT yeni
    // kökü. ADLI kapı testi (F-İK/F-SA/F-TB1/F-MK emsali): bu dilimde çağıran
    // kod YOK, yani "cagrilan her kok ALLOWED_ROOTS'ta tanimlidir" bekçisi bu
    // dördü için HİÇBİR ŞEY iddia etmez — bekçinin yeşil olması burada kanıt
    // DEĞİLDİR. Kök düşürülürse hangisi olduğu test ADINDAN okunsun.
    it.each(["invoices", "bank-accounts", "payments", "treasury"])(
      "%s koku fatura/hazine uclari icin allow-list'te tanimlidir",
      (root) => {
        expect(allowListEntries()).toContain(root);
      },
    );

    it.each([
      "invoices",
      "invoices/summary",
      "invoices/inv-1",
      "invoices/inv-1/approve",
      "invoices/inv-1/dispute",
      "invoices/inv-1/lines",
      "invoices/inv-1/mark-collected",
      "invoices/inv-1/payments",
      "invoices/inv-1/send",
      "bank-accounts",
      "bank-accounts/acc-1",
      "payments/pay-1",
      "treasury/cash-flow",
      "treasury/upcoming-payments",
    ])("%s ucu forward edilir", async (endpoint) => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const res = await GET(
        req(`/api/backend/${endpoint}`, "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(endpoint.split("/")),
      );

      // Assert
      expect(res.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`/${endpoint}`);
    });

    it("uydurma kok (invoicing) — 404 doner, backend cagrilmaz", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const res = await GET(
        req("/api/backend/invoicing", "GET", { [ACCESS_COOKIE]: "acc" }),
        ctx(["invoicing"]),
      );
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // F-IZN (izin yonetimi) UC kokU — ayni ADLI kapi, ayni gerekce (MU-2/MT-1
    // emsali). Yonetim OLCTU: ucu de su an ALLOWED_ROOTS'ta YOK (grep 0/0/0).
    // 🔴 Bu kokleri CAGIRAN KOD henuz bu adli bekciyle ES ZAMANLI yazilmadan
    // ONCE yoktu, dolayisiyla "cagrilan her kok ALLOWED_ROOTS'ta tanimlidir"
    // bekcisi onlari HIC GORMEZ — biri duserse tek bir dinamik test bile
    // kirmiziya donmez. Kok duserse ilgili izin uclari YALNIZ CANLIDA 404
    // alir; jsdom testleri bunu GORMEZ. Kokler:
    //   · `leave-types`    → GET /leave-types
    //   · `leave-requests` → GET,POST /leave-requests,
    //                        GET,PATCH,DELETE /leave-requests/{id},
    //                        POST .../{id}/approve|reject
    //   · `leave-balances` → GET,PUT /leave-balances/{personnel_id}/{year}
    // (`GET /hr/leaves/summary` mevcut "hr" kokunden gecer — ayri kok gerekmez.)
    it.each(["leave-requests", "leave-types", "leave-balances"])(
      "%s koku (F-IZN) allow-list'te GERCEK girdi olarak tanimlidir",
      (root) => {
        const source = readFileSync(
          resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
          "utf8",
        );
        const allowList = source.slice(
          source.indexOf("const ALLOWED_ROOTS"),
          source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
        );
        // Yorum metni DEGIL, tirnakli GERCEK girdiler okunur (sahte bekci onlemi).
        const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
        expect(entries).toContain(root);
      },
    );

    // F-FIN (Cek & Senet, E10) TEK kokU — ayni ADLI kapi, ayni gerekce.
    // Dinamik bekci bu koku ZATEN gorur (cagiran kod bu dilimde geldi:
    // `src/lib/api/hooks/useFinancialInstruments.ts`), ama adli kapi ikinci
    // katmandir: ileride cagiran kod tasinsa/yeniden yazilsa bile kokun
    // gerekcesi burada KAYITLI kalir. Kok duserse E10 ekrani YALNIZ CANLIDA
    // 404 alir; jsdom testleri bunu GORMEZ.
    //   · GET,POST /financial-instruments
    //   · GET /financial-instruments/summary
    //   · GET,PATCH,DELETE /financial-instruments/{id}
    //   · POST /financial-instruments/{id}/status
    // 🔴 "treasury" koku bunu KAPSAMAZ: FIN-1 uclari birinci seviyededir,
    // `/treasury/...` altinda DEGILDIR.
    it("financial-instruments koku (F-FIN) allow-list'te GERCEK girdi olarak tanimlidir", () => {
      const source = readFileSync(
        resolve(process.cwd(), "src/app/api/backend/[...path]/route.ts"),
        "utf8",
      );
      const allowList = source.slice(
        source.indexOf("const ALLOWED_ROOTS"),
        source.indexOf("]);", source.indexOf("const ALLOWED_ROOTS")),
      );
      // Yorum metni DEGIL, tirnakli GERCEK girdiler okunur (sahte bekci onlemi).
      const entries = [...allowList.matchAll(/^\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
      expect(entries).toContain("financial-instruments");
    });
  });
});

/**
 * 🔴 ÇAPRAZ KAYNAK (CSRF) KAPISI — catch-all proxy'nin durum-değiştiren dalı.
 *
 * ÖLÇÜLMÜŞ İSTİSMAR: Railway'e bedava statik sayfa koyan saldırgan
 * (`evil-production.up.railway.app`) oturumu açık bir kullanıcıya link yollar;
 * sayfa `/api/backend/progress-payments/<id>/approve` adresine otomatik
 * `<form method="POST">` gönderir. `up.railway.app` genel son-ek listesinde
 * (PSL) DEĞİLDİR — iki dağıtımın kayıtlanabilir alanı da `railway.app`, yani
 * istek SAME-SITE'tır ve `sameSite: "lax"` çerezi ALIKOYMAZ. Form POST basit
 * istektir (preflight yok), proxy Bearer'ı kendisi ekler → hakediş ONAYLANIR,
 * denetim günlüğüne kurbanın adı yazılır.
 *
 * Kapının şekli: tarayıcı GET/HEAD DIŞINDAKİ her istekte `Origin` gönderir
 * (Fetch spec; referrer-policy yüzünden `null` olabilir ama YOK olamaz).
 * Bu yüzden kapı "Origin VARSA host ile eşleşmek ZORUNDA" biçimindedir:
 * tarayıcı kaynaklı her çapraz yazma reddedilir, Origin göndermeyen
 * tarayıcı-dışı meşru çağıranlar (Playwright `page.request`, curl smoke)
 * etkilenmez — onlar CSRF taşıyıcısı DEĞİLDİR (çerezleri yoktur).
 * GET muaftır: yanıt çapraz kaynaktan OKUNAMAZ (CORS başlığı yok) ve
 * same-origin GET'te bazı tarayıcılar `Origin` göndermez.
 */
describe("BFF catch-all — capraz kaynak (CSRF) kapisi", () => {
  const AUTHED = { [ACCESS_COOKIE]: "acc", [REFRESH_COOKIE]: "ref" };

  function originReq(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: unknown,
  ): NextRequest {
    const h: Record<string, string> = { host: "localhost:3000", ...headers };
    const init: { method: string; headers: Record<string, string>; body?: string } = {
      method,
      headers: h,
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      h["content-type"] = "application/json";
    }
    const r = new NextRequest("http://localhost:3000" + url, init);
    for (const [k, v] of Object.entries(AUTHED)) r.cookies.set(k, v);
    return r;
  }

  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend:8000";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BACKEND_URL;
  });

  it("yabanci Origin'li govdesiz POST (hakedis onayi) 403 alir ve backend'e HIC istek gitmez", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      originReq("/api/backend/progress-payments/pp-1/approve", "POST", {
        origin: "https://evil-production.up.railway.app",
      }),
      ctx(["progress-payments", "pp-1", "approve"]),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, code: "forbidden" });
    // 🔒 Asil iddia: yazma BACKEND'E HIC ULASMADI.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("yabanci Origin'li %s de 403 alir, backend cagrilmaz", async (method, handler) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(
      originReq("/api/backend/projects/p-1", method, { origin: "https://evil-production.up.railway.app" }, { name: "kirletildi" }),
      ctx(["projects", "p-1"]),
    );

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("`Origin: null` (referrer-policy ile gizlenmis capraz sayfa) da 403 alir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      originReq("/api/backend/projects", "POST", { origin: "null" }, { name: "x" }),
      ctx(["projects"]),
    );

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("multipart yukleme de capraz kaynaktan 403 alir (ham govde dali bypass DEGILDIR)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = new NextRequest("http://localhost:3000/api/backend/documents", {
      method: "POST",
      body: "--b\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\nx\r\n--b--\r\n",
      headers: {
        host: "localhost:3000",
        origin: "https://evil-production.up.railway.app",
        "content-type": "multipart/form-data; boundary=b",
      },
    });
    for (const [k, v] of Object.entries(AUTHED)) r.cookies.set(k, v);

    const res = await POST(r, ctx(["documents"]));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("KARSIT KANIT: ayni kaynakli POST kapiyi GECER, backend cagrilir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "p-9" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      originReq("/api/backend/projects", "POST", { origin: "http://localhost:3000" }, { name: "yeni" }),
      ctx(["projects"]),
    );

    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("KARSIT KANIT: GET muaftir — yabanci Origin'le bile 200 doner (yanit capraz OKUNAMAZ)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }),
    ));

    const res = await GET(
      originReq("/api/backend/users", "GET", { origin: "https://evil-production.up.railway.app" }),
      ctx(["users"]),
    );

    expect(res.status).toBe(200);
  });
});

/**
 * PLN-F2.0 — SÜRÜM BANDI (eski istemcinin yazmasını durdurma).
 *
 * Neden: `PUT /diary/{id}/lines` ve `worker_counts` DEĞİŞTİRME semantiğindedir.
 * Yeni sürüm canlıya çıktıktan sonra sekmesinde ESKİ JS açık kalan kullanıcı
 * kaydederse, eski paket yeni alanları hiç bilmediği için onları SİLEREK yazar.
 *
 * İki katman vardır ve ikisi de burada bekçilenir:
 *   1. Her yanıt `x-app-build: <sunucunun build kimliği>` taşır — istemci
 *      kendi kimliğiyle karşılaştırıp "eski sürüm" durumuna geçer.
 *   2. İstemci her isteğe KENDİ kimliğini koyar; YAZMA isteğinde kimlik
 *      sunucununkinden FARKLIYSA BFF isteği backend'e HİÇ iletmeden 412 ile
 *      reddeder. (1) tek başına, sürümden sonraki İLK yazmayı durduramazdı:
 *      başlık ancak o yazmanın YANITINDA görülür, silme o an olmuştur.
 * Başlık YOKSA (bu sürümden önceki istemci, tarayıcı dışı çağıran) reddetmez —
 * fail-open; gerekçe `route.ts`te.
 */
describe("BFF catch-all — surum bandi (x-app-build)", () => {
  const AUTHED = { [ACCESS_COOKIE]: "acc", [REFRESH_COOKIE]: "ref" };
  const SERVER_BUILD = "build-sunucu-1";

  function buildReq(url: string, method: string, headers: Record<string, string>, body?: unknown): NextRequest {
    const h: Record<string, string> = { host: "localhost:3000", ...headers };
    const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers: h };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      h["content-type"] = "application/json";
    }
    const r = new NextRequest("http://localhost:3000" + url, init);
    for (const [k, v] of Object.entries(AUTHED)) r.cookies.set(k, v);
    return r;
  }

  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend:8000";
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", SERVER_BUILD);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete process.env.BACKEND_URL;
  });

  it("GET 200 yaniti sunucunun build kimligini tasir", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 })));
    const res = await GET(buildReq("/api/backend/users", "GET", {}), ctx(["users"]));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-app-build")).toBe(SERVER_BUILD);
  });

  it("ikili (xlsx) yanit da build kimligini tasir", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      }),
    ));
    const res = await GET(buildReq("/api/backend/audit-log/export.xlsx", "GET", {}), ctx(["audit-log", "export.xlsx"]));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-app-build")).toBe(SERVER_BUILD);
  });

  it.each([
    ["POST 201", 201],
    ["POST 422", 422],
    ["POST 204", 204],
    ["POST 500", 500],
    ["POST 401", 401],
  ])("%s yaniti da build kimligini tasir", async (_label, status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(status === 204 ? null : JSON.stringify({ detail: "x" }), { status }),
    ));
    const res = await POST(buildReq("/api/backend/projects", "POST", {}, { name: "a" }), ctx(["projects"]));
    expect(res.status).toBe(status);
    expect(res.headers.get("x-app-build")).toBe(SERVER_BUILD);
  });

  it("izinsiz kok 404 ve 502 (backend erisilemez) de build kimligini tasir", async () => {
    const notFound = await GET(buildReq("/api/backend/secrets", "GET", {}), ctx(["secrets"]));
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get("x-app-build")).toBe(SERVER_BUILD);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const down = await GET(buildReq("/api/backend/users", "GET", {}), ctx(["users"]));
    expect(down.status).toBe(502);
    expect(down.headers.get("x-app-build")).toBe(SERVER_BUILD);
  });

  it.each([
    ["POST", POST],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("ESKI build kimlikli %s 412 alir ve backend'e HIC istek gitmez", async (method, handler) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(
      buildReq("/api/backend/diary/d-1/lines", method, { "x-app-build": "build-eski-0" }, { lines: [] }),
      ctx(["diary", "d-1", "lines"]),
    );

    expect(res.status).toBe(412);
    const body = await res.json();
    expect(body.code).toBe("stale_build");
    expect(body.detail).toBe("Uygulama güncellendi — kaydetmeden önce sayfayı yenileyin.");
    expect(res.headers.get("x-app-build")).toBe(SERVER_BUILD);
    // 🔒 Asil iddia: eski paketin DEGISTIRME yazmasi backend'e ULASMADI.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("eski kimlikli multipart yukleme de 412 alir (ham govde dali bypass DEGILDIR)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = new NextRequest("http://localhost:3000/api/backend/documents", {
      method: "POST",
      body: "--b\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\nx\r\n--b--\r\n",
      headers: { host: "localhost:3000", "x-app-build": "build-eski-0", "content-type": "multipart/form-data; boundary=b" },
    });
    for (const [k, v] of Object.entries(AUTHED)) r.cookies.set(k, v);
    const res = await POST(r, ctx(["documents"]));
    expect(res.status).toBe(412);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("KARSIT KANIT: ayni build kimlikli PUT backend'e iletilir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await PUT(
      buildReq("/api/backend/diary/d-1/lines", "PUT", { "x-app-build": SERVER_BUILD }, { lines: [] }),
      ctx(["diary", "d-1", "lines"]),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("FAIL-OPEN: build basligi OLMAYAN yazma (eski surum oncesi istemci / tarayici disi) iletilir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await PUT(buildReq("/api/backend/diary/d-1/lines", "PUT", {}, { lines: [] }), ctx(["diary", "d-1", "lines"]));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("GET serbesttir — eski build kimligiyle bile backend'e iletilir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(buildReq("/api/backend/users", "GET", { "x-app-build": "build-eski-0" }), ctx(["users"]));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.headers.get("x-app-build")).toBe(SERVER_BUILD);
  });
});
