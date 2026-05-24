import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "./route";
import { PUT } from "./status/route";

vi.mock("./status/route", () => ({
  PUT: vi.fn(),
}));

const mockPut = vi.mocked(PUT);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/applications/[id]", () => {
  const routeParams = { params: Promise.resolve({ id: "test-app-id" }) };

  it("delegates to PUT status with withdrawn and returns the response", async () => {
    mockPut.mockResolvedValue(
      new Response(JSON.stringify({ application: { status: "withdrawn" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const request = new NextRequest(
      "http://localhost/api/applications/test-app-id",
      { method: "DELETE", headers: { Authorization: "Bearer test" } }
    );

    const response = await DELETE(request, routeParams);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.application.status).toBe("withdrawn");

    expect(mockPut).toHaveBeenCalledTimes(1);
    const [putRequest, putContext] = mockPut.mock.calls[0];
    expect(putRequest.method).toBe("PUT");
    expect(putRequest.url).toBe(
      "http://localhost/api/applications/test-app-id/status"
    );
    expect(putRequest.headers.get("Content-Type")).toBe("application/json");
    expect(await putRequest.json()).toEqual({ status: "withdrawn" });
    expect(putContext).toEqual(routeParams);
  });
});
