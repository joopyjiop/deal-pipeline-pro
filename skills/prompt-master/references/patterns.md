# Prompt Failure Patterns

Use this reference when diagnosing or repairing a prompt.

## Task

1. Vague verb → use a precise operation.
2. Two tasks in one prompt → split them into sequential prompts.
3. No success criteria → add a binary done condition.
4. Over-permissive agent → list allowed and forbidden actions.
5. Emotional description → extract the concrete fault.
6. Build-the-whole-thing → decompose into scoped stages.
7. Implicit reference → restate the task instead of saying “the thing we discussed.”

## Context

8. Assumed prior knowledge → include a memory block.
9. No project context → identify stack, state, audience, and relevant inputs.
10. Forgotten stack → carry forward locked architecture decisions.
11. Hallucination invitation → require grounded claims and uncertainty markers.
12. Undefined audience → name the reader and their knowledge level.
13. Missing prior failures → record what was tried and why it failed.

## Format

14. Missing output format → specify structure, length, and file type.
15. Implicit length → state a word, sentence, item, or token limit.
16. No role assignment → add a specific expert role for complex work.
17. Vague aesthetic → translate adjectives into measurable design constraints.
18. Missing image negatives → add relevant exclusions.
19. Prose for syntax-sensitive tools → use the target tool’s native syntax.

## Scope and reasoning

20. No file boundary → name exact files and functions.
21. No stack constraint → state framework and version.
22. No agent stop condition → add checkpoints and review triggers.
23. No IDE file path → include the exact path and symbol.
24. Wrong template for tool → route to the target tool’s template.
25. Entire codebase pasted → provide only relevant context.
26. CoT missing for standard logic tasks → ask the model to reason carefully when appropriate.
27. CoT added to reasoning-native models → remove it.
28. Inter-session memory assumed → provide it again.
29. Prior decisions contradicted → include the locked decisions in context.
30. No grounding rule → require source-bounded claims.

## Agentic safety

31. No starting state → describe the current files and environment.
32. No target state → define the expected deliverable.
33. Silent agent → require progress checkpoints.
34. Unlocked filesystem → restrict editable paths and forbid secrets/configs unless requested.
35. No human review trigger → stop before deletion, dependency changes, schema changes, deployment, or external actions.
36. Vague first turn on current Opus models → front-load intent, scope, constraints, and acceptance criteria.
37. Context rot → start a new session or compact before continuing a long, correction-heavy task.
