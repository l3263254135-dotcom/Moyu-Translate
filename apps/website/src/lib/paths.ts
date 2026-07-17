export function withBase(base: string, path = "") {
  const normalizedBase = base.replace(/\/+$/u, "");
  const normalizedPath = path.replace(/^\/+|\/+$/gu, "");
  return normalizedPath ? `${normalizedBase}/${normalizedPath}/` : `${normalizedBase}/`;
}
