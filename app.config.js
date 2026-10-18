// app.json is the base. Over-the-air updates (expo-updates) are switched on only where they are
// needed: EAS builders, CI (EAS Update) and the local Docker build set one of these variables.
// The local dev server (web) stays without them: the fingerprint runtime version made it hang.
const UPDATES_URL = 'https://u.expo.dev/8a17cd65-5196-4180-afc7-fc70847de542';

module.exports = ({ config }) => {
  const ota = process.env.EAS_BUILD || process.env.CI || process.env.FFT_UPDATES;
  if (!ota) return config;
  return {
    ...config,
    runtimeVersion: { policy: 'fingerprint' },
    updates: {
      url: UPDATES_URL,
      // Installed apps take only updates signed with the private key that matches this certificate
      // (DECISIONS 87). The key is never in the repository: CI gets it from a secret.
      codeSigningCertificate: './certs/certificate.pem',
      codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
    },
  };
};
