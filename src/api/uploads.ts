import { open, type FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import type { AppStoreConnectClient } from "./client.js";
import { getCatalog } from "./catalog.js";

interface UploadOperation {
  method: string;
  url: string;
  offset: number;
  length: number;
  requestHeaders?: { name: string; value: string }[];
}
interface Asset {
  id: string;
  type: string;
  attributes?: { fileSize?: number; uploadOperations?: UploadOperation[] };
}
const assetTypes = [
  "appScreenshots",
  "appPreviews",
  "appStoreReviewAttachments",
  "buildUploadFiles",
] as const;
export type AssetType = (typeof assetTypes)[number];
export { assetTypes };

async function* chunks(file: FileHandle, offset: number, length: number) {
  let position = offset;
  while (position < offset + length) {
    const buffer = Buffer.allocUnsafe(
      Math.min(1024 * 1024, offset + length - position),
    );
    const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
    if (!bytesRead)
      throw new Error("File ended before the reserved upload range");
    position += bytesRead;
    yield buffer.subarray(0, bytesRead);
  }
}

/** Upload only to operations read directly from Apple's authenticated API. */
export async function uploadReservedAsset(
  client: AppStoreConnectClient,
  type: AssetType,
  id: string,
  filePath: string,
) {
  const catalog = getCatalog();
  const file = await open(filePath, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1)
      throw new Error("Upload requires a nonempty regular file");
    const response = (await catalog.execute(
      client,
      { operationId: `${type}_getInstance`, path: { id } },
      "read",
    )) as { data: Asset };
    const asset = response.data;
    if (!asset || asset.type !== type || asset.id !== id)
      throw new Error("Apple returned an unexpected upload resource");
    const operations = asset.attributes?.uploadOperations;
    if (asset.attributes?.fileSize !== stat.size || !operations?.length)
      throw new Error(
        "File size differs from reservation or Apple has no pending upload operations",
      );
    let offset = 0;
    for (const op of operations) {
      const url = new URL(op.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !["apple.com", "icloud.com", "amazonaws.com"].some(
          (d) => url.hostname === d || url.hostname.endsWith(`.${d}`),
        )
      )
        throw new Error("Unexpected upload destination from Apple");
      if (
        op.method !== "PUT" ||
        !Number.isSafeInteger(op.offset) ||
        !Number.isSafeInteger(op.length) ||
        op.offset !== offset ||
        op.length <= 0
      )
        throw new Error("Invalid upload ranges returned by Apple");
      offset += op.length;
    }
    if (offset !== stat.size)
      throw new Error("Upload ranges do not cover the complete file");
    const md5 = createHash("md5"),
      sha256 = createHash("sha256");
    // Hash via the same open file handle; files are never read entirely into memory.
    for await (const chunk of chunks(file, 0, stat.size)) {
      md5.update(chunk);
      sha256.update(chunk);
    }
    for (const op of operations) {
      const headers = Object.fromEntries(
        (op.requestHeaders || []).map((h) => [h.name, h.value]),
      );
      const stream = Readable.from(chunks(file, op.offset, op.length));
      try {
        const response = await fetch(op.url, {
          method: "PUT",
          headers,
          body: stream as unknown as BodyInit,
          duplex: "half",
          redirect: "error",
          signal: AbortSignal.timeout(30 * 60_000),
        } as RequestInit);
        if (!response.ok)
          throw new Error(
            `Apple asset upload failed (${response.status}); inspect the reservation before retrying`,
          );
        await response.body?.cancel();
      } finally {
        stream.destroy();
      }
    }
    const after = await file.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
      throw new Error("File changed while uploading; upload was not committed");
    const attributes =
      type === "buildUploadFiles"
        ? {
            uploaded: true,
            sourceFileChecksums: {
              file: { algorithm: "SHA_256", hash: sha256.digest("hex") },
            },
          }
        : { uploaded: true, sourceFileChecksum: md5.digest("hex") };
    return catalog.execute(
      client,
      {
        operationId: `${type}_updateInstance`,
        path: { id },
        body: { data: { type, id, attributes } },
      },
      "write",
    );
  } finally {
    await file.close();
  }
}

export interface BuildUploadInput {
  appId: string;
  filePath: string;
  version: string;
  buildNumber: string;
  platform: "IOS" | "MAC_OS" | "TV_OS" | "VISION_OS";
}
export async function uploadBuild(
  client: AppStoreConnectClient,
  input: BuildUploadInput,
) {
  const uti = (
    {
      ".ipa": "com.apple.ipa",
      ".pkg": "com.apple.pkg",
      ".zip": "com.pkware.zip-archive",
    } as Record<string, string>
  )[extname(input.filePath).toLowerCase()];
  if (!uti) throw new Error("Build file must be a signed .ipa, .pkg or .zip");
  const f = await open(input.filePath, "r");
  const stat = await f.stat();
  await f.close();
  if (!stat.isFile() || stat.size < 1)
    throw new Error("Build must be a nonempty regular file");
  const catalog = getCatalog();
  const created = (await catalog.execute(
    client,
    {
      operationId: "buildUploads_createInstance",
      body: {
        data: {
          type: "buildUploads",
          attributes: {
            cfBundleShortVersionString: input.version,
            cfBundleVersion: input.buildNumber,
            platform: input.platform,
          },
          relationships: { app: { data: { type: "apps", id: input.appId } } },
        },
      },
    },
    "write",
  )) as { data: Asset };
  const buildUploadId = created.data.id;
  let fileId: string | undefined;
  try {
    const reserved = (await catalog.execute(
      client,
      {
        operationId: "buildUploadFiles_createInstance",
        body: {
          data: {
            type: "buildUploadFiles",
            attributes: {
              fileName: basename(input.filePath),
              fileSize: stat.size,
              assetType: "ASSET",
              uti,
            },
            relationships: {
              buildUpload: {
                data: { type: "buildUploads", id: buildUploadId },
              },
            },
          },
        },
      },
      "write",
    )) as { data: Asset };
    fileId = reserved.data.id;
    const file = await uploadReservedAsset(
      client,
      "buildUploadFiles",
      fileId,
      input.filePath,
    );
    return {
      buildUploadId,
      buildUploadFileId: fileId,
      file,
      next: "Read buildUploads_getInstance until processing completes, then resolve the build and distribute to groups. Uploading does not submit beta review.",
    };
  } catch (error) {
    throw new Error(
      `Upload incomplete (buildUploadId=${buildUploadId}${fileId ? `, buildUploadFileId=${fileId}` : ""}). Inspect/resume the existing reservation before creating another. ${error instanceof Error ? error.message : "Upload failed"}`,
    );
  }
}
