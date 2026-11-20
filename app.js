const $ = id => document.getElementById(id);
const clean = value => (value || '').replace(/\s+/g, ' ').trim();
const words = text => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
const storedKey = 'folio-studies-v1';
let studies;
try { studies = JSON.parse(localStorage.getItem(storedKey) || '[]'); } catch { studies = []; }
let current, editingReference, pdfURL;
const general = {personal: '', references: [], include: false};
try { Object.assign(general, JSON.parse(localStorage.getItem('folio-general') || '{}')); } catch {}
const noteData = () => current || general;

function save() {
  try {
    localStorage.setItem(storedKey, JSON.stringify(studies));
    localStorage.setItem('folio-general', JSON.stringify(general));
    return true;
  } catch {
    const status = $('notes').hidden ? $('status') : $('notes-status');
    status.textContent = 'Browser storage is unavailable. Changes are available in this session.';
    status.classList.add('error');
    return false;
  }
}

function el(tag, text, parent, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  parent?.append(node);
  return node;
}
function button(text, parent, callback) {
  const node = el('button', text, parent);
  node.type = 'button';
  node.onclick = callback;
  return node;
}
function httpURL(value, base) {
  try {
    const url = new URL(value, base);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {}
  return '';
}
function link(text, url, parent) {
  const node = el(url ? 'a' : 'span', text, parent);
  if (url) Object.assign(node, {href: url, target: '_blank', rel: 'noopener noreferrer'});
}
function show(view) {
  for (const tab of document.querySelectorAll('[data-view]')) {
    const active = tab.dataset.view === view;
    $(tab.dataset.view).hidden = !active;
    if (active) {
      tab.setAttribute('aria-current', 'page');
      $('crumb').textContent = tab.textContent.trim().replace(/^[^\p{L}]+/u, '');
    } else tab.removeAttribute('aria-current');
  }
  if (view === 'library') renderSaved();
  if (view === 'notes') renderNotes();
  if (view === 'religion') renderReligion();
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-view]').forEach(tab => tab.onclick = () => show(tab.dataset.view));

function parseTable(table) {
  const grid = [];
  const sourceRows = [...table.rows].filter(row => row.parentElement.tagName !== 'TFOOT');
  const rows = sourceRows.slice(0, 250);
  let clipped = sourceRows.length > rows.length;
  rows.forEach((row, index) => {
    grid[index] ||= [];
    let column = 0;
    for (const cell of row.cells) {
      while (grid[index][column] !== undefined) column++;
      const width = Math.min(cell.colSpan, 50 - column);
      if (width < cell.colSpan) clipped = true;
      if (width <= 0) break;
      const height = cell.rowSpan === 0 ? rows.length - index : cell.rowSpan;
      for (let y = index; y < Math.min(rows.length, index + height); y++) {
        grid[y] ||= [];
        for (let x = column; x < column + width; x++) grid[y][x] = clean(cell.textContent);
      }
      column += width;
    }
  });
  const width = Math.max(0, ...grid.map(row => row.length));
  if (!width) return null;
  const filled = grid.map(row => Array.from({length: width}, (_, index) => row[index] || ''));
  const headerCount = table.tHead?.rows.length || (rows[0]?.querySelector('th') ? 1 : 0);
  const headers = Array.from({length: width}, (_, index) =>
    [...new Set(filled.slice(0, headerCount).map(row => row[index]).filter(Boolean))].join(' / ') || 'Column ' + (index + 1));
  return {
    headers, rows: filled.slice(headerCount),
    caption: clean(table.caption?.textContent),
    footnote: [...(table.tFoot?.rows || [])].map(row => clean(row.textContent)).join(' '),
    partial: clipped
  };
}

function readPage(payload) {
  const template = document.createElement('template');
  template.innerHTML = payload.html;
  const root = template.content;
  const meta = (...names) => {
    for (const name of names) {
      const value = root.querySelector('meta[property="' + name + '"],meta[name="' + name + '"]')?.content;
      if (value) return clean(value);
    }
    return '';
  };
  const publisher = meta('og:site_name', 'publisher') || new URL(payload.url).hostname;
  const author = meta('author', 'article:author', 'citation_author') || clean(root.querySelector('[rel=author], [itemprop=author]')?.textContent);
  const date = meta('article:published_time', 'datePublished', 'citation_publication_date') ||
    root.querySelector('article time[datetime],main time[datetime]')?.dateTime || '';
  const title = meta('og:title', 'citation_title') || clean(root.querySelector('h1')?.textContent || root.querySelector('title')?.textContent);
  root.querySelectorAll('script,style,noscript,nav,aside,footer,form,dialog,iframe,template,svg,[role=navigation],[aria-hidden=true],[hidden],.cookie-banner,.advertisement,.related-posts,.sidebar').forEach(node => node.remove());
  const candidates = [...root.querySelectorAll('article,main,[role=main]')];
  const weight = node => [...node.querySelectorAll('p,pre,table')].reduce((total, item) => total + clean(item.textContent).length, 0);
  const scope = candidates.map(node => ({node, score: weight(node)}))
    .sort((a, b) => b.score - a.score)[0]?.node || root;
  let section = '', anchor = '';
  const blocks = [];
  for (const node of scope.querySelectorAll('h2,h3,h4,p,li,blockquote,pre,dt,dd')) {
    if (node.closest('table') || node.parentElement?.closest('li,blockquote,pre')) continue;
    const value = node.tagName === 'PRE' ? node.textContent.trim() : clean(node.textContent);
    if (!value) continue;
    if (/^H[234]$/.test(node.tagName)) {
      section = value;
      anchor = node.id || node.querySelector('[id]')?.id || (node.parentElement?.tagName === 'SECTION' ? node.parentElement.id : '');
    } else if (value.length >= 12) {
      blocks.push({section, anchor, text: value, quote: node.tagName === 'BLOCKQUOTE' || node.tagName === 'PRE'});
    }
  }
  const tables = [...scope.querySelectorAll('table')].filter(table => !table.parentElement?.closest('table')).map(parseTable).filter(Boolean);
  if (blocks.reduce((sum, block) => sum + block.text.length, 0) < 160 && !tables.length) {
    throw new Error('There is too little readable article text. The page may require JavaScript or a sign-in.');
  }
  return {title, publisher, author, date, url: payload.url, blocks, tables, mode: payload.partial ? 'Partial webpage extraction' : 'Webpage extraction'};
}
function readPaste(text, title, url, mode = 'Pasted text · coverage unverified') {
  const parts = text.trim().split(/\n+/).map(clean).filter(Boolean);
  const tables = [];
  const blocks = [];
  const cells = line => line.replace(/^\||\|$/g, '').split('|').map(clean);
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    const separator = parts[i + 1];
    if (line.includes('|') && separator?.includes('|') && cells(separator).every(cell => /^:?-{3,}:?$/.test(cell))) {
      const headers = cells(line);
      const rows = [];
      i++;
      while (parts[i + 1]?.includes('|') && cells(parts[i + 1]).length === headers.length) rows.push(cells(parts[++i]));
      tables.push({headers, rows, caption: '', footnote: '', partial: false});
    } else blocks.push({text: line, anchor: '', section: ''});
  }
  return {title, url, publisher: url ? new URL(url).hostname : '', author: '', date: '', mode, blocks, tables};
}

