# Legacy SAP RCA Tools Archive

This directory is reserved for inactive or archived SAP RCA tools.

## Goal

Keep the active RCA workspace focused only on:

- WP-SCOUT Comparator
- ST03N Impact Analyzer
- Log Evidence Analyzer

## Candidate Legacy Files

The following tools are considered inactive and should eventually be moved into this directory after import verification:

```text
ToolBackup.jsx
ToolRollback.jsx
ToolMetrics.jsx
ToolUploader.jsx
ToolDeploy.jsx
ToolAnalyzer.jsx
ToolAnalyzerClean.jsx
ToolComparer.jsx
ToolLogs.jsx
ToolSt03nImpact.jsx
ToolLogEvidence.jsx
```

## Archive Rules

Before moving any file:

1. Verify no active imports exist.
2. Run full Vite build.
3. Validate active RCA routes.
4. Confirm no runtime dynamic import references remain.
5. Commit in small batches.

## Do Not Reintroduce

```text
MutationObserver
runtime DOM injectors
heavy delayed patching
old dashboard enhancer scripts
large force override CSS layers
```

## Current Active Registry

Current active registry is controlled only through:

```text
src/tools/index.js
```

Only these tools are active:

```text
comparer
analyzer
logs
```
