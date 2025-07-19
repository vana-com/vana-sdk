# CLAUDE_MISSION.md

## CRITICAL DIRECTIVE - AUTONOMOUS COMPLETION
**The user is on vacation. You MUST continue working autonomously through ALL phases without stopping until you open a PR. Do NOT stop for any reason. Complete the entire refactoring and open the PR when everything passes verification.**

## Constitution

<directive id="mission">
Your primary mission is to refactor the monolithic "God Component" at `examples/vana-sdk-demo/src/app/demo-page.tsx` into a modular system of providers, custom hooks, and lean view components, following the provided execution plan precisely.
</directive>

<directive id="quality">
Prioritize code clarity, correctness, and long-term maintainability over speed of completion. Produce elegant, modern, and idiomatic React/TypeScript. Before writing code for a step, you must briefly state your plan for that step.
</directive>

<directive id="workflow">
You MUST follow this strict, repeating loop for each logical step defined in the execution plan:
1.  **Re-orient:** Before beginning ANY new step, you MUST first execute the command `cat CLAUDE_MISSION.md` to read your full, un-compacted instructions back into your context. This is non-negotiable.
2.  **Plan:** Announce the specific step you are about to take from the execution plan.
3.  **Implement:** Write the necessary code to complete that single step.
4.  **Verify:** After completing a logical unit of work (e.g., a full custom hook and its component integration), you MUST run the verification suite: `npm run lint && npm run typecheck && npm test`. This verification cadence balances token cost with correctness. You must analyze the results and autonomously fix any errors before proceeding to the next step.
</directive>

<directive id="reporting">
To ensure you and I can track your state across many cycles, you MUST begin every single response with a header in the following format:
---
**Mission:** Refactor the God Component
**Current Step:** [Name of the current step from the execution_plan]
---
</directive>

## Execution Plan

<phase id="1" name="Establish the Foundation">
<step id="1a">Create the file `examples/vana-sdk-demo/src/providers/VanaProvider.tsx`.</step>
<step id="1b">Implement the `VanaProvider` component and the `useVana` custom hook within that file. This component will be responsible for initializing the Vana SDK and providing it via React Context.</step>
</phase>

<phase id="2" name="Extract Logic into Custom Hooks">
<step id="2a">Create the hook `examples/vana-sdk-demo/src/hooks/useUserFiles.ts` to manage all state and logic related to user files.</step>
<step id="2b">Create the hook `examples/vana-sdk-demo/src/hooks/usePermissions.ts` for permission management.</step>
<step id="2c">Create the hook `examples/vana-sdk-demo/src/hooks/useTrustedServers.ts` for trusted server logic.</step>
<step id="2d">Create hooks for Schemas and Refiners as needed.</step>
</phase>

<phase id="3" name="Refactor Views and Components">
<step id="3a">After creating each hook, immediately refactor the primary UI component that uses its logic (e.g., `UserDashboardView.tsx`) to consume the new hook. Remove the now-redundant state logic and props from the component.</step>
</phase>

<phase id="4" name="Decommission the God Component">
<step id="4a">Once all logic has been extracted into hooks and consumed by the respective views, refactor the main `demo-page.tsx` file. It should become a simple structural component that wraps its children with the `VanaProvider` and handles only the top-level loading/connection states.</step>
</phase>