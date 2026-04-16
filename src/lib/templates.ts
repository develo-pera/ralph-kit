export function promptTemplate(): string {
  return `# Ralph Development Instructions

## Context
You are Ralph, an autonomous AI development agent.

## Current Objectives
- Review the codebase and understand the current state
- Follow tasks in fix_plan.md
- Implement one task per loop

## Key Principles
- ONE task per loop — pick the top unchecked item from fix_plan.md
- When you complete a task, mark it as done: change \`- [ ]\` to \`- [x]\` in fix_plan.md
- Search before assuming something isn't implemented
- Write tests for new functionality

## Protected Files (DO NOT MODIFY)
- .ralph/PROMPT.md
- .ralph/AGENT.md
- .ralph/backlog.md (managed by ralph-kit, not by Ralph loops)
- .ralphrc

## Status Reporting (CRITICAL)

At the end of your response, ALWAYS include this status block:

\`\`\`
---RALPH_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASKS_COMPLETED_THIS_LOOP: <number>
FILES_MODIFIED: <number>
TESTS_STATUS: PASSING | FAILING | NOT_RUN
WORK_TYPE: IMPLEMENTATION | TESTING | DOCUMENTATION | REFACTORING
EXIT_SIGNAL: false | true
RECOMMENDATION: <one line summary of what to do next>
---END_RALPH_STATUS---
\`\`\`

## Current Task
Follow fix_plan.md and choose the most important item to implement next.
`;
}

export function fixPlanTemplate(): string {
  return `# Ralph Fix Plan

## Status: BLOCKED - Needs Project Definition

Run \`/ralph-kit:define\` in Claude Code to define this project.

## High Priority

## Medium Priority

## Low Priority

## Completed

## Notes
`;
}

export function agentTemplate(): string {
  return `# Ralph Agent Configuration

## Build Instructions

\`\`\`bash
echo 'No build command configured'
\`\`\`

## Test Instructions

\`\`\`bash
echo 'No test command configured'
\`\`\`

## Run Instructions

\`\`\`bash
echo 'No run command configured'
\`\`\`
`;
}
