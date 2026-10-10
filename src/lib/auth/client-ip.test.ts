import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { clientIpOf, forwardedIpHeaders } from "./client-ip";

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/api/x", { headers });
}

describe("clientIpOf", () => {
  it("x-real-ip varsa onu doner", () => {
    expect(clientIpOf(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
  });

  it("x-real-ip yoksa x-forwarded-for'un ILK girdisine duser (bosluk kirpilir)", () => {
    expect(clientIpOf(req({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }))).toBe("198.51.100.1");
  });

  it("IPv6 kabul eder", () => {
    expect(clientIpOf(req({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("gecersiz x-real-ip'te x-forwarded-for'a duser", () => {
    expect(clientIpOf(req({ "x-real-ip": "unknown", "x-forwarded-for": "198.51.100.1" }))).toBe("198.51.100.1");
  });

  it("IP olmayan degerde undefined doner (backend'e cop yazilmaz)", () => {
    expect(clientIpOf(req({ "x-forwarded-for": "999.1.1.1" }))).toBeUndefined();
    expect(clientIpOf(req({ "x-real-ip": "evil; drop" }))).toBeUndefined();
  });

  it("baslik yoksa undefined doner", () => {
    expect(clientIpOf(req({}))).toBeUndefined();
  });
});

describe("forwardedIpHeaders", () => {
  it("IP varsa x-forwarded-for basligi uretir", () => {
    expect(forwardedIpHeaders("203.0.113.7")).toEqual({ "x-forwarded-for": "203.0.113.7" });
  });

  it("IP yoksa bos nesne doner", () => {
    expect(forwardedIpHeaders(undefined)).toEqual({});
  });
});
