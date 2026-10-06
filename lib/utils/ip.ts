export function getClientIp(
  headers?:
    | Record<string, string | string[] | undefined>
    | Headers
    | null
): string {
  if (!headers) return "127.0.0.1";

  let forwarded: string | undefined;

  if (typeof (headers as Headers).get === "function") {
    const h = headers as Headers;
    forwarded =
      h.get("x-forwarded-for") ??
      h.get("x-real-ip") ??
      h.get("cf-connecting-ip") ??
      undefined;
  } else {
    const rec = headers as Record<string, string | string[] | undefined>;
    const raw =
      rec["x-forwarded-for"] ?? rec["x-real-ip"] ?? rec["cf-connecting-ip"];
    forwarded = Array.isArray(raw) ? raw[0] : raw;
  }

  if (forwarded) {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  return "127.0.0.1";
}
