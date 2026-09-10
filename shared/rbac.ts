/** Contract shared by this plugin's server and admin bundles. */

export const PLUGIN_ID = 'rbac' as const;

export const UID = {
  fieldRule: 'plugin::rbac.field-rule',
  factField: 'plugin::rbac.fact-field',
} as const;

// ── The RBAC vocabulary ─────────────────────────────────────────────────────────────────────
//
// This used to live in a separate `shared-utils` package. It moved here because this is the
// plugin that owns field-level access control: of the nine symbols that package exported, eight
// had exactly one consumer, so it was not shared code — it was one plugin's code kept somewhere
// else, at the cost of a published package every consumer had to resolve.
//
// The one genuine cross-plugin need was the collab plugin asking "may this user write this
// field?". That is answered by calling this plugin's `rules` service, not by sharing a function
// — which also removes the risk of the two drifting apart and disagreeing.

/** Operations a field-level rule can govern. */
export const FIELD_OPERATIONS = ['read', 'write'] as const;
export type FieldOperation = (typeof FIELD_OPERATIONS)[number];

/**
 * One field-level permission rule: role × content-type × field × operation.
 *
 * Stored as data so it stays editable from the admin UI.
 */
export interface FieldRule {
  role: string;
  uid: string;
  /** Field path; `*` matches every field of the content-type. */
  field: string;
  operation: FieldOperation;
  allow: boolean;
}

/** Minimal shape of the acting user that the rules need. */
export interface ActingUser {
  id: number;
  /** Admin role codes, e.g. `strapi-super-admin`. */
  roles: string[];
}

/** Role code that may edit fact-fields even after approval. */
export const CONTENT_AUTHORITY_ROLE = 'content-authority';
export const SUPER_ADMIN_ROLE = 'strapi-super-admin';

export const hasRole = (user: ActingUser | null | undefined, role: string): boolean =>
  Boolean(user?.roles.includes(role));

export const isSuperAdmin = (user: ActingUser | null | undefined): boolean =>
  hasRole(user, SUPER_ADMIN_ROLE);

export const isContentAuthority = (user: ActingUser | null | undefined): boolean =>
  hasRole(user, CONTENT_AUTHORITY_ROLE) || isSuperAdmin(user);

/**
 * Decide whether a user may perform `operation` on `field`.
 *
 * Rules are matched most-specific first: an exact field rule beats a `*` rule, and a matching
 * rule's `allow` flag is final. **With no matching rule the field is allowed** — the platform
 * stays permissive by default and is tightened rule by rule. The opposite default reads safer
 * but makes a fresh install unusable, and an unusable install gets its RBAC switched off
 * wholesale.
 */
export const canAccessField = (
  rules: readonly FieldRule[],
  user: ActingUser | null | undefined,
  uid: string,
  field: string,
  operation: FieldOperation
): boolean => {
  if (isSuperAdmin(user)) return true;

  const roles = user?.roles ?? [];
  const candidates = rules.filter(
    (rule) =>
      rule.uid === uid &&
      rule.operation === operation &&
      roles.includes(rule.role) &&
      (rule.field === field || rule.field === '*')
  );

  if (candidates.length === 0) return true;

  const exact = candidates.find((rule) => rule.field === field);

  return (exact ?? candidates[0]!).allow;
};

/** The subset of `fields` the user is NOT allowed to touch. */
export const deniedFields = (
  rules: readonly FieldRule[],
  user: ActingUser | null | undefined,
  uid: string,
  fields: readonly string[],
  operation: FieldOperation
): string[] => fields.filter((field) => !canAccessField(rules, user, uid, field, operation));

// ── Value comparison ────────────────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Structural equality, good enough for comparing content-field values. */
export const isEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => isEqual(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => isEqual(a[key], b[key]));
  }
  return false;
};

/**
 * Fields whose value differs between two versions of an entry.
 *
 * Only changed fields are judged: re-saving a form that merely *displays* a restricted field
 * must not be refused, or a role that cannot edit one field could never save that content-type
 * at all.
 */
export const changedFields = (
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): string[] => {
  const previous = before ?? {};
  const next = after ?? {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  return [...keys].filter((key) => !isEqual(previous[key], next[key]));
};

// ── Admin/server DTOs ───────────────────────────────────────────────────────────────────────

export interface FieldRuleDTO extends FieldRule {
  id: number;
  documentId: string;
  /** Human-readable role name, for the settings table. */
  roleName: string;
  roleId: number;
}

/** A field frozen once its entry reaches the locking stage. */
export interface FactFieldDTO {
  id: number;
  documentId: string;
  uid: string;
  field: string;
  /** Stage at which the field freezes. Defaults to `Approved`. */
  lockedFromStage: string;
}

export interface ContentTypeInfo {
  uid: string;
  displayName: string;
  fields: string[];
}

export interface RoleOption {
  id: number;
  code: string;
  name: string;
}

/** Everything the settings page needs in one round trip. */
export interface SettingsPayload {
  rules: FieldRuleDTO[];
  factFields: FactFieldDTO[];
  roles: RoleOption[];
  contentTypes: ContentTypeInfo[];
  /** Role code allowed to edit fact-fields after they lock. */
  contentAuthorityRole: string;
}

export const DEFAULT_LOCK_STAGE = 'Approved';
