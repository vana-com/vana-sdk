# Test Development Protocol

## CRITICAL SUCCESS CRITERIA

- **90% test coverage** across all metrics (lines, functions, branches, statements)
- **100%+ test pass rate**
- **Preserve ALL existing tests** - test count must not decrease
- **Use proper coverage tools** - never manually calculate coverage

## MANDATORY VERIFICATION LOOP

After EVERY change, run this verification sequence:

```bash
# 1. Full test suite with coverage
npm run test -- --coverage

# 2. Record these 4 metrics:
# - Total test count: X tests
# - Pass rate: Y% (Z passed / X total)
# - Coverage: A% lines, B% functions, C% branches, D% statements
# - Any test count regression is IMMEDIATE STOP signal

# 3. Only proceed if:
# - Test count >= previous count (never lose tests)
# - Pass rate trend is upward
# - Coverage trend is upward toward 90%
```

## WORK PHASES (Execute in strict order)

### Phase 1: PRESERVE & ASSESS (CRITICAL)

1. Run baseline: `npm run test -- --coverage`
2. Record exact starting metrics
3. Identify WHY tests are failing (don't guess, investigate)
4. Map all failing tests to root causes
5. **NEVER modify tests until you understand what's actually broken**

### Phase 2: SYSTEMATIC REPAIR

1. Fix failing tests ONE AT A TIME
2. After each fix: run full suite, verify no regressions
3. Priority: Fix tests without changing test count
4. Document what you changed and why

### Phase 3: COVERAGE EXPANSION

1. Only start this after Phase 2 is complete
2. Identify uncovered code areas
3. Add tests for uncovered areas
4. Each new test should increase both test count and coverage

### Phase 4: ITERATION TO 90%

1. Repeat Phase 3 until 90% coverage achieved
2. Each iteration must show measurable progress
3. No iteration should decrease pass rate or test count

## RED FLAGS - STOP IMMEDIATELY IF:

- Test count decreases
- Pass rate decreases by >2%
- You can't explain why a test is failing
- You're guessing what changes to make
- You're modifying multiple files without understanding dependencies

## COMPLETION CRITERIA

- ✅ 90%+ coverage on all 4 metrics
- ✅ 100%+ pass rate
- ✅ Test count >= starting count
- ✅ All changes documented and understood
