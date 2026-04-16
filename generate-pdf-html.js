const fs = require('fs');

const inputFile  = 'Aura_Operations_Technical_Reference.md';
const outputFile = 'Aura_Operations_Technical_Reference_PRINT.html';

const mdContent = fs.readFileSync(inputFile, 'utf8');

const encoded = mdContent
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aura Operations - Technical Reference</title>

  <script src="https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      margin: 0; /* Strips browser headers/footers */
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.75;
      color: #1a1a2e;
      background: #fff;
    }

    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 60px 80px; /* Added padding to compensate for 0 margins */
    }

    /* ─── Typography ─────────────────────────────────── */
    h1 {
      font-size: 2.2em;
      color: #1e3a5f;
      border-bottom: 3px solid #1d4ed8;
      padding-bottom: 12px;
      margin: 44px 0 20px;
    }
    h2 {
      font-size: 1.5em;
      color: #1d4ed8;
      border-bottom: 1px solid #dbeafe;
      padding-bottom: 8px;
      margin: 36px 0 16px;
    }
    h3 { font-size: 1.15em; color: #1e40af; margin: 24px 0 12px; }
    p { margin: 10px 0 14px; color: #374151; }

    blockquote {
      border-left: 4px solid #1d4ed8;
      background: #eff6ff;
      padding: 12px 20px;
      margin: 16px 0;
      border-radius: 0 8px 8px 0;
      color: #1e40af;
      font-style: italic;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 13px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.09);
    }
    thead tr { background: #1d4ed8; color: white; }
    th, td { padding: 11px 16px; text-align: left; }
    tbody tr:nth-child(even) { background: #f8fafc; }

    .mermaid {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px 16px;
      margin: 20px 0;
      text-align: center;
    }

    pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 20px 24px;
      border-radius: 10px;
      margin: 16px 0;
      font-size: 0.84em;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .container { padding: 40px 60px; }
      .mermaid, table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div id="md-raw" style="display:none">${encoded}</div>
  <div class="container" id="content"></div>

  <script>
    const renderer = new marked.Renderer();
    renderer.code = function(code, lang) {
      if (lang === 'mermaid') return '<div class="mermaid">' + code + '</div>';
      var escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<pre><code>' + escaped + '</code></pre>';
    };

    var raw = document.getElementById('md-raw').textContent;
    var html = marked.parse(raw, { renderer: renderer, gfm: true });
    document.getElementById('content').innerHTML = html;

    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      flowchart: { useMaxWidth: true, htmlLabels: true },
    });
  <\/script>
</body>
</html>`;

fs.writeFileSync(outputFile, html, 'utf8');
console.log('SUCCESS: ' + outputFile + ' is ready.');
