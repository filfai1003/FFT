// Lets the server import the app's pure TypeScript rules (src/domain: strength, nutrition safety,
// plan import) so the API and the in-app coach apply exactly the same logic. Node runs .ts files
// itself (type stripping); this only adds the ".ts" the app's extensionless imports leave out.
// Used with: node --import ./ts-resolve.mjs index.js
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier))
        return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
