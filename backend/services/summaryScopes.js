const { createHash } = require('node:crypto');

function fail(status, message) {
  return Object.assign(new Error(message), { status, code: 'INVALID_SUMMARY_SCOPE' });
}

// Heuristics only: titles are suggestions, never instructions sent to AI.
function headingDepth(line) {
  const text = line.trim();
  if (!text || text.length > 160 || /\.{3,}\s*\d+\s*$/.test(text)) return null;
  const markdown = /^(#{1,6})\s+\S/.exec(text);
  if (markdown) return markdown[1].length;
  if (/^(?:chương|chapter|phần|part)\s+(?:\d+|[IVXLCDM]+)(?:\s|[.:-]|$)/iu.test(text)) return 1;
  if (/^(?:mục|section)\s+(?:\d+(?:\.\d+)*|[IVXLCDM]+)(?:\s|[.:-]|$)/iu.test(text)) return 2;
  const numbered = /^(\d+(?:\.\d+)*)(?:[.)]\s+|\s+)(\p{L}.*)$/u.exec(text);
  if (numbered && !/[;.!?]$/.test(numbered[2]) && Number(numbered[1].split('.')[0]) < 100) {
    return 2 + (numbered[1].match(/\./g) || []).length;
  }
  return null;
}

function sourceVersion(extraction) {
  if (!extraction) return null;
  return createHash('sha256').update(JSON.stringify({
    status: extraction.status,
    pages: extraction.pages.map(({ pageNumber, text }) => ({ pageNumber, text })),
  })).digest('hex');
}

function findSections(extraction) {
  const headings = [];
  for (const page of extraction?.pages || []) {
    for (const match of page.text.matchAll(/[^\n]+/g)) {
      const depth = headingDepth(match[0]);
      if (depth !== null) headings.push({ page: page.pageNumber, offset: match.index,
        label: match[0].trim().replace(/^#+\s*/, ''), depth });
    }
  }
  // All detected boundaries participate, even when only the first 200 are offered.
  const sections = headings.slice(0, 200).map((heading, index) => {
    let end = null;
    for (let next = index + 1; next < headings.length; next++) {
      if (headings[next].depth <= heading.depth) { end = headings[next]; break; }
    }
    const pages = extraction.pages;
    const last = end && end.offset === 0
      ? pages.findLast(p => p.pageNumber < end.page)?.pageNumber ?? heading.page
      : end?.page ?? pages[pages.length - 1].pageNumber;
    return { key: `section:${heading.page}:${heading.offset}`, kind: 'section', label: heading.label,
      depth: heading.depth, startPage: heading.page, endPage: last,
      startOffset: heading.offset, end: end ? { page: end.page, offset: end.offset } : null };
  });
  return { sections, truncated: headings.length > 200 };
}

function publicScope(scope) {
  const { key, kind, label, startPage, endPage, depth } = scope;
  return { key, kind, label, startPage, endPage, ...(depth ? { depth } : {}) };
}

function resolveScope(extraction, value = 'all', catalog = null) {
  if (typeof value !== 'string' || value.length > 80) throw fail(400, 'Phạm vi tóm tắt không hợp lệ.');
  if (value === 'all') return { scope: { key: 'all', kind: 'all', label: 'Toàn bộ tài liệu',
    startPage: extraction?.pages[0]?.pageNumber || 0, endPage: extraction?.pages.at(-1)?.pageNumber || 0 }, extraction };
  if (!extraction) throw fail(422, 'Hãy trích xuất văn bản trước khi chọn chương hoặc phần.');
  const range = /^range:([1-9]\d{0,5}):([1-9]\d{0,5})$/.exec(value);
  let scope;
  let pages;
  if (range) {
    const start = Number(range[1]), end = Number(range[2]);
    if (start > end || !extraction.pages.some(p => p.pageNumber === start) || !extraction.pages.some(p => p.pageNumber === end)) {
      throw fail(400, 'Khoảng đã chọn không hợp lệ: số bắt đầu phải nhỏ hơn hoặc bằng số kết thúc và nằm trong tài liệu.');
    }
    scope = { key: value, kind: 'range', startPage: start, endPage: end,
      label: `${extraction.sourceUnit === 'part' ? 'Phần văn bản' : 'Trang'} ${start}${end === start ? '' : `–${end}`}` };
    pages = extraction.pages.filter(p => p.pageNumber >= start && p.pageNumber <= end);
  } else if (/^section:[1-9]\d{0,5}:\d{1,7}$/.test(value)) {
    scope = (catalog || findSections(extraction)).sections.find(s => s.key === value);
    if (!scope) throw fail(409, 'Mục đã chọn không còn trong văn bản hiện tại. Chọn Toàn bộ tài liệu để tải lại danh sách.');
    pages = extraction.pages.filter(p => p.pageNumber >= scope.startPage && p.pageNumber <= scope.endPage)
      .map(p => {
        const start = p.pageNumber === scope.startPage ? scope.startOffset : 0;
        const end = p.pageNumber === scope.end?.page ? scope.end.offset : p.text.length;
        const text = p.text.slice(start, end);
        return { ...p, text, charCount: text.length };
      });
  } else throw fail(400, 'Phạm vi tóm tắt không hợp lệ.');
  const selected = { ...extraction, pages, pageCount: pages.length,
    charCount: pages.reduce((sum, p) => sum + p.text.length, 0),
    pagesWithoutText: pages.filter(p => !p.text.trim()).map(p => p.pageNumber) };
  return { scope: publicScope(scope), extraction: selected };
}

module.exports = { sourceVersion, findSections, resolveScope, publicScope };
