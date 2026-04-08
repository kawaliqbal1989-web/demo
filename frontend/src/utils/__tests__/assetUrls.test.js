import { describe, expect, it, vi } from "vitest";

vi.mock("../../services/apiClient", () => ({
  baseURL: "http://localhost:4000/api"
}));

import { resolveAssetUrl } from "../assetUrls";

describe("resolveAssetUrl", () => {
  it("keeps localhost upload URLs on http when the API origin is not secure", () => {
    expect(resolveAssetUrl("http://localhost:4000/uploads/business-partner-logos/logo.png")).toBe(
      "http://localhost:4000/uploads/business-partner-logos/logo.png"
    );
  });

  it("upgrades known production upload hosts to https", () => {
    expect(resolveAssetUrl("http://api.abacuseducation.online/uploads/business-partner-logos/logo.png")).toBe(
      "https://api.abacuseducation.online/uploads/business-partner-logos/logo.png"
    );
  });

  it("resolves root-relative upload paths against the API origin", () => {
    expect(resolveAssetUrl("/uploads/business-partner-logos/logo.png")).toBe(
      "http://localhost:4000/uploads/business-partner-logos/logo.png"
    );
  });
});