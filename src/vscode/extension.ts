// The Once extension for VS Code: live mistakes, a preview panel, and run/export commands.
import { spawn, ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import * as vscode from 'vscode';
import { OnceError } from '../errors';
import { parse } from '../parser';
import { completions, explain, signatureAt, symbols } from '../explain';

let output: vscode.OutputChannel;
let running: ChildProcess | null = null;
let panel: vscode.WebviewPanel | null = null;
let panelDoc: vscode.Uri | null = null;

export function activate(ctx: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel('Once');
  const diags = vscode.languages.createDiagnosticCollection('once');
  const cli = join(ctx.extensionPath, 'out', 'once.cjs');

  const toDiag = (e: OnceError, doc: vscode.TextDocument) => {
    const sp = e.span ?? { line: 1, col: 1, len: 1 };
    const line = Math.min(doc.lineCount - 1, Math.max(0, sp.line - 1));
    const range = new vscode.Range(line, sp.col - 1, line, sp.col - 1 + Math.max(1, sp.len));
    const d = new vscode.Diagnostic(range, e.message.replace(/`/g, "'") + (e.hint ? `\nHint: ${e.hint.replace(/`/g, "'")}` : ''), vscode.DiagnosticSeverity.Error);
    d.source = 'once';
    return d;
  };

  const check = (doc: vscode.TextDocument) => {
    if (doc.languageId !== 'once') return;
    try {
      parse(doc.getText());
      diags.set(doc.uri, []);
    } catch (e) {
      if (e instanceof OnceError) diags.set(doc.uri, [toDiag(e, doc)]);
    }
  };
  const timers = new Map<string, NodeJS.Timeout>();
  ctx.subscriptions.push(
    output, diags,
    vscode.workspace.onDidOpenTextDocument(check),
    vscode.workspace.onDidChangeTextDocument((ev) => {
      const k = ev.document.uri.toString();
      clearTimeout(timers.get(k));
      timers.set(k, setTimeout(() => check(ev.document), 300));
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => diags.delete(doc.uri)),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (panel && panelDoc && doc.uri.toString() === panelDoc.toString()) sendCode(doc);
    }),
  );
  vscode.workspace.textDocuments.forEach(check);

  // Hover, autocomplete and input hints, like other languages have.
  const KIND: Record<string, vscode.CompletionItemKind> = {
    statement: vscode.CompletionItemKind.Keyword, keyword: vscode.CompletionItemKind.Keyword,
    operator: vscode.CompletionItemKind.Operator, shape: vscode.CompletionItemKind.Class,
    setting: vscode.CompletionItemKind.Property, function: vscode.CompletionItemKind.Function,
    value: vscode.CompletionItemKind.Constant, property: vscode.CompletionItemKind.Field,
    'user-fn': vscode.CompletionItemKind.Method, 'user-var': vscode.CompletionItemKind.Variable,
    snippet: vscode.CompletionItemKind.Snippet,
  };
  const selector: vscode.DocumentSelector = { language: 'once' };
  ctx.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, {
      provideHover(doc, pos) {
        const r = explain(doc.getText(), pos.line, pos.character);
        if (!r) return null;
        const md = new vscode.MarkdownString(r.markdown);
        return new vscode.Hover(md, new vscode.Range(pos.line, r.start, pos.line, r.end));
      },
    }),
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(doc, pos) {
        const src = doc.getText();
        return completions(src, pos.line, pos.character, symbols(src)).map((c) => {
          const item = new vscode.CompletionItem(c.label, KIND[c.kind] ?? vscode.CompletionItemKind.Text);
          item.detail = c.detail;
          item.documentation = new vscode.MarkdownString(c.doc);
          if (c.insert) item.insertText = new vscode.SnippetString(c.insert);
          if (c.kind === 'snippet') item.sortText = '0' + c.label;
          else if (c.kind.startsWith('user')) item.sortText = '1' + c.label;
          return item;
        });
      },
    }, "'", '.'),
    vscode.languages.registerSignatureHelpProvider(selector, {
      provideSignatureHelp(doc, pos) {
        const sig = signatureAt(doc.getText(), pos.line, pos.character);
        if (!sig) return null;
        const info = new vscode.SignatureInformation(sig.label, new vscode.MarkdownString(sig.doc));
        info.parameters = sig.params.map((p) => new vscode.ParameterInformation(p));
        const help = new vscode.SignatureHelp();
        help.signatures = [info];
        help.activeSignature = 0;
        help.activeParameter = Math.min(sig.active, Math.max(0, sig.params.length - 1));
        return help;
      },
    }, '(', ','),
  );

  const current = async (): Promise<vscode.TextDocument | null> => {
    const ed = vscode.window.activeTextEditor;
    const doc = ed?.document ?? (panelDoc ? await vscode.workspace.openTextDocument(panelDoc) : null);
    if (!doc || doc.languageId !== 'once') {
      vscode.window.showWarningMessage('Open a .once file first.');
      return null;
    }
    if (doc.isDirty && !doc.isUntitled) await doc.save();
    return doc;
  };

  // Runs the bundled `once` command with VS Code's own Node, so nothing else needs installing.
  const runCli = (args: string[], onDone?: (code: number | null) => void) => {
    running?.kill();
    const p = spawn(process.execPath, [cli, ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    running = p;
    p.stdout.on('data', (d) => output.append(d.toString()));
    p.stderr.on('data', (d) => output.append(d.toString()));
    p.on('close', (code) => { if (running === p) running = null; onDone?.(code); });
  };

  const sendCode = (doc: vscode.TextDocument) => {
    diags.set(doc.uri, []);
    check(doc);
    panel?.webview.postMessage({ type: 'run', code: doc.getText() });
  };

  ctx.subscriptions.push(
    vscode.commands.registerCommand('once.preview', async () => {
      const doc = await current();
      if (!doc) return;
      panelDoc = doc.uri;
      if (!panel) {
        panel = vscode.window.createWebviewPanel('oncePreview', 'Once Preview', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.file(join(ctx.extensionPath, 'out', 'web'))],
        });
        panel.webview.html = previewHtml(panel.webview, ctx.extensionPath);
        panel.onDidDispose(() => { panel = null; });
        panel.webview.onDidReceiveMessage(async (m) => {
          if (m.type === 'ready' && panelDoc) sendCode(await vscode.workspace.openTextDocument(panelDoc));
          if (m.type === 'error' && panelDoc) {
            const d = await vscode.workspace.openTextDocument(panelDoc);
            diags.set(panelDoc, [toDiag(Object.assign(new OnceError('runtime', m.message, m.span, m.hint)), d)]);
          }
        });
      } else {
        panel.reveal(vscode.ViewColumn.Beside, true);
        sendCode(doc);
      }
      panel.title = `Once: ${doc.fileName.split(/[\\/]/).pop()}`;
    }),

    vscode.commands.registerCommand('once.runInTerminal', async () => {
      const doc = await current();
      if (!doc) return;
      output.clear();
      output.show(true);
      if (doc.isUntitled) {
        output.appendLine('Save the file first, then run it again.');
        return;
      }
      runCli(['run', doc.fileName], (code) => output.appendLine(code === 0 ? '\n[done]' : code === null ? '\n[stopped]' : ''));
    }),

    vscode.commands.registerCommand('once.stop', () => {
      running?.kill();
      panel?.webview.postMessage({ type: 'stop' });
    }),

    vscode.commands.registerCommand('once.export', async () => {
      const doc = await current();
      if (!doc || doc.isUntitled) return;
      const out = doc.fileName.replace(/\.once$/, '') + '.html';
      output.clear();
      runCli(['export', doc.fileName, '-o', out], async (code) => {
        if (code !== 0) { output.show(true); return; }
        const pick = await vscode.window.showInformationMessage(`Saved ${out.split(/[\\/]/).pop()}`, 'Open in browser');
        if (pick) vscode.env.openExternal(vscode.Uri.file(out));
      });
    }),

    vscode.commands.registerCommand('once.openPlayground', async () => {
      const doc = await current();
      if (!doc) return;
      const packed = 'z' + deflateRawSync(Buffer.from(doc.getText(), 'utf8')).toString('base64url');
      const name = doc.fileName.split(/[\\/]/).pop()!.replace(/\.once$/, '');
      vscode.env.openExternal(vscode.Uri.parse(`https://once.rennko.tech/#code=${packed}&title=${encodeURIComponent(name)}`));
    }),
  );
}