const stop = new Set(words('the and with that this these from into about what when where which their were have will also could would can focus explain please notes study beginner friendly language point make summarize your based'));
function sentences(text) {
  return [...new Intl.Segmenter('en', {granularity: 'sentence'}).segment(text)].map(item => clean(item.segment)).filter(Boolean);
}
function makeStudy(source, focus) {
  const paragraphs = source.blocks;
  const all = paragraphs.flatMap((block, index) => block.quote ? [] :
    sentences(block.text).filter(text => text.length > 28 && text.length < 450).map(text => ({text, index, block})));
  const frequency = new Map();
  for (const token of words(paragraphs.map(block => block.text).join(' '))) {
    if (token.length > 4 && !stop.has(token)) frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  const topics = [...frequency].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([token]) => token);
  const focusTerms = words(focus).filter(token => token.length > 2 && !stop.has(token));
  const methodology = /method|procedure|experiment/i.test(focus) ? ['method','procedure','experiment','measur','test','step','sample'] : [];
  const matches = value => {
    const tokens = words(value);
    return [...focusTerms, ...methodology].reduce((sum, term) => sum + Number(tokens.some(token => token.startsWith(term))), 0);
  };
  const rank = item => matches(item.text + ' ' + item.block.section) * 9 +
    words(item.text).reduce((sum, word) => sum + Math.min(4, frequency.get(word) || 0), 0) / Math.sqrt(item.text.length) + (item.index < 3 ? 2 : 0);
  const ordered = [...new Map(all.map(item => [item.text, item])).values()].sort((a,b) => rank(b) - rank(a));
  const simple = /beginner|simple|plain language/i.test(focus);
  const intro = all.slice(0, simple ? 1 : 2);
  const overview = intro.length ? intro.map(item => item.text).join(' ') : (paragraphs[0]?.text || 'Review the extracted source tables below.');
  const taken = ordered.slice(0, simple ? 4 : 7);
  const sections = [];
  const groups = new Map();
  paragraphs.forEach((block, index) => {
    const key = block.section || 'Source content';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({...block, index});
  });
  for (const [heading, group] of groups) {
    const indices = new Set(group.map(block => block.index));
    const selected = ordered.filter(item => indices.has(item.index)).slice(0, simple ? 2 : 4).sort((a,b) => a.index - b.index);
    const text = selected.map(item => '• ' + item.text).join('\n');
    if (text) sections.push({heading, text});
  }
  const references = taken.slice(0, 4).map(item => {
    const url = source.url ? new URL(source.url) : null;
    if (url && item.block.anchor) url.hash = item.block.anchor;
    return {text: item.text, section: item.block.section, url: url?.href || ''};
  });
  const headings = [...groups.keys()].filter(heading => heading !== 'Source content').slice(0, 3);
  const revision = [
    topics.length ? 'Review the relationship between ' + topics.slice(0, 3).join(', ') + '.' : 'Review the main ideas and the evidence provided.',
    '',
    '1. What is the main claim or idea in this source?',
    '2. What evidence, example, or method supports it?',
    ...headings.map((heading, index) => (index + 3) + '. How would you explain “' + heading + '” in your own words?')
  ].join('\n');
  const title = clean(source.title);
  const usableTitle = title && !/^(home|welcome|untitled|article|index|sign in|login)(\s*[|–—-].*)?$/i.test(title);
  const subject = headings[0] || topics.slice(0, 3).join(', ');
  return {
    id: crypto.randomUUID(), title: usableTitle ? title : subject ? 'Study Notes on ' + subject : 'Study Notes',
    topic: topics.join(', '), source: {title, url: source.url, publisher: source.publisher, author: source.author, date: source.date, mode: source.mode},
    overview, key: taken.map(item => '• ' + item.text).join('\n'), sections,
    tables: source.tables, references, revision, focus,
    focusMatched: !focusTerms.length || taken.some(item => matches(item.text + ' ' + item.block.section)),
    personal: '', links: [], include: false
  };
}

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function activate(study, scroll = true) {
  current = study;
  editingReference = undefined;
  show('workspace');
  renderDocument();
  if (scroll) $('document').scrollIntoView({block: 'start', behavior: 'smooth'});
}
function addStudy(study) {
  studies.unshift(study);
  status('Study document ready.');
  save();
  activate(study);
}
$('source-form').onsubmit = async event => {
  event.preventDefault();
  const url = httpURL($('url').value.trim());
  const text = $('manual').open ? $('article').value.trim() : '';
  if (!url && !text) return status('Enter a public webpage link or paste article text.', true);
  if (text && text.length < 45) return status('Paste at least 45 characters of article text.', true);
  const focus = $('focus').value.trim();
  $('generate').disabled = $('example').disabled = true;
  status(text ? 'Organizing pasted text…' : 'Reading the webpage…');
  try {
    let source;
    if (text) {
      source = readPaste(text.slice(0, 150000), $('manual-title').value, url, text.length > 150000 ? 'Pasted text · truncated' : undefined);
    } else {
      if (staticHosting) throw new Error('This GitHub Pages version uses pasted article text. Open the original article and copy the part you want to study.');
      const response = await fetch('/api/extract', {method:'POST', body:url});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      source = readPage(result);
    }
    addStudy(makeStudy(source, focus));
  } catch (error) {
    status((error.message || 'Extraction failed.') + ' You can paste the article text below.', true);
    $('manual').open = true;
    $('article').focus();
  } finally {
    $('generate').disabled = $('example').disabled = false;
  }
};
$('example').onclick = () => {
  const sample = readPaste(
    'A Mecanum wheel has rollers mounted at an angle around its rim. Four correctly oriented wheels let a mobile robot move forward, sideways, or rotate by changing individual wheel speeds.\n' +
    'Encoders measure wheel rotation. An inertial measurement unit can estimate chassis orientation and help compare commanded motion with actual motion. Slip can increase on an incline, so measuring wheel rotation alone cannot establish how far the robot moved.\n' +
    'A controlled test repeats the same motion command at each slope angle. Log travel distance, heading deviation, and current draw for each trial.\n' +
    '| Measurement | Unit | Purpose |\n| --- | --- | --- |\n| Travel distance | m | Quantify movement error |\n| Heading deviation | ° | Compare orientation stability |\n| Motor current | A | Compare motor load |',
    'Mecanum Wheel Motion and Testing', '', 'Built-in sample');
  addStudy(makeStudy(sample, ''));
};
const metaLine = source => ['Publisher · ' + (source.publisher || 'Unavailable'), 'Author · ' + (source.author || 'Unavailable'), 'Published · ' + (source.date || 'Unavailable')].join('  |  ');

