# FM Data API Command Auditor

Standalone VS Code extension (separate project) that audits commands from `your-org.filemaker-data-api-tools`.

## What It Tests

- Command contribution discovery from target extension manifest
- Registration check against VS Code command registry
- Optional smoke execution pass for each command

## Safety

- `Run Smoke Audit` has two modes:
  - **Safe Smoke Audit (Recommended)**: skips likely destructive commands
  - **All Commands Smoke Audit**: attempts everything (can trigger writes/prompts)
- Interactive prompts are auto-closed during smoke runs to avoid hangs.

## Settings

- `fmCommandAuditor.targetExtensionId` (default: `your-org.filemaker-data-api-tools`)
- `fmCommandAuditor.commandTimeoutMs` (default: `8000`)
- `fmCommandAuditor.skipCommands` (array of command IDs)
- `fmCommandAuditor.commandArgs` (object map: command ID -> args array)

Example:

```json
"fmCommandAuditor.commandArgs": {
  "filemakerDataApiTools.openQueryBuilder": [],
  "filemakerDataApiTools.openRecordViewer": [{ "profileId": "dev", "layout": "Assets", "recordId": "1" }]
}
```

## Run In VS Code

1. Open this folder in VS Code: `/tmp/fm-data-api-command-auditor`
2. Press `F5` to launch Extension Development Host
3. In the dev host, run:
   - `FM Command Auditor: Run Registration Audit`
   - `FM Command Auditor: Run Smoke Audit`
4. The report opens in a JSON editor tab.

