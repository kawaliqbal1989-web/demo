import { baseURL } from "../services/apiClient";

function resolveAssetUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^https?:\/\//i.test(text) || text.startsWith("data:") || text.startsWith("blob:")) {
    return text;
  }

  const apiOrigin = String(baseURL || "").replace(/\/api\/?$/, "");
  if (!apiOrigin) {
    return text;
  }

  if (text.startsWith("/")) {
    return `${apiOrigin}${text}`;
  }

  return `${apiOrigin}/${text}`;
}

export { resolveAssetUrl };