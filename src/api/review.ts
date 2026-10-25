import type { AppStoreConnectClient } from "./client.js";
import { getCatalog } from "./catalog.js";

interface Version {
  id: string;
  appStoreState?: string;
  appVersionState?: string;
}
interface Submission {
  id: string;
  state?: string;
}

export async function submitVersionReview(
  client: AppStoreConnectClient,
  input: {
    appId: string;
    platform?: string;
    versionId?: string;
    submissionId?: string;
  },
) {
  const platform = input.platform || "IOS";
  const versions = (await client.get(
    `/v1/apps/${encodeURIComponent(input.appId)}/appStoreVersions`,
    { "filter[platform]": platform },
  )) as Version[];
  const candidates = versions.filter((v) =>
    input.versionId
      ? v.id === input.versionId
      : [
          "PREPARE_FOR_SUBMISSION",
          "READY_FOR_REVIEW",
          "DEVELOPER_REJECTED",
          "REJECTED",
          "METADATA_REJECTED",
        ].includes(v.appVersionState || v.appStoreState || ""),
  );
  if (candidates.length !== 1)
    throw new Error(
      "Resolve exactly one editable version belonging to this app and platform; supply versionId explicitly",
    );
  const versionId = candidates[0].id;
  const submissions = (await client.get("/v1/reviewSubmissions", {
    "filter[app]": input.appId,
    "filter[platform]": platform,
  })) as Submission[];
  const existing = submissions.filter((s) =>
    input.submissionId
      ? s.id === input.submissionId
      : s.state === "READY_FOR_REVIEW",
  );
  if (existing.length > 1 || (input.submissionId && existing.length !== 1))
    throw new Error(
      "Resolve one draft review submission belonging to this app; supply submissionId explicitly",
    );
  if (existing[0] && existing[0].state !== "READY_FOR_REVIEW")
    throw new Error("Review submission is not editable");
  const catalog = getCatalog();
  let submissionId = existing[0]?.id;
  if (!submissionId) {
    const response = (await catalog.execute(
      client,
      {
        operationId: "reviewSubmissions_createInstance",
        body: {
          data: {
            type: "reviewSubmissions",
            attributes: { platform },
            relationships: { app: { data: { type: "apps", id: input.appId } } },
          },
        },
      },
      "write",
    )) as { data: { id: string } };
    submissionId = response.data.id;
  }
  try {
    const items = (await client.get(
      `/v1/reviewSubmissions/${encodeURIComponent(submissionId)}/items`,
    )) as { relationships?: { appStoreVersion?: { data?: { id: string } } } }[];
    const otherVersion = items.some(
      (i) =>
        i.relationships?.appStoreVersion?.data &&
        i.relationships.appStoreVersion.data.id !== versionId,
    );
    if (otherVersion)
      throw new Error(
        "Draft contains a different app version; inspect its items before submitting",
      );
    if (
      !items.some(
        (i) => i.relationships?.appStoreVersion?.data?.id === versionId,
      )
    ) {
      await catalog.execute(
        client,
        {
          operationId: "reviewSubmissionItems_createInstance",
          body: {
            data: {
              type: "reviewSubmissionItems",
              relationships: {
                reviewSubmission: {
                  data: { type: "reviewSubmissions", id: submissionId },
                },
                appStoreVersion: {
                  data: { type: "appStoreVersions", id: versionId },
                },
              },
            },
          },
        },
        "write",
      );
    }
    const submission = await catalog.execute(
      client,
      {
        operationId: "reviewSubmissions_updateInstance",
        path: { id: submissionId },
        body: {
          data: {
            type: "reviewSubmissions",
            id: submissionId,
            attributes: { submitted: true },
          },
        },
      },
      "write",
    );
    return { submissionId, versionId, submission };
  } catch (error) {
    throw new Error(
      `Review not completed (submissionId=${submissionId}, versionId=${versionId}). Inspect and resume this submission. ${error instanceof Error ? error.message : "Request failed"}`,
    );
  }
}
