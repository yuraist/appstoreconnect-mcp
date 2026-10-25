import { z } from "zod";
import { getCatalog } from "../api/catalog.js";
import type { ToolContext } from "../types/index.js";
import { result, readAnnotations, writeAnnotations } from "./api.js";

const id = z.string().min(1);
const link = (type: string, id: string) => ({ data: { type, id } });
export function registerTestFlightTools({ server, client }: ToolContext) {
  const call = (operationId: string, body?: unknown, resourceId?: string) =>
    getCatalog().execute(
      client,
      {
        operationId,
        body,
        ...(resourceId ? { path: { id: resourceId } } : {}),
      },
      "write",
    );

  server.registerTool(
    "create_beta_group",
    {
      description:
        "Create an internal or external TestFlight group. External public links are optional. Internal testers must already be eligible ASC team users.",
      annotations: writeAnnotations,
      inputSchema: z.object({
        appId: id,
        name: z.string().min(1),
        isInternalGroup: z.boolean().default(false),
        publicLinkEnabled: z.boolean().optional(),
        publicLinkLimit: z.number().int().min(1).max(10000).optional(),
      }),
    },
    async ({ appId, publicLinkLimit, ...attributes }) => {
      if (
        attributes.isInternalGroup &&
        (attributes.publicLinkEnabled || publicLinkLimit)
      )
        throw new Error("Public links are only available for external groups");
      return result(
        await call("betaGroups_createInstance", {
          data: {
            type: "betaGroups",
            attributes: {
              ...attributes,
              ...(publicLinkLimit
                ? { publicLinkLimit, publicLinkLimitEnabled: true }
                : {}),
            },
            relationships: { app: link("apps", appId) },
          },
        }),
      );
    },
  );
  server.registerTool(
    "update_beta_group",
    {
      description:
        "Rename a TestFlight group or enable/disable its public invitation link and tester limit.",
      annotations: writeAnnotations,
      inputSchema: z.object({
        betaGroupId: id,
        name: z.string().min(1).optional(),
        publicLinkEnabled: z.boolean().optional(),
        publicLinkLimitEnabled: z.boolean().optional(),
        publicLinkLimit: z.number().int().min(1).max(10000).optional(),
      }),
    },
    async ({ betaGroupId, ...attributes }) =>
      result(
        await call(
          "betaGroups_updateInstance",
          { data: { type: "betaGroups", id: betaGroupId, attributes } },
          betaGroupId,
        ),
      ),
  );
  server.registerTool(
    "create_beta_tester",
    {
      description:
        "Create/invite a TestFlight tester by email and assign to groups. May send invitation email. For internal testing, the user must already have the appropriate ASC team access.",
      annotations: writeAnnotations,
      inputSchema: z.object({
        email: z.email(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        betaGroupIds: z.array(id).min(1),
      }),
    },
    async ({ betaGroupIds, ...attributes }) =>
      result(
        await call("betaTesters_createInstance", {
          data: {
            type: "betaTesters",
            attributes,
            relationships: {
              betaGroups: {
                data: betaGroupIds.map((id) => ({ type: "betaGroups", id })),
              },
            },
          },
        }),
      ),
  );
  for (const [name, method] of [
    ["add_testers_to_beta_group", "createToManyRelationship"],
    ["remove_testers_from_beta_group", "deleteToManyRelationship"],
  ]) {
    server.registerTool(
      name,
      {
        description: `${name.startsWith("add") ? "Add" : "Remove"} existing TestFlight testers ${name.startsWith("add") ? "to" : "from"} a group. Adding may send invitations.`,
        annotations: writeAnnotations,
        inputSchema: z.object({
          betaGroupId: id,
          betaTesterIds: z.array(id).min(1),
        }),
      },
      async ({ betaGroupId, betaTesterIds }) =>
        result(
          await call(
            `betaGroups_betaTesters_${method}`,
            { data: betaTesterIds.map((id) => ({ type: "betaTesters", id })) },
            betaGroupId,
          ),
        ),
    );
  }
  server.registerTool(
    "submit_beta_review",
    {
      description:
        "Submit a processed build for TestFlight external Beta App Review, after completing beta app description, review contacts and export compliance. This is separate from App Store review.",
      annotations: writeAnnotations,
      inputSchema: z.object({ buildId: id }),
    },
    async ({ buildId }) =>
      result(
        await call("betaAppReviewSubmissions_createInstance", {
          data: {
            type: "betaAppReviewSubmissions",
            relationships: { build: link("builds", buildId) },
          },
        }),
      ),
  );
  server.registerTool(
    "get_beta_review_status",
    {
      description: "Read TestFlight Beta App Review state for a build.",
      annotations: readAnnotations,
      inputSchema: z.object({ buildId: id }),
    },
    async ({ buildId }) =>
      result(
        await getCatalog().execute(
          client,
          {
            operationId: "betaAppReviewSubmissions_getCollection",
            query: { "filter[build]": buildId },
          },
          "read",
        ),
      ),
  );
  server.registerTool(
    "set_build_export_compliance",
    {
      description:
        "Declare whether a build uses non-exempt encryption. Use the app's actual export-compliance determination.",
      annotations: writeAnnotations,
      inputSchema: z.object({
        buildId: id,
        usesNonExemptEncryption: z.boolean(),
      }),
    },
    async ({ buildId, usesNonExemptEncryption }) =>
      result(
        await call(
          "builds_updateInstance",
          {
            data: {
              type: "builds",
              id: buildId,
              attributes: { usesNonExemptEncryption },
            },
          },
          buildId,
        ),
      ),
  );
  server.registerTool(
    "set_beta_build_localization",
    {
      description:
        "Create or update localized What to Test text for a TestFlight build. Supply localizationId to update an existing locale.",
      annotations: writeAnnotations,
      inputSchema: z.object({
        buildId: id,
        locale: z.string(),
        whatsNew: z.string(),
        localizationId: id.optional(),
      }),
    },
    async ({ buildId, locale, whatsNew, localizationId }) =>
      result(
        await call(
          localizationId
            ? "betaBuildLocalizations_updateInstance"
            : "betaBuildLocalizations_createInstance",
          {
            data: {
              type: "betaBuildLocalizations",
              ...(localizationId ? { id: localizationId } : {}),
              attributes: { ...(localizationId ? {} : { locale }), whatsNew },
              ...(!localizationId
                ? { relationships: { build: link("builds", buildId) } }
                : {}),
            },
          },
          localizationId,
        ),
      ),
  );
}