function editable(tag, value, parent, name, update) {
  const node = el(tag, value, parent, 'editable');
  node.contentEditable = 'plaintext-only';
  node.role = 'textbox';
  node.setAttribute('aria-label', name);
  if (tag !== 'h2') node.setAttribute('aria-multiline', 'true');
  node.oninput = () => {
    update(node.innerText);
    save();
  };
  if (tag === 'h2') node.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
  return node;
}

function renderDocument() {
  const doc = $('document');
  doc.hidden = false;
  doc.replaceChildren();
  const study = current;
  const top = el('div', '', doc, 'row spread');
  el('span', study.source.mode, top, 'eyebrow');
  button('Preview & download PDF', top, previewPDF).className = 'primary';
  editable('h2', study.title, doc, 'Study title', value => study.title = clean(value));
  if (study.source.title && study.source.title !== study.title) el('p', 'Source title · ' + study.source.title, doc, 'muted');
  el('p', metaLine(study.source), doc, 'muted');
  if (study.source.url) link(study.source.url, study.source.url, doc);
  if (study.focus) el('p', 'Study focus · ' + study.focus + (study.focusMatched ? '' : ' · No matching terms found'), doc, 'muted');
  el('p', 'Click document text to edit. Source excerpts use the original wording.', doc, 'muted');
  const field = (heading, key) => {
    el('h3', heading, doc);
    editable('div', study[key], doc, heading, value => study[key] = value);
  };
  field('Overview · source excerpts', 'overview');
  if (study.key) field('Key points · source excerpts', 'key');
  if (study.sections.length) {
    el('h3', 'Detailed notes · source excerpts', doc);
    for (const section of study.sections) {
      el('strong', section.heading, doc);
      editable('div', section.text, doc, section.heading, value => section.text = value);
    }
  }
  if (study.tables.length) {
    el('h3', 'Tables and data', doc);
    for (const [index, data] of study.tables.entries()) {
      el('p', (data.caption || 'Source table ' + (index + 1)) + (data.partial ? ' (partial)' : ''), doc);
      const table = el('table', '', el('div', '', doc, 'table-scroll'));
      const header = el('tr', '', el('thead', '', table));
      data.headers.forEach((text, i) => editable('th', text, header, 'Column ' + (i + 1) + ' heading', value => data.headers[i] = value));
      const body = el('tbody', '', table);
      data.rows.forEach((row, r) => {
        const tr = el('tr', '', body);
        row.forEach((text, i) => editable('td', text, tr, 'Row ' + (r + 1) + ', column ' + (i + 1), value => row[i] = value));
      });
      if (data.footnote) el('p', data.footnote, doc, 'muted');
    }
  }
  if (study.references.length) {
    el('h3', 'Writing references', doc);
    for (const ref of study.references) {
      const card = el('div', '', doc, 'study-card');
      el('small', 'Direct source excerpt', card);
      el('p', '“' + ref.text + '”', card);
      link(ref.section || 'Original source', ref.url, card);
      const field = el('div', '', card, 'field');
      const id = 'paraphrase-' + study.references.indexOf(ref);
      const label = el('label', 'Your paraphrase', field);
      label.htmlFor = id;
      const input = el('textarea', '', field);
      input.id = id;
      input.value = ref.paraphrase || '';
      input.placeholder = 'Rewrite the idea in your own words';
      input.oninput = () => { ref.paraphrase = input.value; save(); };
    }
  }
  field('Revision · study prompts', 'revision');
  const actions = el('div', '', doc, 'row');
  button('Notes & references', actions, () => show('notes'));
  button('Explore Quran & Hadith', actions, () => show('religion'));
  button('Save study', actions, () => { if(save()) status('Study saved in this browser.'); });
}

