import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Window } from 'happy-dom';

// Offline source checks. Never fetch URLs, execute site modules or submit forms.
export function checkSite(root) {
  root = resolve(root);
  const errors = [], names = readdirSync(root), documents = new Map();
  const window = new Window({ url: 'https://site-check.invalid/' });
  function reference(source, value) {
    if (!value || value.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return;
    let target;
    try {
      const url = new URL(value, 'https://site-check.invalid/' + source);
      target = resolve(root, '.' + decodeURIComponent(url.pathname));
    } catch { errors.push(`${source}: invalid reference ${value}`);return; }
    if (relative(root,target).startsWith('..')) { errors.push(`${source}: reference outside site ${value}`);return; }
    try { if (!statSync(target).isFile()) throw Error(); }
    catch { errors.push(`${source}: missing local file ${value}`); }
  }
  try {
    for (const name of names.filter(name => name.endsWith('.html'))) {
      const doc = window.document.implementation.createHTMLDocument();
      doc.documentElement.innerHTML = readFileSync(resolve(root,name),'utf8');documents.set(name,doc);
      for (const element of doc.querySelectorAll('[src],[href]')) for (const key of ['src','href']) reference(name,element.getAttribute(key));
      for (const element of doc.querySelectorAll('style')) for (const match of element.textContent.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) reference(name,match[1]);
    }
    for (const name of names.filter(name => name.endsWith('.css'))) {
      const css = readFileSync(resolve(root,name),'utf8');
      for (const match of css.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) reference(name,match[1]);
    }
    for (const name of names.filter(name => name.endsWith('.mjs'))) {
      const js = readFileSync(resolve(root,name),'utf8');
      for (const match of js.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)['"]([.][^'"]+)['"]/g)) reference(name,match[1]);
    }
    for (const directory of ['', 'scripts', 'tests']) {
      for (const name of readdirSync(resolve(root,directory)).filter(name => name.endsWith('.mjs'))) {
        const file = resolve(root,directory,name), result = spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
        if (result.error || result.status !== 0) errors.push(`${relative(root,file)}: JavaScript syntax check failed\n${result.stderr || result.error?.message || ''}`);
      }
    }
  } finally { window.happyDOM.close(); }
  if (errors.length) throw Error(errors.join('\n'));
  return { pages: documents.size };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
  try { const result = checkSite(root);console.log(`PASS local assets, module references and JavaScript syntax (${result.pages} pages).`); }
  catch (error) { console.error(error.message);process.exitCode = 1; }
}
