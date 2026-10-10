import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backendUrl, proxyAuthenticated, proxyAuthenticatedRaw } from "./backend";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("backendUrl", () => {
  afterEach(() => {
    delete process.env.BACKEND_URL;
  });
  it("env yoksa hata firlatir", () => {
    delete process.env.BACKEND_URL;
    expect(() => backendUrl()).toThrow();
  });
  it("env varsa deger doner", () => {
    process.env.BACKEND_URL = "http://backend:8000";
    expect(backendUrl()).toBe("http://backend:8000");
  });
});

describe("proxyAuthenticated", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend:8000";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BACKEND_URL;
  });

  it("200'de govdeyi geciren", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { full_name: "Ali" })));
    const r = await proxyAuthenticated("acc", "ref", "/auth/me");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ full_name: "Ali" });
    expect(r.refreshedAccessToken).toBeUndefined();
  });

  it("401'de refresh basarili ise yeni access ile retry eder", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: "expired" })) // ilk /auth/me
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "new-acc", refresh_token: "ref2" })) // /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, { full_name: "Ali" })); // retry /auth/me
    vi.stubGlobal("fetch", fetchMock);
    const r = await proxyAuthenticated("old-acc", "ref", "/auth/me");
    expect(r.status).toBe(200);
    expect(r.refreshedAccessToken).toBe("new-acc");
    // retry cagirisi yeni access token'i kullanir
    const retryCall = fetchMock.mock.calls[2];
    expect(String(retryCall[1].headers.Authorization)).toContain("new-acc");
  });

  it("401 + refresh basarisiz ise 401 doner", async () => {
    vi.stubGlobal("fetch", vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {})));
    const r = await proxyAuthenticated("acc", "ref", "/auth/me");
    expect(r.status).toBe(401);
  });

  // 🔴 KAYIT (prose) — `proxyAuthenticatedRaw`in AYNI dalda govdeyi koruduğu
  // ikiz davranis: refresh basarisizken backend'in ILK yanitinin (Turkce
  // hata metni) DUSMEMESI gerekir. MUTASYON KANITI: `body: await
  // parseBody(first)` yerine `body: null` yazilirsa bu test KIRMIZI doner.
  it("401 + refresh basarisiz ise ILK yanitin govdesini (Turkce hata) KORUR", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { detail: "oturum suresi doldu" })) // ilk /auth/me
        .mockResolvedValueOnce(jsonResponse(401, { detail: "refresh token gecersiz" })), // /auth/refresh basarisiz
    );
    const r = await proxyAuthenticated("acc", "ref", "/auth/me");
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ detail: "oturum suresi doldu" });
  });

  it("401 + refresh 200 ama access_token eksikse ILK yanitin govdesini KORUR", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { detail: "oturum suresi doldu" })) // ilk /auth/me
        .mockResolvedValueOnce(jsonResponse(200, {})), // /auth/refresh 200 ama pair eksik
    );
    const r = await proxyAuthenticated("acc", "ref", "/auth/me");
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ detail: "oturum suresi doldu" });
  });

  it("refresh token yoksa 401'i dogrudan doner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    const r = await proxyAuthenticated("acc", undefined, "/auth/me");
    expect(r.status).toBe(401);
  });
});

describe("proxyAuthenticated (method/body/query)", () => {
  it("varsayilan GET — mevcut davranis korunur", async () => {
    process.env.BACKEND_URL = "http://backend:8000";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyAuthenticated("acc", "ref", "/auth/me");
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend:8000/auth/me");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.headers.Authorization).toBe("Bearer acc");
  });

  it("POST + body + query iletir", async () => {
    process.env.BACKEND_URL = "http://backend:8000";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "u1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyAuthenticated("acc", "ref", "/users", {
      method: "POST",
      body: { email: "a@b.com" },
      query: { limit: "20", offset: "0" },
    });
    expect(res.status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend:8000/users?limit=20&offset=0");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.com" });
  });

  it("401 + refresh — ayni method+body ile retry eder", async () => {
    process.env.BACKEND_URL = "http://backend:8000";
    const jwt = `h.${Buffer.from(JSON.stringify({ exp: 9999999999 })).toString("base64url")}.s`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: jwt, refresh_token: jwt }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyAuthenticated("old", "ref", "/roles", { method: "PATCH", body: { name: "X" } });
    expect(res.status).toBe(200);
    expect(res.refreshedAccessToken).toBe(jwt);
    // 3. cagri retry: ayni method+body, yeni token
    const [, retryInit] = fetchMock.mock.calls[2];
    expect(retryInit.method).toBe("PATCH");
    expect(JSON.parse(retryInit.body)).toEqual({ name: "X" });
    expect(retryInit.headers.Authorization).toBe(`Bearer ${jwt}`);
  });
});

