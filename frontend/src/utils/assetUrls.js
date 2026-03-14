import { baseURL } from "../services/apiClient";

const secureUploadHosts = new Set(["api.abacuseducation.online"]);

function shouldUpgradeUploadUrlToHttps({ assetUrl, apiUrl }) {
  if (assetUrl.protocol !== "http:" || !assetUrl.pathname.startsWith("/uploads/")) {
    return false;
  }

  if (apiUrl && assetUrl.host === apiUrl.host) {
    return true;
  }

  if (secureUploadHosts.has(String(assetUrl.hostname || "").toLowerCase())) {
    return true;
  }

  return typeof window !== "undefined" && window.location?.protocol === "https:";
}

function resolveAssetUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (text.startsWith("data:") || text.startsWith("blob:")) {
    return text;
  }

  const apiOrigin = String(baseURL || "").replace(/\/api\/?$/, "");

  if (/^https?:\/\//i.test(text)) {
    if (!apiOrigin) {
      try {
        const assetUrl = new URL(text);
        if (shouldUpgradeUploadUrlToHttps({ assetUrl, apiUrl: null })) {
          assetUrl.protocol = "https:";
          return assetUrl.toString();
        }
      } catch {
        return text;
      }

      return text;
    }

    try {
      const assetUrl = new URL(text);
      const apiUrl = new URL(apiOrigin);
      if (shouldUpgradeUploadUrlToHttps({ assetUrl, apiUrl })) {
        assetUrl.protocol = "https:";
      }

      if (assetUrl.host === apiUrl.host && assetUrl.pathname.startsWith("/uploads/")) {
        return `${assetUrl.origin}${assetUrl.pathname}${assetUrl.search}${assetUrl.hash}`;
      }

      return assetUrl.toString();
    } catch {
      return text;
    }
  }

  if (!apiOrigin) {
    return text;
  }

  if (text.startsWith("/")) {
    return `${apiOrigin}${text}`;
  }

  return `${apiOrigin}/${text}`;
}

export { resolveAssetUrl };