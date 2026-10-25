import { describe, it, expect, vi } from "vitest";
import { submitVersionReview } from "../../src/api/review.js";
import { AppStoreConnectClient } from "../../src/api/client.js";

describe("App Store review workflow", () => {
  it("reuses a draft, attaches the requested version, then actually submits", async () => {
    const client = new AppStoreConnectClient("i", "k", "/unused");
    vi.spyOn(client, "get")
      .mockResolvedValueOnce([
        { id: "version", appStoreState: "PREPARE_FOR_SUBMISSION" },
      ])
      .mockResolvedValueOnce([{ id: "submission", state: "READY_FOR_REVIEW" }])
      .mockResolvedValueOnce([]);
    const raw = vi
      .spyOn(client, "raw")
      .mockResolvedValue({
        data: { id: "submission", type: "reviewSubmissions" },
      });
    await expect(
      submitVersionReview(client, { appId: "app" }),
    ).resolves.toMatchObject({
      submissionId: "submission",
      versionId: "version",
    });
    expect(raw).toHaveBeenNthCalledWith(
      1,
      "POST",
      "/v1/reviewSubmissionItems",
      expect.objectContaining({
        data: expect.objectContaining({
          relationships: expect.objectContaining({
            appStoreVersion: {
              data: { type: "appStoreVersions", id: "version" },
            },
          }),
        }),
      }),
    );
    expect(raw).toHaveBeenNthCalledWith(
      2,
      "PATCH",
      "/v1/reviewSubmissions/submission",
      {
        data: {
          type: "reviewSubmissions",
          id: "submission",
          attributes: { submitted: true },
        },
      },
    );
  });
  it("does not duplicate an attached version and preserves a failed submission's ID", async () => {
    const client = new AppStoreConnectClient("i", "k", "/unused");
    vi.spyOn(client, "get")
      .mockResolvedValueOnce([{ id: "version" }])
      .mockResolvedValueOnce([{ id: "submission", state: "READY_FOR_REVIEW" }])
      .mockResolvedValueOnce([
        { relationships: { appStoreVersion: { data: { id: "version" } } } },
      ]);
    const raw = vi
      .spyOn(client, "raw")
      .mockRejectedValue(new Error("Missing metadata"));
    await expect(
      submitVersionReview(client, {
        appId: "app",
        versionId: "version",
        submissionId: "submission",
      }),
    ).rejects.toThrow(/submissionId=submission/);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(raw.mock.calls[0][0]).toBe("PATCH");
  });
  it("rejects a foreign version before creating a submission", async () => {
    const client = new AppStoreConnectClient("i", "k", "/unused");
    vi.spyOn(client, "get").mockResolvedValueOnce([{ id: "actual" }]);
    const raw = vi.spyOn(client, "raw");
    await expect(
      submitVersionReview(client, { appId: "app", versionId: "foreign" }),
    ).rejects.toThrow(/exactly one/);
    expect(raw).not.toHaveBeenCalled();
  });
});