function renderSaved() {
  const container = $('saved');
  container.replaceChildren();
  const query = $('search').value.trim().toLowerCase();
  const matches = studies.filter(study => [study.title, study.topic, study.focus, study.source.url, study.source.publisher].join(' ').toLowerCase().includes(query));
  if (!matches.length) el('p', studies.length ? 'No studies match this search.' : 'Your saved studies will appear here.', container, 'muted');
  for (const study of matches) {
    const card = el('div', '', container, 'study-card');
    el('strong', study.title || 'Untitled study', card);
    if (study.source.url) link(study.source.url, study.source.url, el('p', '', card));
    else el('p', study.source.mode, card, 'muted');
    const actions = el('div', '', card, 'row');
    button('Open', actions, () => activate(study));
    button('Rename', actions, () => {
      const title = window.prompt('Study title', study.title);
      if (title?.trim()) { study.title = title.trim(); save(); renderSaved(); }
    });
    button('Notes', actions, () => {
      current = study;
      editingReference = undefined;
      renderDocument();
      show('notes');
    });
  }
}
$('search').oninput = renderSaved;

function renderNotes() {
  const data = noteData();
  $('notes-context').textContent = current ? 'Attached to ' + (current.title || 'Untitled study') : 'General notes · open a saved study to attach notes to it.';
  $('personal').value = data.personal;
  $('include').disabled = !current;
  $('include').checked = data.include;
  const container = $('refs');
  container.replaceChildren();
  for (const ref of (current ? data.links : data.references)) {
    const card = el('div', '', container, 'study-card');
    link(ref.title || ref.url, ref.url, card);
    if (ref.note) el('p', ref.note, card);
    const actions = el('div', '', card, 'row');
    button('Edit', actions, () => {
      editingReference = ref;
      $('ref-url').value = ref.url;
      $('ref-title').value = ref.title;
      $('ref-note').value = ref.note;
      $('ref-submit').textContent = 'Save reference';
      $('ref-cancel').hidden = false;
      $('ref-url').focus();
    });
    button('Remove', actions, () => {
      const list = current ? data.links : data.references;
      list.splice(list.indexOf(ref), 1);
      if (editingReference === ref) resetReference();
      save();
      renderNotes();
    });
  }
  if (!editingReference) resetReference();
}
function resetReference() {
  editingReference = undefined;
  $('reference-form').reset();
  $('ref-submit').textContent = 'Add reference';
  $('ref-cancel').hidden = true;
}
$('ref-cancel').onclick = resetReference;
$('personal').oninput = () => { noteData().personal = $('personal').value; save(); };
$('include').onchange = () => { noteData().include = $('include').checked; save(); };
$('reference-form').onsubmit = event => {
  event.preventDefault();
  const data = noteData();
  const url = httpURL($('ref-url').value);
  if (!url) { $('notes-status').textContent = 'Enter an HTTP or HTTPS reference URL.'; return; }
  const ref = {url, title: clean($('ref-title').value), note: $('ref-note').value.trim()};
  if (editingReference) Object.assign(editingReference, ref);
  else (current ? data.links : data.references).push(ref);
  if (save()) $('notes-status').textContent = 'Reference saved.';
  resetReference();
  renderNotes();
};

