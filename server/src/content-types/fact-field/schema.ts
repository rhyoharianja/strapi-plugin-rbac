/**
 * A fact-field: a value that freezes once its entry reaches a given stage.
 *
 * Rates, dates and disclaimers are signed off at approval; changing one afterwards without
 * going back through review is precisely the failure this exists to prevent. Independent of
 * the role rules, because a field can be freely editable *and* frozen after approval.
 */
export default {
  kind: 'collectionType',
  collectionName: 'content_hub_fact_fields',
  info: {
    singularName: 'fact-field',
    pluralName: 'fact-fields',
    displayName: 'Fact Field',
    description: 'A field locked once its entry reaches a workflow stage',
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
    uid: { type: 'string', required: true, maxLength: 200 },
    field: { type: 'string', required: true, maxLength: 120 },
    /** Stage name at which the field locks. Matches a stage in the workflow plugin. */
    lockedFromStage: { type: 'string', required: true, default: 'Approved', maxLength: 60 },
  },
};
