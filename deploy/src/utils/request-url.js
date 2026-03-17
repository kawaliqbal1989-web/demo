function firstForwardedValue(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .find(Boolean) || "";
}

const httpsPreferredHosts = new Set([
  "abacuseducation.online",
  "www.abacuseducation.online",
  "api.abacuseducation.online"
]);

function shouldUpgradeUploadUrl(url) {
  if (!url || url.protocol !== "http:" || !url.pathname.startsWith("/uploads/")) {
    return false;
  }

  return httpsPreferredHosts.has(normalizeHostName(url.host));
}

function normalizeHostName(host) {
  const value = String(host || "").trim();
  if (!value) {
    return "";
  }

  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return value.toLowerCase().replace(/:\d+$/, "");
  }
}

function getRequestOrigin(req) {
  const host = firstForwardedValue(req.get("x-forwarded-host")) || req.get("host") || "";
  const forwardedProto = firstForwardedValue(req.get("x-forwarded-proto"));
  const forwardedSsl = firstForwardedValue(req.get("x-forwarded-ssl"));
  const forwardedPort = firstForwardedValue(req.get("x-forwarded-port"));
  const normalizedHost = normalizeHostName(host);

  let protocol = forwardedProto || req.protocol || "http";

  if (
    String(forwardedSsl).toLowerCase() === "on" ||
    String(forwardedPort) === "443" ||
    httpsPreferredHosts.has(normalizedHost)
  ) {
    protocol = "https";
  }

  if (!host) {
    return "";
  }

  return `${protocol}://${host}`;
}

function buildUploadUrl(req, uploadPath) {
  const normalizedPath = String(uploadPath || "").trim();
  if (!normalizedPath) {
    return "";
  }

  const path = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  const origin = getRequestOrigin(req);

  return origin ? `${origin}${path}` : path;
}

function normalizeStoredUploadUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (!/^https?:\/\//i.test(text)) {
    return text;
  }

  try {
    const url = new URL(text);
    if (shouldUpgradeUploadUrl(url)) {
      url.protocol = "https:";
    }
    return url.toString();
  } catch {
    return text;
  }
}

export { buildUploadUrl, getRequestOrigin, normalizeStoredUploadUrl };