import { getTranslation } from "./utils/getTranslation";
import { PLUGIN_ID } from "./pluginId";
import { Initializer } from "./components/Initializer";
import { PluginIcon } from "./components/PluginIcon";

import type { StrapiApp } from "@strapi/strapi/admin";

/**
 * Reading a role is enough to see either of these.
 *
 * Field rules are part of what a role means, so they belong behind the same permission —
 * `permissions: []` would have shown them to every authenticated user, including ones with
 * no business knowing how access is shaped.
 */
const CAN_READ_ROLES = [{ action: "admin::roles.read", subject: null }];

const plugin: StrapiApp["appPlugins"][string] = {
  register(app) {
    /*
     * Field rules live in **Settings** rather than in a top-level menu of their own. They
     * are not a separate feature: they are an extra dimension of a role.
     *
     * The section is `global`, and that is not a preference — it is the only section a
     * plugin can add to. `Router` initialises `_settings` with `global` alone, and the
     * `admin` section that holds Roles and Users comes from `SETTINGS_LINKS_CE`, a separate
     * constant the settings menu merges in later. Passing `"admin"` therefore throws
     * `Invariant Violation: The section does not exist` during `register()` — which blanks
     * the whole admin, because a plugin's `register` runs before anything renders. It is
     * also where every other plugin's settings page goes.
     *
     * `to` is relative to `/settings`: Strapi strips a leading slash or a `settings/`
     * prefix and warns, so stating it correctly keeps the console quiet.
     */
    app.addSettingsLink("global", {
      id: PLUGIN_ID,
      to: PLUGIN_ID,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: "Field rules",
      },
      Component: () => import("./pages/App"),
      permissions: CAN_READ_ROLES,
    });

    /*
     * Roles, promoted to the sidebar.
     *
     * A link with no `Component` navigates to a route that already exists — Strapi's own
     * `/settings/roles` page — so this moves where Roles is *reached from* without
     * reimplementing it.
     *
     * It cannot be *removed* from Settings: `addSettingsLink` only adds, and there is no
     * public way to take an entry out of Strapi's own settings menu. So Roles is reachable
     * from both places, and the sidebar is simply the shorter path.
     */
    app.addMenuLink({
      to: "settings/roles",
      icon: PluginIcon,
      intlLabel: {
        id: `${PLUGIN_ID}.roles.link`,
        defaultMessage: "Roles",
      },
      permissions: CAN_READ_ROLES,
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  registerTrads({ locales }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = (await import(
            `./translations/${locale}.json`
          )) as {
            default: Record<string, string>;
          };

          const newData: Record<string, string> = {};
          const keys = Object.keys(data);

          for (const key of keys) {
            newData[getTranslation(key)] = data[key];
          }

          return { data: newData, locale };
        } catch {
          return { data: {}, locale };
        }
      }),
    );
  },
};

export default plugin;