jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Native module: the library ships plain-View stand-ins for tests.
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);

jest.mock('expo-crypto', () => ({
  randomUUID: () => require('crypto').randomUUID(),
  digestStringAsync: async (_algo, text) =>
    require('crypto').createHash('sha256').update(text).digest('hex'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytes: (n) => new Uint8Array(require('crypto').randomBytes(n)),
}));

// Animations and gestures (tab pager, exercise swipe, Today edit mode): the libraries' own mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
require('react-native-gesture-handler/jestSetup');