function filename(value) {
  const name = value.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 150);
  return (name || 'Study Notes') + '.pdf';
}

async function createPDF(study) {
  const {PDFDocument, rgb, PDFName, PDFString} = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await (await fetch('./study-font.ttf')).arrayBuffer(), {subset: true});
  const supported = new Set(font.getCharacterSet());
  const normalize = text => [...String(text)].map(char => char === '\n' || supported.has(char.codePointAt(0)) ? char : '□').join('');
  const ink = rgb(.09,.18,.17), green = rgb(.12,.32,.26), border = rgb(.75,.82,.78);
  const width = 595, height = 842, margin = 44, writable = width - margin * 2;
  let page, y;
  function newPage() {
    page = pdf.addPage([width,height]);
    page.drawText('FIKR STUDY DESK', {x:margin,y:height-30,size:8,font,color:green});
    y = height - 60;
  }
  function fits(needed) { if (y - needed < 52) newPage(); }
  function wrap(value, limit, size) {
    const lines = [];
    for (const paragraph of normalize(value).split('\n')) {
      let line = '';
      for (const original of paragraph.split(/\s+/).filter(Boolean)) {
        let word = original;
        if (line && font.widthOfTextAtSize(line + ' ' + word, size) > limit) { lines.push(line); line = ''; }
        if (font.widthOfTextAtSize(word, size) > limit) {
          let piece = '';
          for (const char of word) {
            if (piece && font.widthOfTextAtSize(piece + char, size) > limit) { lines.push(piece); piece = ''; }
            piece += char;
          }
          word = piece;
        }
        line = line ? line + ' ' + word : word;
      }
      lines.push(line);
    }
    return lines;
  }
  function paragraph(text, size = 11, color = ink, url = '') {
    const leading = size + 5;
    for (const line of wrap(text, writable, size)) {
      fits(leading);
      if (line) {
        page.drawText(line, {x:margin,y:y-size,size,font,color});
        if (url) {
          const annotation = pdf.context.obj({
            Type:'Annot', Subtype:'Link', Rect:[margin,y-size-2,margin+font.widthOfTextAtSize(line,size),y+1],
            Border:[0,0,0], A:{Type:'Action',S:'URI',URI:PDFString.of(url)}
          });
          const ref = pdf.context.register(annotation);
          const annotations = page.node.Annots();
          if (annotations) annotations.push(ref);
          else page.node.set(PDFName.of('Annots'), pdf.context.obj([ref]));
        }
      }
      y -= leading;
    }
    y -= 5;
  }
  function heading(value) {
    fits(52);
    y -= 7;
    paragraph(value, 16, green);
  }
  function table(data) {
    const perPanel = 5;
    for (let start = 0; start < data.headers.length; start += perPanel) {
      const end = Math.min(start + perPanel, data.headers.length);
      const columnWidth = writable / (end - start);
      const cellLines = cells => cells.slice(start,end).map(cell => wrap(cell,columnWidth - 12,9));
      const headers = cellLines(data.headers);
      const rowHeight = lines => Math.max(...lines.map(cell => cell.length),1) * 12 + 12;
      function drawRow(lines, header) {
        const h = rowHeight(lines);
        lines.forEach((cell, col) => {
          const x = margin + col * columnWidth;
          page.drawRectangle({x,y:y-h,width:columnWidth,height:h,borderWidth:.5,borderColor:border,color:header ? rgb(.89,.94,.9) : rgb(1,1,1)});
          cell.forEach((line, i) => {
            if (line) page.drawText(line,{x:x+6,y:y-15-i*12,size:9,font,color:ink});
          });
        });
        y -= h;
      }
      const headerParts = [];
      const headerLines = Math.max(...headers.map(cell => cell.length));
      for (let i = 0; i < headerLines; i += 12) headerParts.push(headers.map(cell => cell.slice(i,i+12)));
      const repeat = () => {
        for (const part of headerParts) {
          fits(rowHeight(part));
          drawRow(part, true);
        }
      };
      if (data.headers.length > perPanel) paragraph('Columns ' + (start + 1) + '–' + end + ' of ' + data.headers.length, 9, green);
      fits(rowHeight(headerParts[0]) + 34);
      repeat();
      for (const row of data.rows) {
        const lines = cellLines(row);
        const count = Math.max(...lines.map(cell => cell.length),1);
        for (let offset = 0; offset < count;) {
          if (y < 80) { newPage(); repeat(); }
          if (y < 80) newPage();
          const maxLines = Math.max(1, Math.floor((y - 64)/12));
          const part = lines.map(cell => cell.slice(offset, offset + maxLines));
          drawRow(part, false);
          offset += maxLines;
        }
      }
      y -= 12;
    }
  }
  newPage();
  pdf.setTitle(study.title || 'Study Notes');
  paragraph(study.title || 'Study Notes', 25, green);
  if (study.source.title && study.source.title !== study.title) paragraph('Source title · ' + study.source.title);
  paragraph(study.source.mode + '\n' + metaLine(study.source), 9, green);
  if (study.source.url) paragraph(study.source.url, 9, green, study.source.url);
  if (study.focus) paragraph('Study focus · ' + study.focus + (study.focusMatched ? '' : ' · No matching terms found'), 10);
  heading('Overview · source excerpts'); paragraph(study.overview);
  if (study.key) { heading('Key points · source excerpts'); paragraph(study.key); }
  if (study.sections.length) {
    heading('Detailed notes · source excerpts');
    for (const section of study.sections) { fits(46); paragraph(section.heading,12,green); paragraph(section.text); }
  }
  if (study.tables.length) {
    heading('Tables and data');
    study.tables.forEach((entry,index) => {
      fits(72);
      paragraph((entry.caption || 'Source table ' + (index + 1)) + (entry.partial ? ' (partial)' : ''),12,green);
      table(entry);
      if (entry.footnote) paragraph(entry.footnote,9);
    });
  }
  if (study.references.length) {
    heading('Writing references');
    for (const ref of study.references) {
      paragraph('Direct excerpt · “' + ref.text + '”');
      if (ref.paraphrase) paragraph('Paraphrase · ' + ref.paraphrase);
      if (ref.url) paragraph(ref.section || 'Original source',10,green,ref.url);
    }
  }
  heading('Revision · study prompts'); paragraph(study.revision);
  if (study.include && (study.personal.trim() || study.links.length)) {
    heading('Personal notes and references');
    if (study.personal.trim()) paragraph(study.personal);
    for (const ref of study.links) {
      paragraph(ref.title || ref.url,10,green,ref.url);
      if (ref.note) paragraph(ref.note);
    }
  }
  addReligionToPDF(study, heading, paragraph, green);
  pdf.getPages().forEach((sheet, index, pages) => sheet.drawText((index+1) + ' / ' + pages.length,{x:width-margin-32,y:27,size:9,font,color:green}));
  return new Blob([await pdf.save()], {type:'application/pdf'});
}
async function previewPDF(event) {
  const trigger = event.currentTarget;
  trigger.disabled = true;
  trigger.textContent = 'Preparing PDF…';
  try {
    const blob = await createPDF(current);
    pdfURL = URL.createObjectURL(blob);
    $('pdf-frame').src = pdfURL;
    $('filename').value = filename(current.title || current.source.title || '');
    $('preview').showModal();
  } catch (error) {
    const message = el('p', 'The PDF could not be generated. ' + error.message, $('document'), 'error');
    message.setAttribute('role','alert');
    message.scrollIntoView({block:'nearest'});
  } finally {
    trigger.disabled = false;
    trigger.textContent = 'Preview & download PDF';
  }
}
$('close-preview').onclick = () => $('preview').close();
$('preview').onclose = () => {
  $('pdf-frame').removeAttribute('src');
  if (pdfURL) URL.revokeObjectURL(pdfURL);
  pdfURL = undefined;
};
$('download').onclick = () => {
  const anchor = document.createElement('a');
  anchor.href = pdfURL;
  anchor.download = filename($('filename').value);
  anchor.click();
};

