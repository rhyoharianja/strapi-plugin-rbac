import { describe, expect, it } from 'vitest';

import type { FieldRule } from '../../../shared/rbac';

import {
  decideWrite,
  fieldsBeingWritten,
  lockedFactFields,
  stripUnreadableFields,
  type FactField,
} from './enforcement';

/**
 * Regression suite for field-level enforcement.
 *
 * **Re-run this on every Strapi upgrade.** The plugin intercepts the Document Service, so a
 * change to how Strapi shapes a payload, reports the acting user, or orders its middlewares
 * can quietly weaken these rules without anything failing loudly. These tests pin the
 * decisions themselves; the boundary they depend on is documented in the README.
 */

const UID = 'api::article.article';

const superAdmin = { id: 1, roles: ['strapi-super-admin'] };
const editor = { id: 2, roles: ['strapi-editor'] };
const authority = { id: 3, roles: ['strapi-editor', 'content-authority'] };

const noRateWrites: FieldRule[] = [
  { role: 'strapi-editor', uid: UID, field: 'rate', operation: 'write', allow: false },
];

const noRateReads: FieldRule[] = [
  { role: 'strapi-editor', uid: UID, field: 'rate', operation: 'read', allow: false },
];

const factFields: FactField[] = [
  { uid: UID, field: 'rate', lockedFromStage: 'Approved' },
  { uid: UID, field: 'disclaimer', lockedFromStage: 'Approved' },
];

const write = (over: Partial<Parameters<typeof decideWrite>[0]> = {}) =>
  decideWrite({
    user: editor,
    uid: UID,
    rules: noRateWrites,
    factFields,
    stage: null,
    payload: {},
    current: null,
    ...over,
  });

describe('fieldsBeingWritten', () => {
  it('reports every field on create, where nothing is stored yet', () => {
    expect(fieldsBeingWritten({ title: 'a', rate: 1 }, null)).toEqual(['title', 'rate']);
  });

  it('reports only fields whose value actually changed', () => {
    expect(fieldsBeingWritten({ title: 'b', rate: 1 }, { title: 'a', rate: 1 })).toEqual([
      'title',
    ]);
  });

  it('ignores stored fields the payload does not mention', () => {
    // A partial update must not be judged on fields it never sent.
    expect(fieldsBeingWritten({ title: 'a' }, { title: 'a', rate: 999 })).toEqual([]);
  });

  it('treats an empty payload as no write', () => {
    expect(fieldsBeingWritten(undefined, { title: 'a' })).toEqual([]);
  });
});

describe('role rules', () => {
  it('denies a field the role may not write', () => {
    const decision = write({ payload: { rate: 5 } });

    expect(decision.allowed).toBe(false);
    expect(decision.deniedByRole).toEqual(['rate']);
    expect(decision.reason).toContain('may not write rate');
  });

  it('allows a field no rule mentions', () => {
    expect(write({ payload: { title: 'new' } }).allowed).toBe(true);
  });

  it('allows re-saving a restricted field at its stored value', () => {
    // Otherwise a role that cannot edit `rate` could never save that content-type at all.
    expect(write({ payload: { rate: 5, title: 'b' }, current: { rate: 5, title: 'a' } }).allowed).toBe(
      true
    );
  });

  it('does not apply a rule written for another content-type', () => {
    expect(write({ uid: 'api::promo.promo', payload: { rate: 5 } }).allowed).toBe(true);
  });

  it('does not apply a rule written for another role', () => {
    expect(write({ user: { id: 9, roles: ['strapi-author'] }, payload: { rate: 5 } }).allowed).toBe(
      true
    );
  });

  it('honours a wildcard rule', () => {
    const decision = write({
      rules: [{ role: 'strapi-editor', uid: UID, field: '*', operation: 'write', allow: false }],
      payload: { title: 'x' },
    });

    expect(decision.allowed).toBe(false);
  });

  it('lets an exact rule override a wildcard', () => {
    const decision = write({
      rules: [
        { role: 'strapi-editor', uid: UID, field: '*', operation: 'write', allow: false },
        { role: 'strapi-editor', uid: UID, field: 'title', operation: 'write', allow: true },
      ],
      payload: { title: 'x' },
    });

    expect(decision.allowed).toBe(true);
  });

  it('does not let a read rule block a write', () => {
    expect(write({ rules: noRateReads, payload: { rate: 5 } }).allowed).toBe(true);
  });

  it('lets a super admin through', () => {
    expect(write({ user: superAdmin, payload: { rate: 5 } }).allowed).toBe(true);
  });
});

