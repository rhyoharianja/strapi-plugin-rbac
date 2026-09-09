export default () => ({
  type: 'admin',
  routes: [
    { method: 'GET', path: '/settings', handler: 'settings.settings', config: { policies: [] } },
    { method: 'POST', path: '/rules', handler: 'settings.createRule', config: { policies: [] } },
    {
      method: 'DELETE',
      path: '/rules/:documentId',
      handler: 'settings.deleteRule',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/fact-fields',
      handler: 'settings.createFactField',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/fact-fields/:documentId',
      handler: 'settings.deleteFactField',
      config: { policies: [] },
    },
  ],
});
