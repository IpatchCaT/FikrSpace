import {readFileSync, writeFileSync, mkdirSync, copyFileSync} from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const libraries = read('vendor/pdf-lib.min.js') + '\n' + read('vendor/fontkit.js');
const fontPath = 'vendor/DejaVuSans.ttf';
const page = (staticHosting = false) => read('index.html').replace('/* APP_SCRIPT */', () =>
  'const staticHosting = ' + staticHosting + ';\n' + read('app.js'));

mkdirSync('dist/server', {recursive: true});
writeFileSync('dist/server/index.js', read('worker.mjs') +
  '\nconst PAGE = ' + JSON.stringify(page()) + ';\n' +
  'const PDF_JS = ' + JSON.stringify(libraries) + ';\n' +
  'const FONT = ' + JSON.stringify(readFileSync(fontPath).toString('base64')) + ';\n');

mkdirSync('docs', {recursive: true});
writeFileSync('docs/index.html', page(true));
writeFileSync('docs/pdf-lib.js', libraries);
copyFileSync(fontPath, 'docs/study-font.ttf');
writeFileSync('docs/.nojekyll', '');
