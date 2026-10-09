const { SourceSkips } = require('@expo/fingerprint');

// What decides whether an installed app can take an over-the-air update (the "fingerprint"): only
// the native side. Build profiles (eas.json) and npm scripts do not change what runs on the phone.
module.exports = {
  ignorePaths: ['eas.json'],
  sourceSkips: SourceSkips.PackageJsonScriptsAll,
};
