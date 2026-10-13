const TYPES = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
});

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function validateName(value) {
  if (typeof value !== 'string') throw bad('Tên tài liệu không hợp lệ.');
  const name = value.normalize('NFC').trim();
  if (!name || name.length > 200 || /[\\/\x00-\x1f\x7f]/.test(name)) {
    throw bad('Tên tài liệu phải từ 1–200 ký tự, không chứa dấu / hoặc \\.');
  }
  const extension = name.match(/\.([^.]+)$/)?.[1].toLowerCase();
  if (!Object.hasOwn(TYPES, extension || '')) throw bad('Chỉ hỗ trợ PDF, DOCX và TXT. Giữ đuôi file khi đổi tên.');
  if (!name.slice(0, -(extension.length + 1)).trim()) throw bad('Nhập tên trước đuôi file.');
  return { name, extension, mimeType: TYPES[extension] };
}

function validateTopic(value) {
  if (typeof value !== 'string') throw bad('Môn học/chủ đề không hợp lệ.');
  const topic = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (topic.length > 80 || /[\x00-\x1f\x7f]/.test(topic)) throw bad('Môn học/chủ đề tối đa 80 ký tự.');
  return topic;
}

function extensionForMime(mime) {
  return Object.keys(TYPES).find(ext => TYPES[ext] === mime);
}

module.exports = { TYPES, validateName, validateTopic, extensionForMime };
