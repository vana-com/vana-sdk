# SDK Refactoring Plan

## Overview

This document tracks the comprehensive refactoring of `@opendatalabs/vana-sdk` to address critical developer experience issues. The refactoring is divided into two main workstreams, each delegated to specialized Sub-Agents.

## Workstreams

### Workstream 1: Fix Build System & Platform Separation

**Sub-Agent:** Build System Analyst AI  
**Branch:** `fix/build-system-platform-separation`  
**Objectives:**

- [ ] Verify and fix browser build self-containment issues
- [ ] Remove native Node.js dependencies from browser build
- [ ] Ensure platform entry points properly isolate platform-specific code
- [ ] Create reproducible test builds for verification
- [ ] Ensure all SDK internal tests pass

**Hypotheses to Test:**

1. Browser build requires manual Node.js polyfills
2. Native dependencies (e.g., `eccrypto`) leak into browser build
3. `/browser` and `/node` entry points don't properly isolate code

### Workstream 2: Standardize Asynchronous Operations

**Sub-Agent:** API Refactoring Specialist AI  
**Branch:** `fix/async-operations-standardization`  
**Objectives:**

- [ ] Replace manual polling patterns with Promise-based abstractions
- [ ] Standardize async return types across the SDK
- [ ] Maintain backward compatibility with deprecation notices
- [ ] Create comprehensive tests for new async patterns
- [ ] Document design decisions and migration path

**Problems to Solve:**

1. Server operations return `operationId` requiring manual polling
2. Inconsistent patterns between `TransactionHandle` and raw ID returns

## Execution Status

### Phase 1: Planning

- [x] Create REFACTORING_PLAN.md
- [x] Define workstreams and objectives
- [x] Prepare Sub-Agent prompts

### Phase 2: Workstream Execution

- [ ] Execute Workstream 1 (Build System & Platform Separation)
  - [ ] Create feature branch
  - [ ] Invoke Build System Analyst AI
  - [ ] Merge completed work
  - [ ] Delete feature branch
- [ ] Execute Workstream 2 (Async Operations Standardization)
  - [ ] Create feature branch
  - [ ] Invoke API Refactoring Specialist AI
  - [ ] Merge completed work
  - [ ] Delete feature branch

### Phase 3: Completion

- [ ] Verify all workstreams complete
- [ ] Final validation of SDK functionality
- [ ] Mark session complete

## Notes

- All changes must be verified through SDK's internal test suite
- Each workstream operates on a dedicated feature branch
- Branches are merged back to `feature/data-portability-sdk-v1` upon completion
- Sub-Agents work autonomously with TDD approach
