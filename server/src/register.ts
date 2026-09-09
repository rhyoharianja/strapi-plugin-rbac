import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import { PLUGIN_ID } from '../../shared/rbac';
import { decideWrite, stripUnreadableFields } from './services/enforcement';

/** Document-service actions that write, and therefore need checking. */
const WRITE_ACTIONS = new Set(['create', 'update']);

/** Actions that return documents, and therefore need read-stripping. */
const READ_ACTIONS = new Set(['findOne', 'findFirst', 'findMany']);

/**
 * Raised when a write violates a field rule or a fact-field lock.
 *
 * `PolicyError`, not `ForbiddenError` — and the difference is the whole reason an editor can
 * read why they were stopped.
 *
 * Strapi's `createAuthorizeMiddleware` wraps every downstream handler and catches any
 * `ForbiddenError` on its way out, replacing it with a bare `ctx.forbidden()`: status 403,
 * message `"Forbidden"`, no detail. Its own comment names the single exception —
 * *"allow PolicyError as an exception to throw a publicly visible message in the API"* — and
 * `PolicyError` extends `ForbiddenError`, so the status is unchanged while the message
 * survives. See docs/package-conventions.md.
 */
const forbidden = (message: string): Error =>
  new errors.PolicyError(message, { plugin: PLUGIN_ID, reason: message });

/**
 * Enforce field-level RBAC through a document-service middleware.
 *
 * This is the correct intercept point in Strapi 5: **every** path that touches content —
 * REST, GraphQL, the Content Manager, another plugin's service call — goes through the
 * Document Service, whereas a route policy would only cover the routes it is attached to
 * and leave the admin's own endpoints unguarded.
 *
 * Registered in `register()` so it is in place before anything can write.
 *
 * The middleware itself does no deciding: it gathers the acting user, the rules and the
 * entry's stage, then hands plain values to the pure functions in `enforcement.ts`. That
 * split is what makes the rules testable without booting Strapi — see the regression suite,
 * which must be re-run on every Strapi upgrade because this hooks into core behaviour.
 */
const register = ({ strapi }: { strapi: Core.Strapi }) => {
  const service = () => strapi.plugin(PLUGIN_ID).service('rules');

  strapi.documents.use(async (context, next) => {
    const uid = context.uid as string;

    // This plugin's own tables would otherwise guard themselves into a deadlock.
    if (uid.startsWith(`plugin::${PLUGIN_ID}`)) return next();

    const user = service().actingUser();

    // No person behind the write (cron, lifecycle, internal service): nothing to enforce.
    if (!user) return next();

    const { rules, factFields } = await service().load();

    if (WRITE_ACTIONS.has(context.action)) {
      const params = context.params as {
        data?: Record<string, unknown>;
        documentId?: string;
      };

      const documentId = params?.documentId;

      /*
       * Load the stored entry so only *changed* fields are judged. Re-saving a form that
       * merely displays a restricted field must not be rejected — otherwise a role that
       * cannot edit `rate` could never save anything on that content-type at all.
       */
      const current =
        context.action === 'update' && documentId
          ? ((await strapi
              .documents(uid as Parameters<Core.Strapi['documents']>[0])
              .findOne({ documentId })) as Record<string, unknown> | null)
          : null;

      const decision = decideWrite({
        user,
        uid,
        rules,
        factFields,
        stage: await service().stageOf(uid, documentId),
        payload: params?.data,
        current,
      });

      if (!decision.allowed) {
        strapi.log.info(
          `[${PLUGIN_ID}] denied ${context.action} on ${uid}${
            documentId ? `/${documentId}` : ''
          } for user ${user.id}: ${decision.reason}`
        );

        throw forbidden(decision.reason ?? 'Field not permitted');
      }

      return next();
    }

    const result = await next();

    if (READ_ACTIONS.has(context.action) && result) {
      if (Array.isArray(result)) {
        return result.map((entry) =>
          stripUnreadableFields(entry as Record<string, unknown>, { user, uid, rules })
        ) as typeof result;
      }

      return stripUnreadableFields(result as Record<string, unknown>, {
        user,
        uid,
        rules,
      }) as typeof result;
    }

    return result;
  });

  strapi.log.info(`[${PLUGIN_ID}] field-level enforcement active on the document service`);
};

export default register;