const religionSources = {
  water: {
    title: 'Al-Anbiya 21:30', url: 'https://quran.com/al-anbiya/30',
    tafsir: 'https://quran.com/21/30/tafsirs',
    arabic: 'وَجَعَلْنَا مِنَ الْمَاءِ كُلَّ شَيْءٍ حَيٍّ',
    translation: '“we made every living thing of water”',
    credit: 'Marmaduke Pickthall · excerpt',
    connection: 'This ayah explicitly connects water and living things. Read the entire ayah and its context when reflecting on the role of water in life.'
  },
  rain: {
    title: 'Al-Furqan 25:48–49', url: 'https://quran.com/al-furqan/48-49',
    tafsir: 'https://quran.com/25/49/tafsirs',
    arabic: 'وَأَنزَلْنَا مِنَ السَّمَاءِ مَاءً طَهُورًا',
    translation: '“and We send down pure rain from the sky”',
    credit: 'Mustafa Khattab, The Clear Quran · excerpt from 25:48',
    connection: 'The passage describes rain giving life to land and providing water for people and animals. Read both ayahs together to see how the passage develops this theme.'
  },
  speech: {
    title: 'Sahih al-Bukhari 2989', url: 'https://sunnah.com/bukhari/56/198',
    arabic: 'وَالْكَلِمَةُ الطَّيِّبَةُ صَدَقَةٌ',
    translation: '“(saying) a good word is also Sadaqa”',
    credit: 'Sunnah.com English translation · excerpt',
    grade: 'Sahih · Sahih al-Bukhari, Book 56, Hadith 198',
    connection: 'The hadith presents kind speech as an act of charity. It can guide a reflection on how we speak to others.'
  },
  verify: {
    title: 'Al-Hujurat 49:6', url: 'https://quran.com/al-hujurat/6',
    tafsir: 'https://quran.com/49/6/tafsirs',
    arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا إِنْ جَاءَكُمْ فَاسِقٌ بِنَبَإٍ فَتَبَيَّنُوا',
    translation: '“If an evil-liver bring you tidings, verify it”',
    credit: 'Marmaduke Pickthall · excerpt',
    connection: 'The ayah calls for verifying certain reports to avoid harming people in ignorance. It invites reflection on how we check information before sharing or acting on it.'
  }
};

