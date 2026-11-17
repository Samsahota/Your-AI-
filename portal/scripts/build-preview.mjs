// Builds web/setup-preview.html from the template and the captured database output.
import { readFileSync, writeFileSync } from 'node:fs';
const data = readFileSync(new URL('../web/preview-data.json', import.meta.url), 'utf8');
const tpl = readFileSync(new URL('../web/preview.template.html', import.meta.url), 'utf8');
writeFileSync(new URL('../web/setup-preview.html', import.meta.url), tpl.replace('__DATA__', data.replace(/</g, '\\u003c')));
console.log('built web/setup-preview.html');
