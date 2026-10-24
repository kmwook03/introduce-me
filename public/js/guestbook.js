(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const form = byId('guestbook-form');
  const name = byId('guestbook-name');
  const message = byId('guestbook-message');
  const submit = byId('guestbook-submit');
  const list = byId('guestbook-list');
  const listStatus = byId('guestbook-list-status');
  const formStatus = byId('guestbook-form-status');
  const more = byId('guestbook-more');
  const refresh = byId('guestbook-refresh');
  let nextCursor = null;
  let loading = false;
  let loadFinished = Promise.resolve();
  let submitting = false;
  const seen = new Set();

  function status(node, text, error = false) {
    node.textContent = text;
    node.classList.toggle('is-error', error);
  }

  for (const [input, counter, max] of [[name, 'name-count', 40], [message, 'message-count', 1000]]) {
    const validate = () => {
      const length = [...input.value.trim()].length;
      byId(counter).textContent = `${length.toLocaleString()} / ${max.toLocaleString()}`;
      const valid = length >= 1 && length <= max;
      input.setCustomValidity(valid ? '' : `공백을 제외하고 1~${max}자까지 입력해주세요.`);
      input.setAttribute('aria-invalid', String(!valid && input.value.length > 0));
    };
    input.addEventListener('input', validate);
    validate();
  }

  async function request(url, options) {
    let response;
    try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'); }
    let body;
    try { body = await response.json(); }
    catch { throw new Error('서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.'); }
    if (!response.ok) throw new Error(body.error?.message || '요청을 처리할 수 없습니다. 다시 시도해주세요.');
    return body;
  }

  function entryNode(entry) {
    const item = document.createElement('li');
    item.className = 'guestbook-entry';
    const header = document.createElement('div');
    header.className = 'guestbook-entry-header';
    const author = document.createElement('strong');
    author.textContent = entry.name;
    const time = document.createElement('time');
    time.dateTime = entry.created_at;
    time.textContent = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.created_at));
    const content = document.createElement('p');
    content.textContent = entry.message;
    header.append(author, time);
    item.append(header, content);
    return item;
  }

  async function load(reset = false) {
    if (loading) return;
    loading = true;
    let finish;
    loadFinished = new Promise(resolve => { finish = resolve; });
    list.setAttribute('aria-busy', 'true');
    refresh.disabled = true;
    more.disabled = true;
    status(listStatus, '방명록을 불러오는 중입니다.');
    try {
      const query = !reset && nextCursor ? `&before=${encodeURIComponent(nextCursor)}` : '';
      const data = await request(`/api/guestbook?limit=20${query}`);
      if (reset) { list.replaceChildren(); seen.clear(); }
      for (const entry of data.items) {
        if (!seen.has(entry.id)) { seen.add(entry.id); list.append(entryNode(entry)); }
      }
      nextCursor = data.nextCursor;
      more.hidden = !nextCursor;
      status(listStatus, seen.size ? '' : '아직 남겨진 글이 없습니다. 첫 이야기를 남겨주세요.');
    } catch (error) {
      status(listStatus, `${error.message} ‘새로고침’으로 다시 불러올 수 있습니다.`, true);
    } finally {
      loading = false;
      list.setAttribute('aria-busy', 'false');
      refresh.disabled = false;
      more.disabled = false;
      finish();
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    submitting = true;
    submit.disabled = true;
    submit.textContent = '글을 남기는 중…';
    // Preserve the submitted values while the request is pending.
    name.readOnly = true;
    message.readOnly = true;
    status(formStatus, '글을 저장하는 중입니다.');
    try {
      const entry = await request('/api/guestbook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.value.trim(), message: message.value.trim() }),
      });
      // Let any earlier list request finish before inserting the newly saved entry.
      await loadFinished;
      message.value = '';
      message.dispatchEvent(new Event('input'));
      // Prepending preserves an in-flight pagination cursor and avoids duplicate entries.
      if (!seen.has(entry.id)) { seen.add(entry.id); list.prepend(entryNode(entry)); }
      if (!loading) status(listStatus, '');
      status(formStatus, '글을 남겼습니다. 방문해주셔서 감사합니다.');
    } catch (error) { status(formStatus, error.message, true); }
    finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = '글 남기기';
      name.readOnly = false;
      message.readOnly = false;
    }
  });
  more.addEventListener('click', () => void load());
  refresh.addEventListener('click', () => void load(true));
  void load(true);
})();
