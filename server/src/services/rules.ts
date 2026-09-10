import type { Core } from '@strapi/strapi';
import {
  CONTENT_AUTHORITY_ROLE,
  deniedFields,
  type ActingUser,
  type FieldOperation,
  type FieldRule,
} from '../../../shared/rbac';

import {
  DEFAULT_LOCK_STAGE,
  UID,
  type ContentTypeInfo,
  type FactFieldDTO,
  type FieldRuleDTO,
  type RoleOption,
} from '../../../shared/rbac';
import type { FactField } from './enforcement';
import { documents, type DocumentRow } from '../utils/documents';

/**
 * Loads the rules, the acting user and the entry's stage — everything Strapi-shaped that
 * the pure enforcement functions need handed to them.
 *
 * Rules are cached in memory and invalidated on write. The middleware runs on *every*
 * document operation, so re-querying two tables per write would tax the whole application
 * for data that changes a few times a month.
 */
const rules = ({ strapi }: { strapi: Core.Strapi }) => {
  let cache: { rules: FieldRule[]; factFields: FactField[] } | null = null;

  const load = async (): Promise<{ rules: FieldRule[]; factFields: FactField[] }> => {
    if (cache) return cache;

    const ruleRows = await documents(strapi, UID.fieldRule).findMany({ populate: ['role'] });
    const factRows = await documents(strapi, UID.factField).findMany();

    cache = {
      rules: ruleRows
        // A rule whose role was deleted can no longer match anyone; dropping it is clearer
        // than leaving a rule that silently applies to nobody.
        .filter((row) => Boolean(row.role?.code))
        .map((row) => ({
          role: row.role.code as string,
          uid: row.uid,
          field: row.field,
          operation: row.operation,
          allow: row.allow ?? false,
        })),
      factFields: factRows.map((row) => ({
        uid: row.uid,
        field: row.field,
        lockedFromStage: row.lockedFromStage || DEFAULT_LOCK_STAGE,
      })),
    };

    return cache;
  };

  return {
    load,

    invalidate(): void {
      cache = null;
    },

    /**
     * Which of `fields` this user may not touch.
     *
     * The public form of the question, for other plugins. The collab plugin asks it to decide
     * whether a live editing session joins read-only, and it must get the *same* answer the
     * document-service middleware will give on save — otherwise an editor types into a field
     * whose write is then refused, and the work disappears with nothing to explain why.
     *
     * Exposed as a service rather than a shared helper so there is exactly one implementation.
     */
    async deniedFieldsFor(
      user: ActingUser | null | undefined,
      uid: string,
      fields: readonly string[],
      operation: FieldOperation = 'write'
    ): Promise<string[]> {
      const { rules } = await load();

      return deniedFields(rules, user, uid, fields, operation);
    },

    /**
     * The admin user behind the current request, or null.
     *
     * `requestContext` is an AsyncLocalStorage store, so it is empty when the write came
     * from a cron job, a lifecycle or an internal service call. Null therefore means
     * "no person did this", which the enforcement treats as system-level.
     */
    actingUser(): ActingUser | null {
      const ctx = strapi.requestContext.get();
      const user = ctx?.state?.user as
        | { id: number; roles?: Array<{ code: string }> }
        | undefined;

      if (!user?.id) return null;

      return {
        id: user.id,
        roles: (user.roles ?? []).map((role) => role.code),
      };
    },

    /**
     * Current workflow stage of an entry, or null when nothing governs it.
     *
     * Read through the workflow plugin's public service rather than its tables, and the
     * dependency is optional: field rules still work without the workflow plugin, only the
     * fact-field lock needs it.
     */
    async stageOf(uid: string, documentId: string | undefined): Promise<string | null> {
      if (!documentId) return null;

      const workflow = strapi.plugin('workflow');
      if (!workflow) return null;

      try {
        return await workflow.service('transition').currentStageName(uid, documentId);
      } catch (error) {
        // A stage lookup failure must not block the write it was only annotating.
        strapi.log.warn(
          `[rbac] stage lookup failed for ${uid}/${documentId}: ${
            (error as Error).message
          }`
        );
        return null;
      }
    },

    /* --------------------------------------------------------------- settings CRUD */

    async listRules(): Promise<FieldRuleDTO[]> {
      const rows = await documents(strapi, UID.fieldRule).findMany({ populate: ['role'] });

      return rows.map((row: DocumentRow) => ({
        id: row.id,
        documentId: row.documentId,
        role: row.role?.code ?? '',
        roleName: row.role?.name ?? 'unknown role',
        roleId: row.role?.id ?? 0,
        uid: row.uid,
        field: row.field,
        operation: row.operation,
        allow: row.allow ?? false,
      }));
    },

    async listFactFields(): Promise<FactFieldDTO[]> {
      const rows = await documents(strapi, UID.factField).findMany();

      return rows.map((row: DocumentRow) => ({
        id: row.id,
        documentId: row.documentId,
        uid: row.uid,
        field: row.field,
        lockedFromStage: row.lockedFromStage || DEFAULT_LOCK_STAGE,
      }));
    },

    async listRoles(): Promise<RoleOption[]> {
      const roles = await strapi.db.query('admin::role').findMany();
      return roles.map((role: { id: number; code: string; name: string }) => ({
        id: role.id,
        code: role.code,
        name: role.name,
      }));
    },

    /** Content-types and their writable field names, for the settings pickers. */
    listContentTypes(): ContentTypeInfo[] {
      return Object.values(strapi.contentTypes)
        .filter((contentType) => contentType.uid.startsWith('api::'))
        .map((contentType) => ({
          uid: contentType.uid,
          displayName: contentType.info?.displayName ?? contentType.uid,
          fields: Object.keys(contentType.attributes ?? {}).sort(),
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },

    contentAuthorityRole: CONTENT_AUTHORITY_ROLE,
  };
};

export default rules;
