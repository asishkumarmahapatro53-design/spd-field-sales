import { afterEach, describe, expect, it, vi } from "vitest";
import { reverseGeocodeWithMappls } from "@/lib/geocoding";

const originalEnv = { ...process.env };

describe("Mappls reverse geocoding", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("requires a Mappls REST API key", async () => {
    delete process.env.MAPPLS_REST_API_KEY;

    const result = await reverseGeocodeWithMappls(20.2961, 85.8245);

    expect(result.provider).toBe("mappls");
    expect(result.address).toBeNull();
    expect(result.error).toContain("MAPPLS_REST_API_KEY");
  });

  it("calls the Mappls reverse geocode endpoint and extracts a formatted address", async () => {
    process.env.MAPPLS_REST_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ formatted_address: "Jayadev Vihar, Bhubaneswar, Odisha" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await reverseGeocodeWithMappls(20.2961, 85.8245);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: "https://apis.mappls.com/advancedmaps/v1/test-key/rev_geocode?lat=20.2961&lng=85.8245" }),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
    expect(result.address).toBe("Jayadev Vihar, Bhubaneswar, Odisha");
  });

  it("extracts Mappls-style address fields", async () => {
    process.env.MAPPLS_REST_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ formattedAddress: "Bhubaneswar, Odisha" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await reverseGeocodeWithMappls(20.2961, 85.8245);

    expect(result.address).toBe("Bhubaneswar, Odisha");
  });
});
