# Contributing to Vana SDK

Thank you for your interest in contributing to the Vana SDK! We welcome contributions from the community and are excited to work with you.

## 🚀 Quick Start for Contributors

```bash
# 1. Fork and clone the repository
git clone https://github.com/your-username/vana-sdk.git
cd vana-sdk

# 2. Install dependencies
npm install

# 3. Build the SDK
npm run build

# 4. Run tests
npm test

# 5. Start the demo app
cd examples/vana-sdk-demo
npm install
npm run dev
```

## 📋 Development Workflow

### 1. **Before Starting**

- 🔍 **Check existing issues** - Browse [open issues](https://github.com/vana-com/vana-sdk/issues) to see if your idea is already being discussed
- 💬 **Join the discussion** - Comment on existing issues or create a new one to discuss your proposed changes
- 📧 **For major changes** - Reach out via [Discord](https://discord.gg/vanabuilders) or email developers@vana.org

### 2. **Setting Up Development Environment**

**Prerequisites:**

- Node.js 18+ and npm
- Git configured with your GitHub account
- A code editor (VS Code recommended)

**Repository Structure:**

```
vana-sdk/
├── packages/vana-sdk/     # Main SDK package
├── examples/              # Example applications
├── .github/               # CI/CD workflows
└── docs/                  # Documentation (when available)
```

### 3. **Making Changes**

**Branch Naming Convention:**

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

**Example:**

```bash
git checkout -b feature/react-hooks-package
git checkout -b fix/encryption-key-generation
git checkout -b docs/improve-storage-guide
```

### 4. **Code Quality Standards**

**Before committing, ensure:**

- ✅ All tests pass: `npm test`
- ✅ Code is properly typed: `npm run typecheck`
- ✅ Code follows style guide: `npm run lint`
- ✅ Build succeeds: `npm run build`

**TypeScript Requirements:**

- Use strict TypeScript configuration
- Export all public types and interfaces
- Add JSDoc comments for public APIs
- Prefer explicit types over `any`

**Testing Requirements:**

- Add tests for new functionality
- Maintain >95% code coverage
- Test both success and error scenarios
- Include integration tests where appropriate

### 5. **Commit Guidelines**

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
# Format
<type>(<scope>): <description>

# Examples
feat(permissions): add support for permission templates
fix(storage): resolve IPFS upload timeout issue
docs(readme): update installation instructions
test(encryption): add edge case tests for key generation
```

**Types:**

- `feat` - New features
- `fix` - Bug fixes
- `docs` - Documentation changes
- `test` - Adding or updating tests
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `ci` - CI/CD changes

## 🧪 Testing Guidelines

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --grep "PermissionsController"

# Run tests in watch mode
npm run test:watch
```

### Writing Tests

**Test Structure:**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { Vana } from "../src/vana";

describe("Feature Name", () => {
  beforeEach(() => {
    // Setup code
  });

  it("should handle success case", async () => {
    // Arrange
    const input = createTestInput();

    // Act
    const result = await functionUnderTest(input);

    // Assert
    expect(result).toEqual(expectedOutput);
  });

  it("should handle error case", async () => {
    // Test error scenarios
    await expect(functionUnderTest(invalidInput)).rejects.toThrow(
      ExpectedError,
    );
  });
});
```

**Mock External Dependencies:**

```typescript
// Mock viem clients
const mockWalletClient = {
  signTypedData: vi.fn(),
  getAddresses: vi.fn(),
  // ...
};

// Mock network requests
globalThis.fetch = vi.fn();
```

## 📝 Documentation Guidelines

### Code Documentation

**JSDoc Comments for Public APIs:**

````typescript
/**
 * Grants permission for an application to access user data.
 *
 * @param params - The permission grant parameters
 * @returns Promise resolving to the transaction hash
 *
 * @example
 * ```typescript
 * const txHash = await vana.permissions.grant({
 *   grantee: '0x...',
 *   operation: 'llm_inference',
 *   files: [1, 2, 3],
 *   parameters: { prompt: 'Analyze my data' }
 * });
 * ```
 *
 * @throws {UserRejectedRequestError} When user rejects signature
 * @throws {RelayerError} When relayer service fails
 */
async grant(params: GrantPermissionParams): Promise<Hash> {
  // Implementation
}
````

### README Updates

When adding features, update relevant documentation:

- Main SDK README
- Demo app README
- Example code snippets
- API reference sections

## 🐛 Bug Reports

### Before Reporting

- Search existing issues to avoid duplicates
- Try to reproduce the issue consistently
- Test with the latest version

### Bug Report Template

**Title:** [Component] Brief description of the issue

**Description:**

- Clear description of the bug
- Expected behavior vs actual behavior
- Steps to reproduce
- Environment details (Node.js version, OS, browser)

**Code Example:**

```typescript
// Minimal code example that reproduces the issue
const vana = Vana({ walletClient });
await vana.permissions.grant(params); // Error occurs here
```

**Additional Context:**

- Error messages and stack traces
- Console logs
- Screenshots (if applicable)

## 💡 Feature Requests

### Feature Request Template

**Title:** [Component] Brief feature description

**Problem:**

- What problem does this solve?
- Who would benefit from this feature?
- Current workarounds or limitations

**Proposed Solution:**

```typescript
// Proposed API design
await vana.newFeature.method(params);
```

**Alternative Solutions:**

- Other approaches considered
- Trade-offs and considerations

## 🔒 Security

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Instead:

- Email: security@vana.org
- Include detailed description
- Provide steps to reproduce
- We'll respond within 48 hours

### Security Best Practices

When contributing:

- Never commit secrets or private keys
- Validate all inputs
- Use secure cryptographic libraries
- Follow OWASP guidelines
- Test for common vulnerabilities

## 📦 Release Process

### Version Management

We use [Semantic Versioning](https://semver.org/):

- `MAJOR.MINOR.PATCH`
- Breaking changes increment MAJOR
- New features increment MINOR
- Bug fixes increment PATCH

### Release Workflow

1. **Development** → `develop` branch
2. **Testing** → Comprehensive testing phase
3. **Release** → Merge to `main` branch
4. **Tag** → Create version tag
5. **Publish** → Automated NPM publish

**Contributors don't manage releases** - maintainers handle the release process.

## 🤝 Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please read our [Code of Conduct](./CODE_OF_CONDUCT.md).

### Communication Channels

- **GitHub Issues:** Bug reports and feature requests
- **GitHub Discussions:** Questions and community discussion
- **Discord:** Real-time chat and community support
- **Email:** Direct contact for sensitive issues

### Getting Help

**For Development Questions:**

1. Check existing documentation
2. Search GitHub issues
3. Ask in Discord #developers channel
4. Create a GitHub discussion

**For Bug Reports:**

1. Create a GitHub issue with reproduction steps
2. Include environment details
3. Provide minimal code example

## 🏆 Recognition

### Contributors

All contributors are recognized in:

- GitHub contributor list
- Release notes (for significant contributions)
- Annual contributor acknowledgments

### Types of Contributions

We value all types of contributions:

- 🐛 Bug fixes
- ✨ New features
- 📝 Documentation improvements
- 🧪 Test additions
- 🎨 UI/UX improvements
- 💡 Ideas and feedback
- 🌍 Community support

## 📄 License

By contributing to Vana SDK, you agree that your contributions will be licensed under the [ISC License](./LICENSE).

---

**Thank you for helping make the Vana SDK better! 🚀**

Ready to contribute? Check out our [good first issues](https://github.com/vana-com/vana-sdk/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) to get started!
