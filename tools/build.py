"""Builds the single self-contained index.html from src/. No external dependencies."""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
src = root / 'src'
css = (src / 'styles.css').read_text()
js = '\n'.join((src / f).read_text() for f in ['fixtures.js', 'seed.js', 'core.js', 'office1.js', 'office2.js', 'mobile.js', 'main.js'])
assert '</script' not in js, 'script terminator inside JS'
html = f'''<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#25282D">
<title>Trans Haul · Haulage Portal (demo)</title>
<meta name="description" content="Offline demonstration of the Trans Haul management portal. Illustrative data; no live systems connected.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2325282D'/%3E%3Crect x='12' y='6' width='8' height='14' fill='%23ED1C24'/%3E%3Crect x='12' y='20' width='8' height='6' fill='%23F6EC3D'/%3E%3C/svg%3E">
<style>
{css}
</style>
</head>
<body>
<div id="app" aria-live="polite"></div>
<div id="print-root"></div>
<noscript><p style="padding:24px;font-family:sans-serif">This demonstration needs JavaScript enabled.</p></noscript>
<script>
{js}
</script>
</body>
</html>
'''
(root / 'index.html').write_text(html)
print('index.html', len(html.encode()) // 1024, 'KB')
