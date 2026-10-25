import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { AppStoreConnectClient } from "../../src/api/client.js";
import { uploadReservedAsset, uploadBuild } from "../../src/api/uploads.js";

describe("Apple file delivery", () => {
  let folder: string, path: string;
  const bytes = Buffer.from("signed-build-fixture");
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "asc-upload-"));
    path = join(folder, "test.ipa");
    await writeFile(path, bytes);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(folder, { recursive: true });
  });
  const reservation = (url = "https://delivery.apple.com/upload") => ({
    data: {
      id: "file",
      type: "buildUploadFiles",
      attributes: {
        fileSize: bytes.length,
        uploadOperations: [
          {
            method: "PUT",
            url,
            offset: 0,
            length: bytes.length,
            requestHeaders: [{ name: "x-upload", value: "signed" }],
          },
        ],
      },
    },
  });

  it("streams exact bytes without ASC credentials and commits the whole-file checksum", async () => {
    const client = new AppStoreConnectClient("i", "k", "/unused");
    const raw = vi
      .spyOn(client, "raw")
      .mockResolvedValueOnce(reservation())
      .mockResolvedValueOnce({
        data: { id: "file", type: "buildUploadFiles" },
      });
    let uploaded = Buffer.alloc(0);
    const fetch = vi.fn(async (_url: string, init: any) => {
      for await (const chunk of init.body)
        uploaded = Buffer.concat([uploaded, chunk]);
      expect(init.headers).toEqual({ "x-upload": "signed" });
      expect(init.redirect).toBe("error");
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    await uploadReservedAsset(client, "buildUploadFiles", "file", path);
    expect(uploaded).toEqual(bytes);
    expect(raw).toHaveBeenLastCalledWith("PATCH", "/v1/buildUploadFiles/file", {
      data: {
        type: "buildUploadFiles",
        id: "file",
        attributes: {
          uploaded: true,
          sourceFileChecksums: {
            file: {
              algorithm: "SHA_256",
              hash: createHash("sha256").update(bytes).digest("hex"),
            },
          },
        },
      },
    });
  });
  it("never commits a failed PUT", async () => {
    const client = new AppStoreConnectClient("i", "k", "/unused");
    const raw = vi.spyOn(client, "raw").mockResolvedValueOnce(reservation());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        for await (const _chunk of init.body) {
        }
        return new Response(null, { status: 500 });
      }),
    );
    await expect(
      uploadReservedAsset(client, "buildUploadFiles", "file", path),
    ).rejects.toThrow(/500/);
    expect(raw).toHaveBeenCalledTimes(1);
  });
  it("rejects unsafe URLs and incomplete ranges before sending bytes", async () => {
    const client = new AppStoreConnectClient("i", "k", "/unused");
    const raw = vi
      .spyOn(client, "raw")
      .mockResolvedValueOnce(reservation("https://127.0.0.1/upload"));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      uploadReservedAsset(client, "buildUploadFiles", "file", path),
    ).rejects.toThrow(/destination/);
    const bad = reservation();
    bad.data.attributes.uploadOperations[0].length--;
    raw.mockResolvedValueOnce(bad);
    await expect(
      uploadReservedAsset(client, "buildUploadFiles", "file", path),
    ).rejects.toThrow(/complete file/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("retains reservation IDs after a failed build upload", async () => {
    const client = new AppStoreConnectClient("i", "k", "/unused");
    vi.spyOn(client, "raw")
      .mockResolvedValueOnce({ data: { id: "upload", type: "buildUploads" } })
      .mockRejectedValueOnce(new Error("Apple unavailable"));
    await expect(
      uploadBuild(client, {
        appId: "app",
        filePath: path,
        version: "1.0",
        buildNumber: "1",
        platform: "IOS",
      }),
    ).rejects.toThrow(/buildUploadId=upload/);
  });
});
