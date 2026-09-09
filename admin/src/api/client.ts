import { getFetchClient, isFetchError } from "@strapi/strapi/admin";

import type { FactFieldDTO, FieldRuleDTO, SettingsPayload } from "../../../shared/rbac";
import { PLUGIN_ID } from "../pluginId";

/** Strapi's own fetch client — see docs/package-conventions.md on admin auth. */
const client = () => getFetchClient();

const message = (error: unknown): string => {
  if (isFetchError(error)) {
    const payload = error.response?.data as { error?: { message?: string } } | undefined;
    return payload?.error?.message ?? error.message;
  }
  return (error as Error).message;
};

const unwrap = async <T>(request: Promise<{ data: { data?: T } }>): Promise<T> => {
  try {
    const { data } = await request;
    return data.data as T;
  } catch (error) {
    throw new Error(message(error));
  }
};

const base = `/${PLUGIN_ID}`;

export const api = {
  settings: () => unwrap<SettingsPayload>(client().get(`${base}/settings`)),

  createRule: (body: {
    role: number;
    uid: string;
    field: string;
    operation: "read" | "write";
    allow: boolean;
  }) => unwrap<FieldRuleDTO[]>(client().post(`${base}/rules`, body)),

  deleteRule: (documentId: string) =>
    unwrap<FieldRuleDTO[]>(client().del(`${base}/rules/${documentId}`)),

  createFactField: (body: { uid: string; field: string; lockedFromStage: string }) =>
    unwrap<FactFieldDTO[]>(client().post(`${base}/fact-fields`, body)),

  deleteFactField: (documentId: string) =>
    unwrap<FactFieldDTO[]>(client().del(`${base}/fact-fields/${documentId}`)),
};
