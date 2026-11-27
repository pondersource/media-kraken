const core = 'https://atomicdata.dev/properties/';
const prefix = 'media-kraken-movie/v1:';

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

async function movies(store) {
  const {table, rowClass} = await store.getData();
  if (!table || !rowClass) throw new Error('Media Kraken needs a movie table.');

  function parse(row) {
    if (row.error) throw new Error('Atomic could not read a movie.');
    const data = row.get(core + 'description');
    if (row.get(core + 'parent') !== table || !row.get(core + 'isA')?.includes(rowClass) ||
        typeof data !== 'string' || !data.startsWith(prefix)) return;
    return {...JSON.parse(data.slice(prefix.length)), title: row.get(core + 'name'), subject: row.subject};
  }

  return {
    async list() {
      const subjects = await store.query({property: core + 'parent', value: table});
      if (subjects.length >= 500) throw new Error('This version supports fewer than 500 rows.');
      const all = [];
      for (let offset = 0; offset < subjects.length; offset += 100) {
        const batch = await store.getMany(subjects.slice(offset, offset + 100));
        all.push(...batch.map(parse).filter(Boolean));
      }
      return all.sort((a, b) => a.title.localeCompare(b.title));
    },
    async add(title, year) {
      await store.newResource({
        parent: table,
        isA: [rowClass],
        propVals: {
          [core + 'name']: title,
          [core + 'description']: prefix + JSON.stringify({year, watchedAt: null})
        }
      });
    },
    async mark(subject, watched) {
      const row = await store.getResource(subject);
      const movie = parse(row);
      if (!movie) throw new Error('That movie is outside this collection.');
      const data = {year: movie.year, watchedAt: watched ? new Date().toISOString() : null};
      row.set(core + 'description', prefix + JSON.stringify(data));
      await row.save();
    },
    async remove(subject) {
      const row = await store.getResource(subject);
      if (!parse(row)) throw new Error('That movie is outside this collection.');
      await row.destroy();
    }
  };
}

export async function view({root, store}) {
  const collection = await movies(store);
  const main = element('main');
  const style = element('style', `
    main { max-width: 56rem; margin: auto; padding: 1.25rem; font: 1rem system-ui; }
    fieldset { display: grid; gap: .55rem; }
    label { display: block; }
    input, button { font: inherit; padding: .4rem; }
    button { margin: .25rem .5rem .25rem 0; }
    ul { list-style: none; padding: 0; }
    li { border-top: 1px solid #8886; padding-block: .6rem; }
    h3 { font-size: 1rem; margin: 0; }
  `);
  const fields = element('fieldset');
  fields.append(element('legend', 'Add a movie'));
  const title = element('input');
  const titleLabel = element('label', 'Title');
  titleLabel.append(title);
  const year = element('input');
  year.type = 'number';
  year.min = '1800';
  year.max = '2199';
  const yearLabel = element('label', 'Release year (optional)');
  yearLabel.append(year);
  const add = element('button', 'Add to Watch later');
  fields.append(titleLabel, yearLabel, add);
  const status = element('p');
  status.setAttribute('role', 'status');
  const filterLabel = element('label', 'Filter movies');
  const filter = element('input');
  filter.type = 'search';
  filterLabel.append(filter);
  const later = element('ul');
  const watched = element('ul');
  main.append(element('h1', 'Media Kraken'), fields, status, filterLabel,
    element('h2', 'Watch later'), later, element('h2', 'Watched'), watched);
  root.replaceChildren(style, main);

  let all = [];
  let busy = false;

  function render() {
    later.replaceChildren();
    watched.replaceChildren();
    const query = filter.value.trim().toLocaleLowerCase();
    for (const movie of all) {
      const label = movie.title + (movie.year ? ' (' + movie.year + ')' : '');
      if (!label.toLocaleLowerCase().includes(query)) continue;
      const row = element('li');
      const mark = element('button', movie.watchedAt ? 'Move to Watch later' : 'Mark watched');
      mark.addEventListener('click', () => run(() => collection.mark(movie.subject, !movie.watchedAt)));
      const remove = element('button', 'Remove');
      remove.addEventListener('click', () => {
        if (!busy && window.confirm('Remove ' + movie.title + '?')) run(() => collection.remove(movie.subject));
      });
      row.append(element('h3', label));
      if (movie.watchedAt) row.append(element('p', 'Watched ' + new Date(movie.watchedAt).toLocaleDateString()));
      row.append(mark, remove);
      (movie.watchedAt ? watched : later).append(row);
    }
    if (!later.children.length) later.append(element('li', 'No matching movies.'));
    if (!watched.children.length) watched.append(element('li', 'No matching movies.'));
  }

  async function run(operation) {
    if (busy) return;
    busy = fields.disabled = true;
    status.textContent = '';
    try {
      await operation();
      all = await collection.list();
      render();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = fields.disabled = false;
    }
  }

  filter.addEventListener('input', render);
  add.addEventListener('click', () => run(async () => {
    const value = title.value.trim();
    if (!value) throw new Error('Enter a movie title.');
    if (!year.validity.valid) throw new Error('Enter a valid release year.');
    await collection.add(value, year.value ? year.valueAsNumber : null);
    title.value = '';
    year.value = '';
  }));
  await run(async () => {});
}
