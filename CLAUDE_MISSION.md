# CLAUDE_MISSION.md

## Constitution

<directive id="mission">
Your primary mission is to write comprehensive unit and integration tests for the newly created custom hooks and page components. Your goal is to achieve high test coverage and enforce it in the CI configuration.
</directive>

<directive id="quality">
You must write high-quality tests using `vitest` and `@testing-library/react`. Tests should be clear, resilient, and focus on testing the behavior of the hooks and components from a user's perspective, not their internal implementation details. Mocks should be used judiciously for external dependencies like the Vana SDK.
</directive>

<directive id="workflow">
You MUST follow this strict, repeating loop for each logical testing unit:
1.  **Re-orient:** Before beginning ANY new step, you MUST execute the command `cat CLAUDE_MISSION.md` to read your full instructions back into your context.
2.  **Plan:** Announce which hook or component you are about to test.
3.  **Implement:** Write the test file (e.g., `useUserFiles.test.ts`).
4.  **Verify:** Run the tests via `npm test`. Analyze the results, including coverage reports. Ensure the new tests pass and that coverage has increased. Fix any issues before proceeding.
</directive>

<directive id="reporting">
You MUST begin every response with a header in the following format:
---
**Mission:** Build the Test Suite
**Current Step:** [Name of the current step from the execution_plan]
---
</directive>

## Execution Plan

<phase id="1" name="Test the Foundation">
<step id="1a">Write tests for the `VanaProvider`. The tests should verify that it correctly initializes the Vana SDK when a wallet is connected and provides the context value to child components.</step>
</phase>

<phase id="2" name="Unit Test the Custom Hooks (One by One)">
<step id="2a">Write comprehensive unit tests for `useUserFiles.ts`. Mock the `useVana` hook. Test all returned state and functions: fetching files, selecting files, decrypting, looking up, etc.</step>
<step id="2b">Write comprehensive unit tests for `usePermissions.ts`. Follow the same pattern of mocking dependencies and testing the hook's logic in isolation.</step>
<step id="2c">Write unit tests for `useTrustedServers.ts`.</step>
<step id="2d">Write unit tests for `useSchemasAndRefiners.ts`.</step>
</phase>

<phase id="3" name="Integration Test the Pages">
<step id="3a">Write an integration test for the `my-data/page.tsx` component. This test will render the full page and verify that user interactions (e.g., clicking the "Refresh" button) correctly trigger the underlying hooks and update the UI. You will use `@testing-library/react` for this.</step>
</phase>

<phase id="4" name="Enforce Quality Gate">
<step id="4a">After all tests are written and passing, analyze the final code coverage report.</step>
<step id="4b">Update the `examples/vana-sdk-demo/vitest.config.ts` file. Uncomment the `thresholds` section and set aggressive targets (e.g., 80% or higher for lines, functions, and branches) based on the achieved coverage. The build must fail if coverage drops below these new thresholds.</step>
</phase>