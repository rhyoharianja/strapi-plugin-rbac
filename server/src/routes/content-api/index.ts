/**
 * No public routes: exposing who may edit which field would hand an attacker the map of
 * the permission model. Enforcement happens in the document-service middleware, which
 * already covers every public path.
 */
export default () => ({
  type: 'content-api',
  routes: [],
});
