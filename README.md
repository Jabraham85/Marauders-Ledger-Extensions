# Marauder's Ledger — Extensions Hub

Git-tracked mirror of the live extension marketplace on the network share.

**Source of truth:** `S:\JoseAbraham\extensions\`

This repo is populated automatically by `npm run ext:sync` from the main
Marauders Ledger project. Do not edit files here directly — changes will be
overwritten on the next sync.

## Structure

```
registry.json              Master extension catalog
marketplace-meta.json      Shared ratings and comments
<extension-id>/            One folder per extension (manifest + source)
```

## Syncing

From the main project:

```bash
npm run ext:sync           # pull from share + auto-commit
npm run ext:sync:dry       # preview what would change
```
