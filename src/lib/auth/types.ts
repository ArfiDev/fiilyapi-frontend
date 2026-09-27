import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// Backend sozlesmesinden turetilen auth tipleri (openapi.json DONMUS).
export type TokenPair = DeepScale<components["schemas"]["TokenPair"]>;
export type MeResponse = DeepScale<components["schemas"]["MeResponse"]>;
export type LoginRequest = DeepScale<components["schemas"]["LoginRequest"]>;

// Next cookie set secenekleriyle uyumlu cerez tanimi.
export interface CookieSpec {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge?: number;
}
