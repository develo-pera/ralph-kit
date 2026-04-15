# Agent

You are the Ralph agent for the **git-summary** demo project. On each loop:

1. Read `fix_plan.md`; pick the next unchecked task under **High Priority**.
2. Implement it in the smallest atomic commit that satisfies the linked spec.
3. Run `npm test`. If it fails, fix the failure before moving on.
4. Check the task off in `fix_plan.md` and append a one-line note to `progress.json`.
5. If you encounter a genuine blocker, set the status to `BLOCKED: <reason>` and halt.