const connectionLabel = type => type === 'direct' ? 'Direct topic connection' : 'Thematic reflection';

function religionMatches(claim) {
  const matches = [];
  const add = (key, type) => matches.push({...religionSources[key], type});
  const water = /\b(?:water|ice|snowflakes?)\b/i.test(claim);
  const rain = /\b(?:rain|rainfall|precipitation)\b/i.test(claim);
  const crystal = water && /\b(?:crystals?|crystalli[sz]ation|emoto|molecules?)\b/i.test(claim);
  const waterLife = /\b(?:life|living|organisms?|hydration|survival|ecosystems?)\b/i.test(claim);
  if (water && (waterLife || crystal)) add('water', waterLife && !crystal ? 'direct' : 'theme');
  if (rain || crystal) add('rain', rain && !crystal ? 'direct' : 'theme');
  if (/\b(?:kind words?|good words?|kind speech|good speech|positive words?|negative words?|verbal kindness)\b/i.test(claim)) {
    add('speech', crystal ? 'theme' : 'direct');
  }
  if (/\b(?:misinformation|fact[- ]check\w*|verify\w*|rumou?rs?|false reports?|source credibility|research integrity)\b/i.test(claim)) {
    add('verify', /\b(?:news|rumou?rs?|reports?|misinformation)\b/i.test(claim) ? 'direct' : 'theme');
  }
  const emoto = crystal && /\b(?:emoto|intention\w*|words?|speech|prayer|emotion\w*)\b/i.test(claim);
  return {
    matches,
    evidence: emoto ? {
      title: 'Radin et al. · water crystal experiment',
      text: 'The published experiment compared aesthetic ratings of ice-crystal photographs. It did not measure the shape of individual H₂O molecules or establish that kind words change their shape.',
      url: 'https://journalofscientificexploration.org/index.php/jse/article/view/117'
    } : null
  };
}

function religionData(study) {
  return study.religion ||= {claim:'', searched:'', evidence:'', reflection:'', references:[], include:false};
}

function renderReligion() {
  const select = $('religion-study');
  select.replaceChildren();
  current ||= studies[0];
  if (!current) {
    const option = el('option','No saved studies',select);
    option.value = '';
  }
  for (const study of studies) {
    const option = el('option',study.title || 'Untitled study',select);
    option.value = study.id;
  }
  select.disabled = !current;
  $('religion-empty').hidden = Boolean(current);
  $('religion-tools').hidden = !current;
  $('religion-status').textContent = '';
  $('religion-reference').reset();
  if (!current) return;
  select.value = current.id;
  const data = religionData(current);
  $('religion-claim').value = data.claim || current.title;
  $('religion-evidence').value = data.evidence;
  $('religion-reflection').value = data.reflection;
  $('religion-include').checked = data.include;
  renderReligionResults();
  renderOwnReligionSources();
}

