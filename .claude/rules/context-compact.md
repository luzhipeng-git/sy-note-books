# Context Compact Rule

## GLM-5.1 Context Window: 200k tokens

Current model is GLM-5.1 with a **200k token** context window (not 1M).

## Mandatory Compaction at 170k

When context usage approaches **170k tokens**, you MUST:

1. **Proactively trigger compaction** — do NOT wait until context is nearly full
2. **Signal the user** — inform them that context is approaching the threshold and compaction is needed
3. **Use `/compact`** — run context compaction to free up space
4. **Continue work** — after compaction, resume the current task seamlessly

## How to Detect

- Monitor conversation length and tool output volume
- When you estimate context has consumed ~170k tokens (roughly 85% of capacity), act immediately
- Do NOT continue generating responses or spawning agents past this point

## Why 170k (not 200k)

- Leaves 30k tokens of headroom for the compaction process itself
- Prevents sudden truncation that loses important context
- Ensures task continuity without disruption
