# Contributing to RunCache

Thank you for your interest in contributing to RunCache! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please read it before contributing.

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- Git

### Setting Up the Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/run-cache.git
   cd run-cache
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Set up pre-commit hooks:
   ```bash
   npm run prepare
   ```
5. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Tests

We use Jest for testing. Run the full test suite:

```bash
npm test
```

Run tests in watch mode during development:

```bash
npm run test:watch
```

Run tests with coverage:

```bash
npm run test:coverage
```

### Linting

We use ESLint and Prettier for code quality:

```bash
npm run lint        # Check for issues
npm run lint:fix    # Fix issues automatically
npm run format      # Format code with Prettier
```

### Building the Library

Build the library:

```bash
npm run build
```

### Running Examples

The project includes example applications in the `examples` directory. You can run them to test your changes:

```bash
# Run the browser example
cd examples/browser
npm install
npm start

# Run the Node.js example
cd examples/node
npm install
npm start
```

## Making Changes

### Coding Standards

- Follow the existing code style
- Write clean, readable, and maintainable code
- Include comments where necessary
- Update documentation for any changed functionality
- Add tests for new features or bug fixes

### Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages:

```
type(scope): short description

longer description if needed
```

Types include:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Changes that don't affect code functionality (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Changes to build process, tooling, etc.

Examples:
```
feat(api): add support for custom serialization
fix(storage): resolve issue with localStorage persistence
docs(readme): update installation instructions
```

### Pull Request Process

1. **Before submitting a PR**:
   - Update your fork with the latest changes from the main repository
   - Ensure all tests pass
   - Make sure your code follows our coding standards
   - Add/update tests for your changes
   - Update documentation as needed

2. **Submit your PR**:
   - Fill out the PR template
   - Link any relevant issues
   - Provide a clear description of the changes and their purpose
   - Include screenshots or examples if applicable

3. **Code Review Process**:
   - A maintainer will review your PR
   - Address any feedback or changes requested
   - Once approved, a maintainer will merge your PR

### Dependency Management

- Avoid adding new dependencies unless absolutely necessary
- If you need to add a dependency, explain why in your PR description
- Prefer smaller, focused packages over large frameworks

## Types of Contributions

### Bug Fixes

Bug fixes are always welcome! If you find a bug:

1. Check if it's already reported in the Issues tab
2. If not, create a new issue with steps to reproduce
3. If you want to fix it yourself, mention that in the issue and submit a PR

### Features

For new features:

1. First open an issue describing the feature and its benefits
2. Wait for discussion and approval from maintainers
3. Once approved, implement the feature and submit a PR

### Documentation

Documentation improvements are highly valued:

- Fix typos or unclear explanations
- Add examples or use cases
- Update outdated information
- Improve API documentation

### Performance Improvements

Performance improvements should:
- Include before/after benchmarks
- Maintain compatibility with existing APIs
- Not sacrifice code readability for minor optimizations

## Testing Guidelines

### Unit Tests

- Each new feature should include unit tests
- Bug fixes should include tests that reproduce the bug
- Tests should be fast and deterministic
- Try to achieve high test coverage for new code

### Integration Tests

- Integration tests should verify that components work together
- Mock external dependencies when needed
- Test both successful and error scenarios

### Test Naming

Name tests clearly and descriptively:

```typescript
describe('RunCache', () => {
  describe('get', () => {
    it('should return undefined for non-existent keys', () => {
      // Test implementation
    });
    
    it('should return the cached value for existing keys', () => {
      // Test implementation
    });
    
    it('should not return expired values', () => {
      // Test implementation
    });
  });
});
```

## Documentation Guidelines

### Code Documentation

- Use JSDoc comments for functions, classes, and methods
- Document parameters, return values, and thrown exceptions
- Include examples for complex functionality

Example:

```typescript
/**
 * Sets a value in the cache with the given options.
 * 
 * @param options - The options for setting the cache entry
 * @param options.key - Unique identifier for the cache entry
 * @param options.value - String value to cache (required if no sourceFn)
 * @param options.ttl - Time-to-live in milliseconds
 * @param options.autoRefetch - Automatically refetch on expiry
 * @param options.sourceFn - Function to generate cache value
 * @param options.tags - Array of tags for tag-based invalidation
 * @param options.dependencies - Array of cache keys this entry depends on
 * @returns A Promise that resolves when the operation completes
 * @throws Error if key is empty, or if neither value nor sourceFn is provided
 * 
 * @example
 * ```typescript
 * // Set a simple value
 * await RunCache.set({ key: 'user', value: JSON.stringify({ name: 'John' }) });
 * 
 * // Set with TTL and auto-refetch
 * await RunCache.set({
 *   key: 'weather',
 *   sourceFn: async () => JSON.stringify(await fetchWeather()),
 *   ttl: 300000,
 *   autoRefetch: true
 * });
 * ```
 */
async set(options: SetOptions): Promise<void> {
  // Implementation
}
```

### README and Documentation

- Update relevant documentation for new features
- Ensure examples are accurate and working
- Use clear, concise language
- Include visuals where appropriate (diagrams, screenshots)

## Release Process

Maintainers handle releases following this process:

1. Update version in package.json according to [Semantic Versioning](https://semver.org/)
2. Update the CHANGELOG.md file
3. Create a new release on GitHub with release notes
4. Publish to npm

## Creating a Good Issue

When creating an issue:

1. Use a clear, descriptive title
2. Include your environment details (Node.js version, browser, etc.)
3. Provide steps to reproduce
4. Describe expected and actual behavior
5. Add screenshots or code examples if relevant
6. Use issue templates when available

## Becoming a Maintainer

Active contributors may be invited to become maintainers. Maintainers:
- Have write access to the repository
- Review and merge PRs
- Help with issue triage
- Guide the project direction
- Maintain code quality and test coverage

## Questions?

If you have questions about contributing, please:
- Start a discussion in the GitHub Discussions tab
- Ask in the issues tab with the "question" label
- Reach out to the maintainers

Thank you for contributing to RunCache! 