/**
 * One field-level permission: role × content-type × field × operation.
 *
 * Stored as data so the rules are editable from the GUI without a deploy — which is the
 * whole point, since who may touch which field changes far more often than code does.
 */
export default {
  kind: 'collectionType',
  collectionName: 'content_hub_field_rules',
  info: {
    singularName: 'field-rule',
    pluralName: 'field-rules',
    displayName: 'Field Rule',
    description: 'Field-level permission for one role on one content-type',
  },
  options: { draftAndPublish: false },
  pluginOptions: {
    /*
     * Hidden from the Content Manager on purpose.
     *
     * The Content Manager is where people edit *content*; this is platform configuration
     * (or a log) that belongs to this plugin's own admin section. Leaving it in the
     * collection-type list buries Article and Page among a dozen internal tables.
     */
    'content-manager': { visible: false },
    'content-type-builder': { visible: false },
  },
  attributes: {
    role: {
      type: 'relation',
      relation: 'oneToOne',
      target: 'admin::role',
    },
    /** Content-type UID, e.g. `api::article.article`. */
    uid: { type: 'string', required: true, maxLength: 200 },
    /** Field name, or `*` for every field of the content-type. */
    field: { type: 'string', required: true, maxLength: 120 },
    operation: {
      type: 'enumeration',
      required: true,
      default: 'write',
      enum: ['read', 'write'],
    },
    /** `false` denies. Absence of any matching rule allows — see the README. */
    allow: { type: 'boolean', default: false },
  },
};
