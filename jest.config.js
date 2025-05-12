module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": "ts-jest", // Transform TypeScript files using ts-jest
  },
  extensionsToTreatAsEsm: [".ts"], // Treat .ts files as ES modules
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'], // Setup file to run after test environment is set up
  testTimeout: 10000, // Increase test timeout to ensure cleanup can complete
  detectOpenHandles: true, // Help identify open handles that are keeping the test runner from exiting
};
