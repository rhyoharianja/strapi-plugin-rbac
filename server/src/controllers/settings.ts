import type { Core } from '@strapi/strapi';

import { PLUGIN_ID, UID, type SettingsPayload } from '../../../shared/rbac';
import { documents } from '../utils/documents';

/**
 * CRUD for the rules, driving the settings page.
 *
 * Every write invalidates the in-memory cache the middleware reads, so a rule takes effect
 * on the very next request rather than after a restart.
 */
const controller = ({ strapi }: { strapi: Core.Strapi }) => {
  const service = () => strapi.plugin(PLUGIN_ID).service('rules');

  return {
    async settings(ctx): Promise<void> {
      const [rules, factFields, roles] = await Promise.all([
        service().listRules(),
        service().listFactFields(),
        service().listRoles(),
      ]);

      const payload: SettingsPayload = {
        rules,
        factFields,
        roles,
        contentTypes: service().listContentTypes(),
        contentAuthorityRole: service().contentAuthorityRole,
      };

      ctx.body = { data: payload };
    },

    async createRule(ctx): Promise<void> {
      const { role, uid, field, operation, allow } = ctx.request.body ?? {};

      if (!role || !uid || !field) {
        return ctx.badRequest('role, uid and field are required');
      }

      await documents(strapi, UID.fieldRule).create({
        data: { role, uid, field, operation: operation ?? 'write', allow: allow ?? false },
      });

      service().invalidate();
      ctx.body = { data: await service().listRules() };
    },

    async deleteRule(ctx): Promise<void> {
      await documents(strapi, UID.fieldRule).delete({ documentId: ctx.params.documentId });
      service().invalidate();
      ctx.body = { data: await service().listRules() };
    },

    async createFactField(ctx): Promise<void> {
      const { uid, field, lockedFromStage } = ctx.request.body ?? {};

      if (!uid || !field) return ctx.badRequest('uid and field are required');

      await documents(strapi, UID.factField).create({
        data: { uid, field, lockedFromStage: lockedFromStage || 'Approved' },
      });

      service().invalidate();
      ctx.body = { data: await service().listFactFields() };
    },

    async deleteFactField(ctx): Promise<void> {
      await documents(strapi, UID.factField).delete({ documentId: ctx.params.documentId });
      service().invalidate();
      ctx.body = { data: await service().listFactFields() };
    },
  };
};

export default controller;
