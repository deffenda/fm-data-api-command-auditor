const vscode = require('vscode');

const OUTPUT_CHANNEL = 'FM Command Auditor';
const DEFAULT_TIMEOUT_MS = 8000;
const INTERACTIVE_CANCEL_MS = 2000;

const RISKY_COMMAND_PATTERNS = [
  /remove/i,
  /delete/i,
  /batchupdate/i,
  /editrecord/i,
  /import/i,
  /export/i,
  /toggleofflinemode/i
];

let output;
let lastReport;

function activate(context) {
  output = vscode.window.createOutputChannel(OUTPUT_CHANNEL);
  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.commands.registerCommand('fmCommandAuditor.runRegistrationAudit', async () => {
      await runAudit('registration');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('fmCommandAuditor.runSmokeAudit', async () => {
      const mode = await vscode.window.showQuickPick(
        [
          {
            label: 'Safe Smoke Audit (Recommended)',
            value: 'safe',
            description: 'Skips potentially destructive commands.'
          },
          {
            label: 'All Commands Smoke Audit',
            value: 'all',
            description: 'Attempts to execute every command; can trigger writes/prompts.'
          }
        ],
        {
          title: 'Select Smoke Audit Mode'
        }
      );

      if (!mode) {
        return;
      }

      await runAudit('smoke', mode.value);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('fmCommandAuditor.openLastReport', async () => {
      if (!lastReport) {
        vscode.window.showInformationMessage('No audit report is available yet. Run an audit first.');
        return;
      }

      await openReportDocument(lastReport);
    })
  );
}

function deactivate() {
  // no-op
}

async function runAudit(auditType, smokeMode) {
  const config = vscode.workspace.getConfiguration('fmCommandAuditor');
  const targetExtensionId = config.get('targetExtensionId', 'your-org.filemaker-data-api-tools');
  const timeoutMs = Math.max(1000, Number(config.get('commandTimeoutMs', DEFAULT_TIMEOUT_MS)) || DEFAULT_TIMEOUT_MS);
  const skipCommands = new Set(toStringArray(config.get('skipCommands', [])));
  const commandArgs = toRecord(config.get('commandArgs', {}));

  output.appendLine('');
  output.appendLine(`=== ${new Date().toISOString()} ===`);
  output.appendLine(`Starting ${auditType} audit for ${targetExtensionId}`);

  const targetExtension = vscode.extensions.getExtension(targetExtensionId);
  if (!targetExtension) {
    const message = `Target extension not found: ${targetExtensionId}`;
    vscode.window.showErrorMessage(message);
    output.appendLine(message);
    return;
  }

  try {
    await targetExtension.activate();
  } catch (error) {
    const message = `Failed to activate target extension: ${toErrorMessage(error)}`;
    vscode.window.showErrorMessage(message);
    output.appendLine(message);
    return;
  }

  const contributes = toRecord(targetExtension.packageJSON && targetExtension.packageJSON.contributes);
  const commandsRaw = Array.isArray(contributes && contributes.commands) ? contributes.commands : [];
  const commands = commandsRaw
    .map((item) => {
      const record = toRecord(item);
      const command = record && typeof record.command === 'string' ? record.command : undefined;
      const title = record && typeof record.title === 'string' ? record.title : command;
      if (!command) {
        return undefined;
      }
      return { id: command, title: title || command };
    })
    .filter(Boolean);

  const commandRegistry = await vscode.commands.getCommands(true);
  const commandSet = new Set(commandRegistry);

  const results = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `FM Command Auditor: ${auditType === 'registration' ? 'Registration' : 'Smoke'} audit`,
      cancellable: true
    },
    async (progress, token) => {
      for (let index = 0; index < commands.length; index += 1) {
        if (token.isCancellationRequested) {
          break;
        }

        const command = commands[index];
        if (!command) {
          continue;
        }

        const pct = Math.round(((index + 1) / commands.length) * 100);
        progress.report({ increment: index === 0 ? pct : undefined, message: `${command.id}` });

        const result = {
          command: command.id,
          title: command.title,
          registered: commandSet.has(command.id),
          execution: 'skipped',
          durationMs: 0,
          reason: undefined,
          error: undefined
        };

        if (!result.registered) {
          result.execution = 'not-registered';
          result.reason = 'Command not in VS Code command registry.';
          results.push(result);
          continue;
        }

        if (auditType === 'registration') {
          result.execution = 'registration-only';
          results.push(result);
          continue;
        }

        if (skipCommands.has(command.id)) {
          result.execution = 'skipped';
          result.reason = 'Skipped by fmCommandAuditor.skipCommands.';
          results.push(result);
          continue;
        }

        const isRisky = RISKY_COMMAND_PATTERNS.some((pattern) => pattern.test(command.id));
        if (smokeMode === 'safe' && isRisky) {
          result.execution = 'skipped';
          result.reason = 'Skipped as potentially destructive in Safe mode.';
          results.push(result);
          continue;
        }

        const args = readCommandArgs(commandArgs, command.id);
        const start = Date.now();
        const stopCanceler = startInteractiveCancelLoop();

        try {
          await runWithTimeout(() => vscode.commands.executeCommand(command.id, ...args), timeoutMs);
          result.execution = 'passed';
        } catch (error) {
          const message = toErrorMessage(error);
          if (message === '__timeout__') {
            result.execution = 'timeout';
            result.error = `Timed out after ${timeoutMs}ms`;
          } else {
            result.execution = 'failed';
            result.error = message;
          }
        } finally {
          stopCanceler();
          result.durationMs = Date.now() - start;
        }

        results.push(result);
      }
    }
  );

  const summary = summarizeResults(results);
  const report = {
    generatedAt: new Date().toISOString(),
    auditType,
    smokeMode: smokeMode || null,
    targetExtensionId,
    commandCount: commands.length,
    summary,
    results
  };

  lastReport = report;

  output.appendLine(`Audit complete: ${JSON.stringify(summary)}`);
  output.appendLine('Open report with: FM Command Auditor: Open Last Report');

  await openReportDocument(report);

  vscode.window.showInformationMessage(
    `FM Command Auditor complete. ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`
  );
}

function summarizeResults(results) {
  const summary = {
    passed: 0,
    failed: 0,
    skipped: 0,
    notRegistered: 0,
    timedOut: 0
  };

  for (const result of results) {
    if (result.execution === 'passed') {
      summary.passed += 1;
    } else if (result.execution === 'failed') {
      summary.failed += 1;
    } else if (result.execution === 'timeout') {
      summary.timedOut += 1;
    } else if (result.execution === 'not-registered') {
      summary.notRegistered += 1;
    } else {
      summary.skipped += 1;
    }
  }

  return summary;
}

function readCommandArgs(commandArgs, commandId) {
  if (!commandArgs || typeof commandArgs !== 'object') {
    return [];
  }

  const value = commandArgs[commandId];
  return Array.isArray(value) ? value : [];
}

async function openReportDocument(report) {
  const doc = await vscode.workspace.openTextDocument({
    language: 'json',
    content: JSON.stringify(report, null, 2)
  });

  await vscode.window.showTextDocument(doc, { preview: false });
}

function startInteractiveCancelLoop() {
  let disposed = false;
  const start = Date.now();

  const timer = setInterval(() => {
    if (disposed) {
      return;
    }

    if (Date.now() - start > INTERACTIVE_CANCEL_MS) {
      clearInterval(timer);
      return;
    }

    void vscode.commands.executeCommand('workbench.action.closeQuickOpen');
  }, 200);

  return () => {
    disposed = true;
    clearInterval(timer);
  };
}

async function runWithTimeout(fn, timeoutMs) {
  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('__timeout__')), timeoutMs);
  });

  try {
    await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function toRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
}

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === 'string');
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

module.exports = {
  activate,
  deactivate
};
