# Prompt Templates

Read only the template needed for the current target tool.

## A — RTF

```text
Role: [specific expert identity]
Task: [precise action + deliverable]
Format: [exact structure and length]
```

## B — CO-STAR

```text
Context: [necessary background]
Objective: [exact goal]
Style: [writing style]
Tone: [emotional register]
Audience: [reader and knowledge level]
Response: [format, length, and structure]
```

## C — RISEN

```text
Role: [expert identity]
Instructions: [overall task]
Steps:
1. [action]
2. [action]
End Goal: [what success produces]
Narrowing: [constraints and exclusions]
```

## D — CRISPE

```text
Capacity: [capability]
Role: [persona]
Insight: [background insight]
Statement: [core task]
Personality: [tone]
Experiment: [variants to explore]
```

## E — Careful analysis

Use only for standard reasoning models and only when the task needs it:

```text
[Task]
Think through the constraints and alternatives carefully before answering.
Return only the final answer in [format].
```

Never add chain-of-thought scaffolding to o3/o4-mini, DeepSeek-R1, or Qwen3 thinking mode.

## F — Few-shot

```text
[Task instruction]
<examples>
<example><input>[example]</input><output>[expected format]</output></example>
<example><input>[edge case]</input><output>[expected format]</output></example>
</examples>
Apply the same pattern to: [actual input]
```

Use 2–5 examples, including edge cases.

## G — File-scope coding prompt

```text
File: [exact/path]
Function/Component: [symbol]
Current Behavior: [specific behavior]
Desired Change: [specific result]
Scope: Only modify [scope].
Do NOT touch: [files, systems, or behavior]
Constraints:
- [stack/version]
- Do not add dependencies without approval
- Preserve existing contracts
Done When:
- [binary acceptance criterion]
```

## H — Agentic task with stop conditions

```text
Objective: [one sentence]
Starting State: [current environment]
Target State: [expected result]
Allowed Actions:
- [specific action]
Forbidden Actions:
- Do not touch [scope]
- Do not deploy, push, delete, add dependencies, or change schema without approval
Stop Conditions:
- Pause before irreversible actions or external integrations
- Pause after two unsuccessful fixes
Checkpoints:
After each major step output: ✅ [completed work]
```

## I — Visual descriptor

```text
Subject: [main subject]
Action/Pose: [what it does]
Setting: [location]
Style: [specific style]
Mood: [mood]
Lighting: [lighting]
Color Palette: [colors]
Composition: [shot/composition]
Aspect Ratio: [ratio]
Negative Prompts: [exclusions]
```

Use native parameters for the selected image/video tool.

## J — Reference image editing

```text
Attach the reference image before sending this prompt.
Keep exactly the same: [unchanged elements]
Change only: [specific delta]
Amount: [subtle/moderate/significant]
Style consistency: [preserve style, lighting, and mood]
Negative prompt: [what not to introduce]
```

## K — ComfyUI

Ask which checkpoint is loaded, then output separate blocks:

```text
POSITIVE PROMPT:
[subject, style, mood, lighting, composition]

NEGATIVE PROMPT:
[blur, watermark, distortion, unwanted anatomy, etc.]

CHECKPOINT: [model]
SAMPLER: [sampler]
CFG SCALE: [value]
STEPS: [value]
RESOLUTION: [width x height]
```

## L — Prompt decompiler

For **break down**:

```text
Original prompt: [paste]
Structure analysis:
- Role/Identity:
- Task:
- Constraints:
- Format:
- Weaknesses:
Recommended fix: [rewritten prompt]
```

For **adapt**:

```text
Original ([source tool]): [prompt]
Adapted for [target tool]:
[prompt]
Key changes:
- [change + reason]
```

For **split**:

```text
Original prompt: [prompt]
This does [N] things. Split into [N] prompts:
Prompt 1 — [scope]:
[prompt]
Prompt 2 — [scope]:
[prompt]
```

## M — Current Opus task brief

```text
## Objective
[one clear goal and why]
## Context
[current files, behavior, stack, prior failures]
## Target State
[specific files, behavior, and passing checks]
## Scope
- Work only in: [paths]
- Do not touch: [paths/systems]
## Constraints
- [versions, conventions, dependency limits]
- Only make requested changes.
## Acceptance Criteria
- [ ] [binary check]
- [ ] [binary check]
## Stop Conditions
Stop before deleting files, adding dependencies, changing schema, deploying, or leaving scope.
## Progress
After each step: ✅ [what changed]
```
