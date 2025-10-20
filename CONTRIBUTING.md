# Contributing to Vana SDK

Thank you for contributing to the Vana SDK!

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/vana-sdk.git
cd vana-sdk

# Install dependencies
npm install

# Build the SDK
npm run build

# Run tests
npm test
```

## Development Workflow

### Two-Terminal Setup

For active SDK development with hot reload:

**Terminal 1: SDK Watch Mode**

```bash
cd packages/vana-sdk
npm run dev
```

**Terminal 2: Example Application**

```bash
npm run dev:console  # Comprehensive SDK demo
npm run dev:vibes    # Social features demo
```

Changes to SDK source will automatically rebuild and reflect in the example app.

### Code Generation

The SDK includes auto-generated code from smart contracts and APIs:

- `npm run fetch-abis` - Fetch contract ABIs from deployed contracts
- `npm run generate:types` - Generate TypeScript types from ABIs
- `npm run fetch-server-types` - Generate server API types
- `npm run codegen:subgraph` - Generate subgraph types

Generated files are in `packages/vana-sdk/src/generated/` and should never be edited manually.

### Before Submitting

Run all checks:

```bash
npm run validate  # Runs lint, typecheck, and tests
```

## Code Standards

### TypeScript

- Strict mode enabled
- Export all public types
- Follow TSDoc conventions per [DOCS_GUIDE.md](./DOCS_GUIDE.md)
- Follow type definition patterns per [TYPES_GUIDE.md](./TYPES_GUIDE.md)
- No `any` types without justification

### Testing

- Write tests for new features
- Include both success and error cases
- Mock external dependencies
- Coverage targets: 76% statements, 83% branches, 87% functions (enforced in CI)

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(permissions): add batch permission granting
fix(storage): handle IPFS timeout correctly
docs(readme): update installation steps
test(encryption): add edge case coverage
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run `npm run validate`
5. Submit PR with clear description
6. Address review feedback

## Reporting Issues

### Bugs

- Search existing issues first
- Provide minimal reproduction
- Include error messages
- Note environment details

### Security

- **DO NOT** create public issues for vulnerabilities
- Email security@vana.org instead
- We respond within 48 hours

## Documentation

When modifying public APIs:

1. Update TSDoc comments following DOCS_GUIDE.md
2. Update relevant examples
3. Test that documentation builds correctly

## Questions?

- GitHub Issues: Bug reports and features
- Discord: [#developers channel](https://discord.gg/vanabuilders)
- Email: developers@vana.org

## License

Contributions are licensed under [ISC](./LICENSE).
