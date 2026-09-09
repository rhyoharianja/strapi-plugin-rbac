import type { Core } from '@strapi/strapi';

import rules from './rules';

/** Annotated for declaration portability under pnpm (see docs/package-conventions.md). */
const services: Record<string, (context: { strapi: Core.Strapi }) => unknown> = {
  rules,
};

export default services;
