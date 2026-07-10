const MARGEN_EXPIRACION_SEGUNDOS = 30;

/** Lee solo `exp`; no confía en el payload ni sustituye la validación de firma. */
export function jwtVigente(token: string, ahora = Date.now()): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    if (typeof decoded.exp !== "number") return false;
    return decoded.exp > Math.floor(ahora / 1000) + MARGEN_EXPIRACION_SEGUNDOS;
  } catch {
    return false;
  }
}