describe('fact-field lock', () => {
  it('locks a fact-field once the entry reaches the locking stage', () => {
    const decision = write({
      rules: [],
      stage: 'Approved',
      payload: { rate: 9 },
      current: { rate: 5 },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.lockedByStage).toEqual(['rate']);
    expect(decision.reason).toContain('content-authority');
  });

  it('leaves the field editable before that stage', () => {
    expect(
      write({ rules: [], stage: 'In review', payload: { rate: 9 }, current: { rate: 5 } }).allowed
    ).toBe(true);
  });

  it('leaves non-fact fields editable at the locking stage', () => {
    expect(
      write({ rules: [], stage: 'Approved', payload: { title: 'b' }, current: { title: 'a' } })
        .allowed
    ).toBe(true);
  });

  it('lets the Content Authority change a locked fact-field', () => {
    expect(
      write({
        user: authority,
        rules: [],
        stage: 'Approved',
        payload: { rate: 9 },
        current: { rate: 5 },
      }).allowed
    ).toBe(true);
  });

  it('does not lock anything when no workflow governs the entry', () => {
    expect(
      write({ rules: [], stage: null, payload: { rate: 9 }, current: { rate: 5 } }).allowed
    ).toBe(true);
  });

  it('reports both gates when a write trips each of them', () => {
    const decision = write({
      stage: 'Approved',
      payload: { rate: 9, disclaimer: 'new' },
      current: { rate: 5, disclaimer: 'old' },
    });

    expect(decision.deniedByRole).toEqual(['rate']);
    expect(decision.lockedByStage).toEqual(['rate', 'disclaimer']);
    expect(decision.reason).toContain('may not write');
    expect(decision.reason).toContain('locked at stage');
  });
});

describe('system writes', () => {
  it('never blocks a write with no acting user', () => {
    // Cron, lifecycles and internal service calls: automation is not a role. A scheduled
    // take-down that could not set a locked field would be worse than the failure prevented.
    expect(
      write({ user: null, stage: 'Approved', payload: { rate: 9 }, current: { rate: 5 } }).allowed
    ).toBe(true);
  });
});

describe('lockedFactFields', () => {
  it('matches only the configured stage', () => {
    expect(lockedFactFields(factFields, UID, 'Approved', ['rate'])).toEqual(['rate']);
    expect(lockedFactFields(factFields, UID, 'Draft', ['rate'])).toEqual([]);
  });

  it('matches only the configured content-type', () => {
    expect(lockedFactFields(factFields, 'api::promo.promo', 'Approved', ['rate'])).toEqual([]);
  });
});

describe('read stripping', () => {
  it('removes a field the role may not read', () => {
    const entry = stripUnreadableFields(
      { title: 'a', rate: 5 },
      { user: editor, uid: UID, rules: noRateReads }
    );

    expect(entry).toEqual({ title: 'a' });
  });

  it('leaves the entry untouched for a super admin', () => {
    expect(
      stripUnreadableFields({ title: 'a', rate: 5 }, { user: superAdmin, uid: UID, rules: noRateReads })
    ).toEqual({ title: 'a', rate: 5 });
  });

  it('leaves the entry untouched when there is no acting user', () => {
    expect(
      stripUnreadableFields({ title: 'a', rate: 5 }, { user: null, uid: UID, rules: noRateReads })
    ).toEqual({ title: 'a', rate: 5 });
  });

  it('does not let a write rule hide a field from reads', () => {
    expect(
      stripUnreadableFields({ title: 'a', rate: 5 }, { user: editor, uid: UID, rules: noRateWrites })
    ).toEqual({ title: 'a', rate: 5 });
  });
});
