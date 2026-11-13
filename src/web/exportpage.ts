// Builds a single, self-contained HTML page that plays one story.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function exportPage(code: string, runtimeJs: string, title: string): string {
  const data = JSON.stringify(code).replace(/</g, '\\u003c');
  const js = runtimeJs.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="color-scheme" content="light dark">
<style>
  :root { --bg: #f3f3f3; --fg: #3b3b3b; --muted: #6e7681; --border: #e5e5e5; --panel: #ffffff; --accent: #0078d4; --error: #e51400; }
  @media (prefers-color-scheme: dark) { :root { --bg: #181818; --fg: #cccccc; --muted: #9d9d9d; --border: #2b2b2b; --panel: #1f1f1f; --error: #f85149; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--fg); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 14px; }
  .plate { position: relative; width: min(100%, 720px); border: 1px solid var(--border); background: #fff; }
  canvas { display: block; width: 100%; aspect-ratio: 4 / 3; touch-action: none; }
  .begin { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border: 0; width: 100%;
    background: rgba(0,0,0,.45); color: #fff; font: 600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; cursor: pointer; }
  .said { width: min(100%, 720px); margin-top: 12px; padding: 8px 12px; min-height: 2em; max-height: 10em; overflow: auto; white-space: pre-wrap;
    background: var(--panel); border: 1px solid var(--border); font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .said:empty { display: none; }
  .said .err { color: var(--error); }
  footer { margin-top: 14px; font-size: 12px; color: var(--muted); }
  footer a { color: var(--accent); }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<div class="plate"><canvas id="stage" tabindex="0" aria-label="${esc(title)}"></canvas><button class="begin" id="begin">&#9654;&nbsp; Click to run</button></div>
<div class="said" id="said" aria-live="polite"></div>
<footer>Made with <a href="https://once.rennko.tech">Once</a></footer>
<script>${js}</script>
<script>
  var code = ${data};
  var begin = document.getElementById('begin');
  begin.addEventListener('click', function () {
    begin.remove();
    document.getElementById('stage').focus();
    Once.boot({ code: code, canvas: document.getElementById('stage'), said: document.getElementById('said') });
  });
</script>
</body>
</html>
`;
}
