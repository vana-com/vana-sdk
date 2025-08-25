# Load Testing Milestones

This directory contains iterative testing milestones to ensure each component works correctly before building additional features.

## Milestone Structure

Each milestone follows this structure:
```
milestones/
├── ms-01/          # Core Components Validation
│   ├── README.md   # Milestone documentation
│   ├── test-*.ts   # Test scripts
│   └── ...         # Additional milestone-specific files
├── ms-02/          # Single E2E Flow
├── ms-03/          # Multi-User Validation  
├── ms-04/          # Load Pattern Testing
└── ms-05/          # Full Scale Test
```

## Testing Philosophy

1. **Incremental Validation**: Each milestone builds on the previous one
2. **Clear Success Criteria**: Pass/fail criteria are well defined
3. **Isolated Testing**: Each milestone can be run independently
4. **Documentation**: Every milestone includes setup, execution, and troubleshooting docs

## Current Status

| Milestone | Status | Description | Pass Rate |
|-----------|--------|-------------|-----------|
| [MS-01](ms-01/) | ✅ **COMPLETED** | Core Components Validation | 5/5 (100%) ✅ Fixed |
| [MS-02](ms-02/) | 🚧 **NEXT** | Single E2E Flow | Pending |
| [MS-03](ms-03/) | ⏳ **TODO** | Multi-User Validation | Pending |
| [MS-04](ms-04/) | ✅ **COMPLETED** | Load Pattern Testing | 10/10 (100%) ✅ |
| [MS-05](ms-05/) | 🚧 **IN DEVELOPMENT** | Streaming Load Test | Pending |

## How to Use

1. **Start with MS-01**: Always run the first milestone to validate your environment
2. **Follow Order**: Complete milestones in sequence - each builds on the previous
3. **Fix Issues**: If a milestone fails, resolve issues before proceeding
4. **Document Results**: Update milestone README with your test results

## Quick Start

```bash
# Run current milestone
npx tsx milestones/ms-01/test-milestone1.ts

# Check milestone status
cat milestones/ms-01/README.md

# View all milestones
ls milestones/
```

## Milestone Definitions

### MS-01: Core Components Validation ✅
**Goal**: Verify all core classes instantiate and basic functionality works
**Prerequisites**: None
**Duration**: ~2 seconds
**Tests**: Configuration, API Server, Load Test Client, Build System

### MS-02: Single E2E Flow 🚧
**Goal**: Execute one complete data portability flow end-to-end  
**Prerequisites**: MS-01 passing, CLI scripts implemented
**Duration**: ~30-60 seconds
**Tests**: Single wallet encryption → upload → transaction → AI inference

### MS-03: Multi-User Validation ⏳
**Goal**: Validate concurrent user handling (10-50 users)
**Prerequisites**: MS-02 passing
**Duration**: ~2-5 minutes  
**Tests**: Multiple wallets, light concurrent load, resource usage

### MS-04: Load Pattern Testing ✅
**Goal**: Test controlled load patterns with batching
**Prerequisites**: MS-03 passing
**Duration**: ~10-30 minutes
**Tests**: Ramp-up/sustain/ramp-down, batch processing, metrics collection

### MS-05: Streaming Load Test 🚧
**Goal**: Realistic traffic simulation with streaming architecture
**Prerequisites**: MS-04 passing
**Duration**: ~10-20 minutes  
**Tests**: Poisson user arrival, background funding, 1000+ users, real-time metrics

## Adding New Milestones

When adding a new milestone:

1. Create directory: `milestones/ms-XX/`
2. Add README.md with:
   - Overview and goals
   - Prerequisites and dependencies
   - Test procedures and scripts
   - Expected results and success criteria
   - Troubleshooting guide
3. Create test scripts with clear output
4. Update this main README with milestone status
5. Update PROGRESS.md with milestone completion
