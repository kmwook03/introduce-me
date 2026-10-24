(() => {
'use strict';
const profile = JSON.parse(document.getElementById('profile-data').textContent);
const setText = (id, value) => { if (value) document.getElementById(id).textContent = value; };
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function githubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function githubLink(value, className, label) {
  const url = githubUrl(value);
  const node = element(url ? 'a' : 'span', `${className} github-link`);
  const icon = element('span', 'github-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" focusable="false"><path d="M12 0C5.37 0 0 5.373 0 12c0 5.302 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.838 1.237 1.838 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.52 11.52 0 0 1 12 5.803c1.02.005 2.047.138 3.004.404 2.291-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.873.12 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .322.216.694.825.576C20.565 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12Z"/></svg>';
  node.append(icon, element('span', '', url ? label : 'GitHub 입력 예정 ↗'));
  if (url) { node.href = url; node.target = '_blank'; node.rel = 'noopener noreferrer'; }
  else node.setAttribute('aria-disabled', 'true');
  return node;
}
if (profile.name) {
  document.querySelectorAll('[data-name]').forEach(node => { node.textContent = profile.name; });
  document.title = `${profile.name} · Portfolio`;
}
setText('intro', profile.intro);
setText('about-copy', profile.about);
setText('school', profile.school);
if (profile.schoolLogo) {
  const logo = element('img', 'school-logo');
  logo.alt = profile.school || '학교 로고';
  logo.decoding = 'async';
  logo.addEventListener('load', () => { document.getElementById('school').replaceChildren(logo); });
  logo.src = profile.schoolLogo;
}
setText('major', profile.major);
const email = (profile.email || '').trim();
if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  const link = element('a', '', email);
  link.href = 'mailto:' + encodeURIComponent(email).replace('%40', '@');
  document.getElementById('contact-email').replaceChildren(link);
  document.getElementById('contact-email').removeAttribute('aria-disabled');
}
try {
  const blog = new URL(profile.blog);
  if (['https:', 'http:'].includes(blog.protocol) && !blog.username && !blog.password) {
    const link = element('a', '', '블로그 방문하기 ↗');
    link.href = blog.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', '블로그 방문하기 (새 탭)');
    document.getElementById('contact-blog').replaceChildren(link);
    document.getElementById('contact-blog').removeAttribute('aria-disabled');
  }
} catch { /* 주소가 없거나 올바르지 않으면 입력 예정 문구를 유지합니다. */ }
document.getElementById('year').textContent = new Date().getFullYear();
document.querySelectorAll('[data-github]').forEach(node => {
  node.replaceWith(githubLink(profile.github, node.className, 'GitHub 방문하기 ↗'));
});
if (profile.photo) {
  const photo = document.getElementById('profile-photo');
  photo.alt = profile.name ? `${profile.name}의 프로필 사진` : '프로필 사진';
  photo.addEventListener('load', () => {
    photo.hidden = false;
    document.getElementById('photo-placeholder').style.visibility = 'hidden';
    setText('photo-caption', profile.name || '프로필 사진');
  });
  photo.addEventListener('error', () => { photo.hidden = true; setText('photo-caption', '사진을 불러올 수 없습니다'); });
  photo.src = profile.photo;
}
const interests = profile.interests.length ? profile.interests : [
  { title: '첫 번째 관심사', description: '관심 있는 분야와 그 분야에 흥미를 느낀 이유를 적어주세요.' },
  { title: '두 번째 관심사', description: '최근 공부하고 있거나 더 깊이 알아보고 싶은 주제를 소개해주세요.' },
  { title: '세 번째 관심사', description: '기술 외에 좋아하는 취미나 일상의 관심사를 적어도 좋아요.' }
];
interests.forEach((item, index) => {
  const article = element('article', 'interest');
  article.append(element('span', 'interest-number mono', String(index + 1).padStart(2, '0')), element('h4', '', item.title));
  if (item.description) article.append(element('p', '', item.description));
  document.getElementById('interest-list').append(article);
});
const skills = profile.skills.length ? profile.skills : [
  { category: 'Languages', items: ['사용하는 프로그래밍 언어'] },
  { category: 'Frameworks & Libraries', items: ['사용하는 프레임워크와 라이브러리'] },
  { category: 'Tools & Platforms', items: ['개발 도구와 플랫폼'] }
];
// HTML에 포함한 SVG 아이콘으로 외부 서비스 없이 기술 배지를 표시합니다.
const skillIcons = {
  'ROS 2': '<svg viewBox="0 0 32 32" fill="#22314e"><circle cx="7" cy="7" r="3"/><circle cx="16" cy="7" r="3"/><circle cx="25" cy="7" r="3"/><circle cx="7" cy="16" r="3"/><circle cx="16" cy="16" r="3"/><circle cx="25" cy="16" r="3"/><circle cx="7" cy="25" r="3"/><circle cx="16" cy="25" r="3"/><circle cx="25" cy="25" r="3"/></svg>',
  'C/C++': '<svg viewBox="0 0 32 32" fill="none"><path d="M16 1 29 8.5v15L16 31 3 23.5v-15Z" fill="#32699a"/><path d="M18 10.7a7 7 0 1 0 0 10.6" stroke="#fff" stroke-width="3"/><path d="M22 13v6m-3-3h6m3-3v6m-3-3h6" stroke="#fff" stroke-width="1.6"/></svg>',
  'Python': '<svg viewBox="0 0 32 32"><path d="M16 2c-7 0-7 2-7 6v3h8v2H6c-5 0-5 13 0 13h3v-5c0-3 2-5 5-5h8c3 0 4-2 4-5V8c0-4-3-6-10-6Z" fill="#3776ab"/><path d="M16 30c7 0 7-2 7-6v-3h-8v-2h11c5 0 5-13 0-13h-3v5c0 3-2 5-5 5h-8c-3 0-4 2-4 5v3c0 4 3 6 10 6Z" fill="#ffd343"/><circle cx="12" cy="7" r="1.3" fill="#fff"/><circle cx="20" cy="25" r="1.3" fill="#fff"/></svg>',
  'Linux': '<svg viewBox="0 0 32 32"><path d="M9 12C9 1 23 1 23 12l3 10c2 7-22 7-20 0Z" fill="#292d32"/><ellipse cx="16" cy="21" rx="7" ry="8" fill="#fafafa"/><ellipse cx="13" cy="10" rx="2.4" ry="3.2" fill="#fff"/><ellipse cx="19" cy="10" rx="2.4" ry="3.2" fill="#fff"/><circle cx="13.5" cy="10.5" r="1" fill="#292d32"/><circle cx="18.5" cy="10.5" r="1" fill="#292d32"/><path d="m12 14 4-3 4 3-4 3Z" fill="#edb536"/><path d="m4 26 7-2 3 5-9 1Zm24 0-7-2-3 5 9 1Z" fill="#edb536"/></svg>',
  'eBPF': '<svg viewBox="0 0 32 32" fill="none"><rect x="8" y="8" width="16" height="16" rx="3" fill="#b87919"/><path d="M12 3v5m8-5v5m-8 16v5m8-5v5M3 12h5m-5 8h5m16-8h5m-5 8h5" stroke="#b87919" stroke-width="2"/><path d="m15 11-3 6h5l-2 5 6-8h-5l2-3" fill="#fff"/></svg>',
  'GNU Binutils': '<svg viewBox="0 0 32 32" fill="none"><path d="M19 4a8 8 0 0 0-8 10L3 22a4 4 0 0 0 6 6l8-8A8 8 0 0 0 27 9l-6 6-5-5 6-6Z" fill="#79528a"/><circle cx="7" cy="25" r="1.5" fill="#fff"/></svg>',
  'QEMU': '<svg viewBox="0 0 32 32" fill="none"><rect x="3" y="4" width="26" height="20" rx="3" fill="#d77b29"/><path d="M12 28h8m-4-4v4M9 10l4 4-4 4m7 0h7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 28h8m-4-4v4" stroke="#d77b29" stroke-width="2"/></svg>',
  'CMake': '<svg viewBox="0 0 32 32"><path d="M16 2 2 29l12-9Z" fill="#387bb2"/><path d="m16 2 2 18 12 9Z" fill="#c64747"/><path d="m14 22-12 7h28l-12-7Z" fill="#4b9859"/></svg>',
  'Raspberry Pi 5': '<svg viewBox="0 0 32 32" fill="none"><rect x="3" y="5" width="26" height="22" rx="3" fill="#467b48"/><rect x="10" y="10" width="11" height="11" rx="1" fill="#293b33"/><path d="M7 8h18" stroke="#d8c57c" stroke-width="2" stroke-dasharray="1 2"/><path d="M25 13h6v5h-6Zm0 7h6v5h-6Z" fill="#c5ceca"/><rect x="8" y="25" width="8" height="5" rx="1" fill="#c5ceca"/><circle cx="6" cy="23" r="1" fill="#d8c57c"/></svg>',
  'STM32': '<svg viewBox="0 0 32 32" fill="none"><rect x="8" y="8" width="16" height="16" rx="2" fill="#28729b"/><path d="M11 3v5m5-5v5m5-5v5M11 24v5m5-5v5m5-5v5M3 11h5m-5 5h5m-5 5h5m16-10h5m-5 5h5m-5 5h5" stroke="#28729b" stroke-width="2"/><path d="m11 16 3 3 7-7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
skills.forEach(group => {
  const row = element('div', 'stack-row');
  const tags = element('div', 'tags');
  group.items.forEach(item => {
    const tag = element('span', profile.skills.length ? 'tag' : 'tag placeholder');
    if (Object.hasOwn(skillIcons, item)) {
      const icon = element('span', 'skill-icon');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = skillIcons[item];
      tag.append(icon);
    }
    tag.append(element('span', '', item));
    tags.append(tag);
  });
  row.append(element('h3', '', group.category), tags);
  document.getElementById('skill-list').append(row);
});
const projects = profile.projects.length ? profile.projects : [
  { name: '첫 번째 프로젝트', description: '프로젝트가 해결하려는 문제, 주요 기능, 내가 맡은 역할을 간단히 소개해주세요.', stack: ['사용 기술'], github: '' },
  { name: '두 번째 프로젝트', description: '직접 만들며 배운 점이나 구현 과정에서 기억에 남는 경험을 소개해주세요.', stack: ['사용 기술'], github: '' }
];
projects.forEach((item, index) => {
  const article = element('article', 'project');
  const art = element('div', 'project-art');
  art.setAttribute('aria-hidden', 'true');
  // 고정된 장식만 SVG로 작성하며, 사용자 입력은 textContent로 처리합니다.
  art.innerHTML = '<svg viewBox="0 0 80 80" fill="none"><rect x="8" y="14" width="64" height="52" rx="4" stroke="currentColor" stroke-width="2"/><path d="M8 26h64M29 38l-9 8 9 8m22-16 9 8-9 8m-8-19-6 22" stroke="currentColor" stroke-width="2"/><circle cx="15" cy="20" r="1.5" fill="currentColor"/><circle cx="21" cy="20" r="1.5" fill="currentColor"/></svg>';
  art.append(element('span', 'project-index mono', 'PROJECT / ' + String(index + 1).padStart(2, '0')));
  const body = element('div', 'project-body');
  const tags = element('div', 'tags');
  (item.stack || []).forEach(tech => tags.append(element('span', 'tag', tech)));
  body.append(element('h3', '', item.name), element('p', '', item.description), tags);
  const link = githubLink(item.github, 'project-link', 'GitHub ↗');
  if (link.tagName === 'A') link.setAttribute('aria-label', `${item.name} GitHub 저장소 (새 탭)`);
  article.append(art, body, link);
  document.getElementById('project-list').append(article);
});
(profile.publications || []).forEach((paper, index) => {
  const article = element('article', 'project publication');
  const art = element('div', 'project-art');
  art.setAttribute('aria-hidden', 'true');
  art.innerHTML = '<svg viewBox="0 0 80 80" fill="none"><path d="M19 8h29l13 14v50H19Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M48 8v15h13M28 34h24M28 42h24M28 50h24M28 58h15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  art.append(element('span', 'project-index mono', 'PAPER / ' + String(index + 1).padStart(2, '0')));
  const body = element('div', 'project-body');
  const title = paper.title || '논문 제목 입력 예정';
  const metadata = [paper.authors, paper.venue, paper.year, paper.pages ? `pp. ${paper.pages}` : ''].filter(Boolean).join(' · ');
  body.append(
    element('span', 'project-kind', paper.role ? `논문 · ${paper.role}` : '논문'),
    element('h3', '', title),
    element('p', 'publication-meta', metadata || '저자 · 학회·학술지 · 발표 연도 입력 예정'),
    element('p', '', paper.description || '연구 주제와 핵심 결과, 본인이 기여한 내용을 간단히 소개해주세요.')
  );
  let paperUrl = null;
  try {
    const url = new URL(paper.url);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) paperUrl = url.href;
  } catch { /* 논문 주소를 입력하기 전에는 링크를 비활성 상태로 표시합니다. */ }
  const link = element(paperUrl ? 'a' : 'span', 'project-link publication-link');
  if (paperUrl && /(^|\.)dbpia\.co\.kr$/.test(new URL(paperUrl).hostname)) {
    const icon = element('img', 'dbpia-icon');
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    // DBpia 공식 favicon을 포함해 외부 이미지 요청 없이 표시합니다.
    icon.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADr0lEQVR4nO2Wf0xVZRjHP+97LhcJLigOQ8DMsX4goqugOSknYSht0Q/WHJszZ8xq06i5fm2trTWXc2ulK82ttWWpRQg1wrZWakguDTapdu+6/GgFkiD3Xu6Vy72Hc885/XHhXEiuuP6QP7rvP+d53vM+z/fzPu973vOKQCDwm8PhKOQGN13X9Z6enp3CNE3zRotPtmAweGVOATRNi8i5Ep9sCYAEwJwD2P7d4XW6UAMBhKIAIKS0nkJKEAKpKKTl5pA8f/602LDXy9CFC7OKCiHJvrcE7HamnQO6qnKkeDWq3z87eUoKd9ftZNWzT4MQAJzfs5fOAx/MGgvgWJLHhk8+jkyrwF/fn7wucYBIKMT5PXuRNhtF22sxNA13fQMAyRkZ3FW3IzrQBNMwrLjupi/xOF1c6eun491905eg63iTZa8/dIC0nJyrhI1IhHO732KwvQOAzoOHWFG7jT+//Y7Q8DAAd9Rsoqj2qRnBTV3H43RNTCIcAwh7vPSd/gGAzIICllVujDv74l0v0FKzGYCQx4M2Oorr6DEApKJQ+OSWuLEep9Oyb3+iOvYV9DQ3Y2ha9EX1Y3ETAAibYtlJaamEPF4GfjwLwNINFaTlXl05gMH2DnpbvgHgzppNLClbF6vAZPmFopD/aNU1AS62nbXsvLVrcX/RYK1z36nTHClejVAUpCIRioJpmAgpCQ0PY+o6+Y9UUbr7TXTTjAKMdHVzufOXiYT3c9OiRXHFw14frsOfTpRCULh1Cyd31EVdKUnOyABMdFVFnxKn+v2YerQnv+phpM2GrmlRgK7G2Oa7rfrxuOL6+DinnnuesM8HwLKHKlF9I4wNDUX9yo2UH3xvxtjWF1/h98/rAQhdHrL6pWkYdDd9BYA9PZ1bK9bPmMDf+wcnajbT33oGgHmZmax543Vcxz6zxqzYtjUuvGK3x0STYrbt75/OMTowAIAjLxf38UaEnNhkpkHY6+PSz+30t56xSijtdsrf348+Ps7FCaCslUXcXFI8o7g64qe35YTlL1xeEAPoami0HI/TRdurr8WdBYA93cED+/eRU7qG9rffsTZfSlYWv374EVJKkBIhBTIpCSEVepu/Juz1ApB7XykLC5db+cThVfeYWjB4TVGA1MXZ3FJWxspntpO6OBtT16lfV07w0uCssQDzFixgacWDlLy0C3t6OgDjqhoRhq5f151w8qc0tU09Yv9LvBociyQupQmABMD/G8AwDF36fL62uRBXVXXM7Xa//A8H3m6OXTZTdQAAAABJRU5ErkJggg==';
    link.append(icon);
  }
  link.append(element('span', '', paperUrl ? '논문 보기 ↗' : '논문 링크 입력 예정 ↗'));
  if (paperUrl) {
    link.href = paperUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${title} 논문 보기 (새 탭)`);
  } else link.setAttribute('aria-disabled', 'true');
  article.append(art, body, link);
  document.getElementById('project-list').append(article);
});

})();
