import type { Core } from '@strapi/strapi';

import settings from './settings';

/** Annotated for declaration portability under pnpm (see docs/package-conventions.md). */
const controllers: Record<string, (context: { strapi: Core.Strapi }) => unknown> = {
  settings,
};

export default controllers;