function previewHtml(webview: vscode.Webview, extPath: string): string {
  const js = webview.asWebviewUri(vscode.Uri.file(join(extPath, 'out', 'web', 'once-web.js')));
  const nonce = Math.random().toString(36).slice(2);
  readFileSync(join(extPath, 'out', 'web', 'once-web.js'));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
<style>
  body { margin: 0; padding: 12px; background: var(--vscode-editor-background); color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
  .stage { max-width: 720px; border: 1px solid var(--vscode-panel-border, #8884); background: #fff; }
  canvas { display: block; width: 100%; aspect-ratio: 4 / 3; outline: none; touch-action: none; }
  .bar { display: flex; justify-content: space-between; max-width: 720px; margin: 0 0 8px; color: var(--vscode-descriptionForeground); font-size: 12px; }
  #said { max-width: 720px; margin-top: 10px; font: var(--vscode-editor-font-size, 13px)/1.5 var(--vscode-editor-font-family, monospace); white-space: pre-wrap; }
  #said .err { color: var(--vscode-errorForeground); }
</style></head>
<body>
<div class="bar"><span>480 &times; 360. Click the picture to use the keyboard.</span><span>Saves re-run the program.</span></div>
<div class="stage"><canvas id="stage" tabindex="0"></canvas></div>
<div id="said"></div>
<script nonce="${nonce}" src="${js}"></script>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const canvas = document.getElementById('stage');
  const said = document.getElementById('said');
  canvas.addEventListener('pointerdown', () => canvas.focus());
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type === 'run') {
      Once.boot({ code: m.code, canvas, said, onError: (e) => vscode.postMessage({ type: 'error', message: e.message, hint: e.hint, span: e.span }) });
      canvas.focus();
    }
    if (m.type === 'stop' && canvas.onceStage) canvas.onceStage.stop();
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body></html>`;
}

export function deactivate() {
  running?.kill();
}