function renderReligionResults() {
  const region = $('religion-results');
  region.replaceChildren();
  const data = religionData(current);
  if (!data.searched) return;
  const {matches, evidence} = religionMatches(data.searched);
  el('h3','Claim or topic examined',region);
  el('p',data.searched,region);
  if (current.source.url) link('Open the study source',current.source.url,region);
  el('h3','Scientific evidence',region);
  if (evidence) {
    el('p',evidence.text,region);
    link(evidence.title,evidence.url,region);
  } else {
    el('p','This topic has no curated evidence review. Record the study’s findings and limitations below.',region);
  }
  el('h3','Quran and hadith connections',region);
  if (!matches.some(source => source.type === 'direct')) {
    el('p','No direct textual link found in the curated collection.',region,'muted');
  }
  for (const source of matches) {
    const card = el('article','',region,'study-card religion-result');
    el('small',connectionLabel(source.type),card);
    el('h3',source.title,card);
    const arabic = el('p',source.arabic,card,'arabic');
    arabic.lang = 'ar';
    arabic.dir = 'rtl';
    el('p',source.translation,card);
    el('small',source.credit,card);
    if (source.grade) el('p',source.grade,card,'muted');
    el('p',source.connection,card);
    const links = el('div','',card,'row');
    link('Read full text',source.url,links);
    if (source.tafsir) link('Read tafsir',source.tafsir,links);
  }
}

function renderOwnReligionSources() {
  const region = $('religion-own');
  region.replaceChildren();
  const data = religionData(current);
  for (const source of data.references) {
    const card = el('article','',region,'study-card');
    el('small','Your citation · ' + connectionLabel(source.type),card);
    link(source.title,source.url,el('p','',card));
    el('p',source.connection,card);
    button('Remove citation',card,() => {
      data.references.splice(data.references.indexOf(source),1);
      saveReligion();
      renderOwnReligionSources();
    });
  }
}
function saveReligion(message = 'Reflection saved in this browser.') {
  $('religion-status').textContent = save() ? message : 'Browser storage is unavailable. Changes are available in this session.';
}
$('religion-study').onchange = () => {
  const study = studies.find(item => item.id === $('religion-study').value);
  if (!study) return;
  current = study;
  resetReference();
  renderDocument();
  renderReligion();
};
$('religion-form').onsubmit = event => {
  event.preventDefault();
  const data = religionData(current);
  data.claim = $('religion-claim').value.trim();
  if (!data.claim) return;
  data.searched = data.claim;
  saveReligion();
  renderReligionResults();
};
for (const [id,key] of [['religion-claim','claim'],['religion-evidence','evidence'],['religion-reflection','reflection']]) {
  $(id).oninput = () => {
    religionData(current)[key] = $(id).value;
    saveReligion();
  };
}
$('religion-include').onchange = () => {
  religionData(current).include = $('religion-include').checked;
  saveReligion();
};
$('religion-reference').onsubmit = event => {
  event.preventDefault();
  const url = httpURL($('religion-url').value);
  const title = clean($('religion-cite').value);
  const connection = $('religion-context').value.trim();
  if (!url || !title || !connection) {
    $('religion-status').textContent = 'Enter a citation, an HTTP or HTTPS link, and how it relates.';
    return;
  }
  religionData(current).references.push({url,title,connection,type:$('religion-type').value});
  $('religion-reference').reset();
  saveReligion('Citation saved.');
  renderOwnReligionSources();
};

function addReligionToPDF(study, heading, paragraph, green) {
  const data = study.religion;
  if (!data?.include) return;
  heading('Religion Space');
  if (data.searched) {
    const result = religionMatches(data.searched);
    paragraph('Claim or topic examined · ' + data.searched);
    if (result.evidence) {
      paragraph(result.evidence.text);
      paragraph(result.evidence.title,10,green,result.evidence.url);
    }
    if (!result.matches.some(source => source.type === 'direct')) {
      paragraph('No direct textual link found in the curated collection.');
    }
    for (const source of result.matches) {
      paragraph(connectionLabel(source.type) + ' · ' + source.title,11,green,source.url);
      paragraph(source.translation + '\n' + source.credit);
      if (source.grade) paragraph(source.grade);
      paragraph(source.connection);
      if (source.tafsir) paragraph('Read tafsir',10,green,source.tafsir);
    }
  }
  if (data.evidence.trim()) paragraph('Your evidence notes\n' + data.evidence);
  if (data.reflection.trim()) paragraph('Your reflection\n' + data.reflection);
  for (const source of data.references) {
    paragraph('Your citation · ' + connectionLabel(source.type) + ' · ' + source.title,11,green,source.url);
    paragraph(source.connection);
  }
}
