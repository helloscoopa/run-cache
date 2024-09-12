export default {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": "ts-jest", // Transform TypeScript files using ts-jest
  },
  extensionsToTreatAsEsm: [".ts"], // Treat .ts files as ES modules
};
