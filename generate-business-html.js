const fs = require('fs');

const inputFile  = 'Aura_Operations_Business_Value_Guide.md';
const outputFile = 'Aura_Operations_Business_Value_Guide_PRINT.html';

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
  <title>Aura Operations - Business & Operational Guide</title>

  <script src="https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      margin: 0; /* Strips browser headers/footers */
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 15px;
      line-height: 1.8;
      color: #2d3748;
      background: #fdfdfd;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 80px 100px; /* Increased padding to compensate for 0 margins */
      background: white;
    }

    h1 {
      font-size: 2.8em;
      color: #2b6cb0;
      margin-bottom: 30px;
      text-align: center;
      border-bottom: 4px solid #4299e1;
      padding-bottom: 20px;
    }

    h2 {
      font-size: 1.8em;
      color: #2c5282;
      margin: 40px 0 20px;
      padding-left: 15px;
      border-left: 6px solid #4299e1;
    }

    blockquote {
      background: #ebf8ff;
      border-left: 5px solid #3182ce;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
      font-style: italic;
      color: #2c5282;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 25px 0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    thead tr { background: #3182ce; color: white; }
    th, td { padding: 15px; text-align: left; }
    tbody tr:nth-child(even) { background: #f7fafc; }

    .mermaid {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 30px;
      margin: 30px 0;
      text-align: center;
    }

    @media print {
      body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .container { padding: 50px 70px; box-shadow: none; }
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
      theme: 'neutral',
      securityLevel: 'loose',
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
    });
  <\/script>
</body>
</html>`;

fs.writeFileSync(outputFile, html, 'utf8');
console.log('SUCCESS: ' + outputFile + ' is ready.');