// F9 · spec §8.1: ikili/JSON karari ARTIK yanit geldikten sonra veriliyor, bu
// yuzden proxy gövdeyi HER DURUMDA ArrayBuffer olarak okur. Eski
// `proxyAuthenticatedBinary` `!res.ok` iken gövdeyi düşürüyordu → backend'in
// 403/409/422 Türkçe hata gövdeleri kayboluyordu.
describe("proxyAuthenticatedRaw (spec §8.1)", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend:8000";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BACKEND_URL;
  });

  function bytesOf(buffer: ArrayBuffer): number[] {
    return Array.from(new Uint8Array(buffer));
  }

  it("basarili ikili yaniti bayt bayt ve basliklariyla tasir", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          status: 200,
          headers: {
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition": 'attachment; filename="is-kalemleri-STE-01.xlsx"',
          },
        }),
      ),
    );
    const r = await proxyAuthenticatedRaw("acc", "ref", "/sites/s1/boq/export");
    expect(r.status).toBe(200);
    expect(bytesOf(r.data)).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(r.contentType).toContain("spreadsheetml");
    expect(r.contentDisposition).toContain("is-kalemleri-STE-01.xlsx");
  });

  it("hata yanitinda da govdeyi okur (403 Turkce govde kaybolmaz)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(403, { detail: "Bu işlem için yetkiniz yok" })),
    );
    const r = await proxyAuthenticatedRaw("acc", "ref", "/sites/s1/boq/export");
    expect(r.status).toBe(403);
    expect(new TextDecoder().decode(r.data)).toContain("Bu işlem için yetkiniz yok");
  });

  it("401'de refresh sonrasi tek retry yapar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "new-acc", refresh_token: "r2" }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2]), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const r = await proxyAuthenticatedRaw("old", "ref", "/sites/s1/boq/export");
    expect(r.status).toBe(200);
    expect(r.refreshedAccessToken).toBe("new-acc");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][1].headers.Authorization)).toContain("new-acc");
  });

  it("refresh token yoksa 401 dogrudan doner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    const r = await proxyAuthenticatedRaw("acc", undefined, "/sites/s1/boq/export");
    expect(r.status).toBe(401);
  });
});

// Olu kod kapisi (spec §8.1 madde 1): tek cagirani route.ts'ti, silindi.
describe("proxyAuthenticatedBinary — olu kod kapisi", () => {
  it("artik export edilmiyor", async () => {
    const backendModule = await import("./backend");
    expect("proxyAuthenticatedBinary" in backendModule).toBe(false);
  });
});

describe("istemci IP'sinin iletilmesi (clientIp)", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend:8000";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BACKEND_URL;
  });

  function headersOf(call: unknown[]): Record<string, string> {
    return (call[1] as RequestInit).headers as Record<string, string>;
  }

  it("clientIp verilince ilk istek, refresh ve retry x-forwarded-for tasir", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "new-acc", refresh_token: "ref2" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await proxyAuthenticated("acc", "ref", "/auth/me", { clientIp: "203.0.113.7" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect(headersOf(call)["x-forwarded-for"]).toBe("203.0.113.7");
    }
  });

  it("proxyAuthenticatedRaw da ilk istek, refresh ve retry'da iletir", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "new-acc", refresh_token: "ref2" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await proxyAuthenticatedRaw("acc", "ref", "/x", { clientIp: "2001:db8::1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect(headersOf(call)["x-forwarded-for"]).toBe("2001:db8::1");
    }
  });

  it("clientIp yoksa x-forwarded-for basligi HIC eklenmez", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await proxyAuthenticated("acc", "ref", "/auth/me");
    expect("x-forwarded-for" in headersOf(fetchMock.mock.calls[0])).toBe(false);
  });
});
