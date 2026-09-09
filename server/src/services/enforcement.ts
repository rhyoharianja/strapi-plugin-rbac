import {
  CONTENT_AUTHORITY_ROLE,
  changedFields,
  deniedFields,
  isSuperAdmin,
  type ActingUser,
  type FieldRule,
} from '../../../shared/rbac';

/**
 * The enforcement decision, as pure functions.
 *
 * Deliberately free of any Strapi import: this is the part that must keep behaving after a
 * Strapi upgrade, and the only way to assert that cheaply is to test it in isolation.
 * Everything Strapi-shaped — reading the acting user, loading rules, looking up the stage —
 * happens in the middleware, which passes plain values in here.
 *
 * See `enforcement.test.ts`. Those tests are the regression suite the plugin README says
 * must be re-run on every Strapi upgrade.
 */

/** A field frozen once its entry reaches `lockedFromStage`. */
export interface FactField {
  uid: string;
  field: string;
  lockedFromStage: string;
}

export interface WriteDecision {
  allowed: boolean;
  /** Fields the role may not write. */
  deniedByRole: string[];
  /** Fact-fields frozen by the entry's current stage. */
  lockedByStage: string[];
  reason?: string;
}

const list = (fields: string[]): string => fields.join(', ');

/**
 * Which fields is this write actually touching?
 *
 * Only fields whose value differs from what is stored, so re-saving an unchanged entry
 * never trips a rule the editor did not violate. On create there is nothing stored, so
 * every supplied field counts.
 */
export const fieldsBeingWritten = (
  payload: Record<string, unknown> | null | undefined,
  current: Record<string, unknown> | null | undefined
): string[] => {
  if (!payload) return [];
  if (!current) return Object.keys(payload);

  // Compare only the keys the payload carries: a partial update must not be judged on
  // fields it never mentioned.
  const touched = Object.keys(payload);
  const before = Object.fromEntries(touched.map((key) => [key, current[key]]));

  return changedFields(before, payload);
};

/**
 * Fact-fields locked for this entry right now.
 *
 * A fact-field freezes when the entry reaches its `lockedFromStage` — the point past which
 * a rate, a date or a disclaimer has been signed off and changing it silently is exactly
 * the failure this plugin exists to prevent.
 */
export const lockedFactFields = (
  factFields: readonly FactField[],
  uid: string,
  stage: string | null,
  fields: readonly string[]
): string[] => {
  if (!stage) return [];

  const locked = new Set(
    factFields
      .filter((factField) => factField.uid === uid && factField.lockedFromStage === stage)
      .map((factField) => factField.field)
  );

  return fields.filter((field) => locked.has(field));
};

/**
 * May this user perform this write?
 *
 * Two independent gates, reported separately so the message tells an editor which one they
 * hit — "you may not edit this field" and "this field is frozen until it leaves Approved"
 * call for very different next steps.
 */
export const decideWrite = (params: {
  user: ActingUser | null;
  uid: string;
  rules: readonly FieldRule[];
  factFields: readonly FactField[];
  stage: string | null;
  payload: Record<string, unknown> | null | undefined;
  current?: Record<string, unknown> | null;
}): WriteDecision => {
  const { user, uid, rules, factFields, stage, payload, current } = params;

  /*
   * No acting user means no HTTP request behind this write: a cron flow, a lifecycle, an
   * internal service call. Automation is not a role and must not be blocked by rules
   * written for people — a scheduled take-down that could not set a locked field would be
   * a far worse failure than the one being prevented.
   */
  if (!user) {
    return { allowed: true, deniedByRole: [], lockedByStage: [] };
  }

  if (isSuperAdmin(user)) {
    return { allowed: true, deniedByRole: [], lockedByStage: [] };
  }

  const touched = fieldsBeingWritten(payload, current);

  if (touched.length === 0) {
    return { allowed: true, deniedByRole: [], lockedByStage: [] };
  }

  const deniedByRole = deniedFields(rules, user, uid as never, touched, 'write');

  // The Content Authority is the role that owns facts; the lock does not apply to it.
  const canEditFacts = user.roles.includes(CONTENT_AUTHORITY_ROLE);
  const lockedByStage = canEditFacts ? [] : lockedFactFields(factFields, uid, stage, touched);

  if (deniedByRole.length === 0 && lockedByStage.length === 0) {
    return { allowed: true, deniedByRole: [], lockedByStage: [] };
  }

  const roles = user.roles.join(', ') || 'none';
  const reasons: string[] = [];

  if (deniedByRole.length > 0) {
    reasons.push(`role(s) [${roles}] may not write ${list(deniedByRole)}`);
  }

  if (lockedByStage.length > 0) {
    reasons.push(
      `${list(lockedByStage)} ${lockedByStage.length === 1 ? 'is a fact-field' : 'are fact-fields'} ` +
        `locked at stage "${stage}" — only the ${CONTENT_AUTHORITY_ROLE} role may change ${
          lockedByStage.length === 1 ? 'it' : 'them'
        }`
    );
  }

  return {
    allowed: false,
    deniedByRole,
    lockedByStage,
    reason: reasons.join('; '),
  };
};

/**
 * Remove fields this user may not read.
 *
 * Reads are stripped rather than rejected: refusing the whole document because one field is
 * restricted would make a list view unusable, and the caller asked for what they can see.
 * Writes are rejected instead, because silently dropping a field an editor typed would let
 * them believe a change was saved when it was not.
 */
export const stripUnreadableFields = <T extends Record<string, unknown>>(
  entry: T,
  params: {
    user: ActingUser | null;
    uid: string;
    rules: readonly FieldRule[];
  }
): T => {
  const { user, uid, rules } = params;

  if (!user || isSuperAdmin(user)) return entry;

  const denied = deniedFields(rules, user, uid as never, Object.keys(entry), 'read');

  if (denied.length === 0) return entry;

  const dropped = new Set(denied);

  return Object.fromEntries(
    Object.entries(entry).filter(([key]) => !dropped.has(key))
  ) as T;
};
