/**
 * react-native stub bundled into the golden-session test (esbuild alias).
 * The real agent loop only needs Platform (web branch → in-memory keychain,
 * web confirm) and Alert (never triggered by the test flow).
 */
'use strict';
module.exports = {
  Platform: {
    OS: 'web',
    select: (obj) => (obj && typeof obj === 'object' ? obj.web ?? obj.default : undefined),
  },
  Alert: { alert: () => {} },
  StyleSheet: {
    create: (s) => s,
    hairlineWidth: 1,
    flatten: (s) => s,
  },
  __esModule: true,
};
