module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'airbnb-base',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
  },
  plugins: [
    '@typescript-eslint',
  ],
  rules: {
    "max-len": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'max-classes-per-file': 'off',
    'class-methods-use-this': 'off',
    'no-restricted-syntax': ['error', 'WithStatement'],
    'no-underscore-dangle': 'off',
    'no-continue': 'off',
    'no-plusplus': 'off',
    'no-param-reassign': 'off',
    'no-await-in-loop': 'off',
    'import/prefer-default-export': 'off',
    'global-require': 'off',
    'no-redeclare': 'off',
    '@typescript-eslint/no-redeclare': ['error'],
  },
};
