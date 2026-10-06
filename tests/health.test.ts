import { describe, it, expect } from "vitest";
import { GET } from "../app/api/health/route";

describe("/api/health route", () => {
  it("returns status ok with 200 status code", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "ok" });
  });
});
