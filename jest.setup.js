jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-crypto', () => ({
  randomUUID: () => require('crypto').randomUUID(),
  digestStringAsync: async (_algo, text) =>
    require('crypto').createHash('sha256').update(text).digest('hex'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytes: (n) => new Uint8Array(require('crypto').randomBytes(n)),
}));
