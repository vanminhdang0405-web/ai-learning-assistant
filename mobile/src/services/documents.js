import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { authorizedRequest } from './auth';

const MAX_SIZE = 10 * 1024 * 1024;

function checkedId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error('Mã tài liệu không hợp lệ.');
  }
  return id;
}

const FORMATS = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

function extensionOf(name) {
  const extension = typeof name === 'string' ? name.split('.').pop().toLowerCase() : '';
  if (!Object.hasOwn(FORMATS, extension)) throw new Error('Chỉ hỗ trợ PDF, DOCX và TXT.');
  return extension;
}

function previewFile(id, extension = 'pdf') {
  return new File(Paths.cache, `document-preview-${checkedId(id)}.${extension}`);
}

async function removeCacheFile(file) {
  try {
    await FileSystem.deleteAsync(file.uri, { idempotent: true });
  } catch {
    // Lỗi dọn cache không làm thay đổi kết quả thao tác chính.
  }
}

export async function getDocuments() {
  const data = await authorizedRequest('/documents');
  return data.documents;
}

// Giữ cách chọn URI gốc rồi sao chép vào cache đã chạy được trên Expo Go.
export async function uploadDocument(asset) {
  if (!asset?.uri) throw new Error('Không có đường dẫn file đã chọn.');
  const extension = extensionOf(asset.name);
  if (asset.size > MAX_SIZE) throw new Error('Tài liệu vượt giới hạn 10 MB.');

  const temporaryFile = new File(
    Paths.cache,
    `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
  );
  try {
    try {
      await FileSystem.copyAsync({ from: asset.uri, to: temporaryFile.uri });
    } catch (error) {
      throw new Error(`Không sao chép được tài liệu vào cache: ${error.message}`);
    }
    if (!temporaryFile.exists) {
      throw new Error('Không truy cập được bản sao tài liệu trong cache.');
    }
    if (temporaryFile.size === 0) throw new Error('Bản sao tài liệu đang trống.');
    if (temporaryFile.size > MAX_SIZE) throw new Error('Tài liệu vượt giới hạn 10 MB.');

    const body = new FormData();
    body.append('name', asset.name);
    body.append('file', temporaryFile);
    const data = await authorizedRequest('/documents', {
      method: 'POST', body, timeoutMs: 60000,
    });
    return data.document;
  } finally {
    await removeCacheFile(temporaryFile);
  }
}

export async function openDocument(document, canOpen = () => true) {
  if (Platform.OS !== 'android') {
    throw new Error('Chức năng mở tài liệu ở bản này dành cho Android.');
  }
  const id = checkedId(document.id);
  const extension = extensionOf(document.name);

  // Luôn tải lại qua API có token, không dùng cache để bỏ qua kiểm tra quyền.
  const data = await authorizedRequest(`/documents/${id}/content`, {
    responseType: 'arrayBuffer',
    expectedContentType: FORMATS[extension],
    timeoutMs: 60000,
  });
  if (!canOpen()) return;

  const bytes = new Uint8Array(data);
  if (bytes.length === 0 || bytes.length > MAX_SIZE) {
    throw new Error('Dung lượng tài liệu tải về không hợp lệ.');
  }
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (extension === 'pdf' && !signature.every((value, index) => bytes[index] === value)) {
    throw new Error('Backend chưa trả về nội dung tài liệu hợp lệ.');
  }

  const file = previewFile(id, extension);
  let opened = false;
  try {
    file.create({ overwrite: true });
    await file.write(bytes);
    const contentUri = await FileSystem.getContentUriAsync(file.uri);
    if (!canOpen()) return;
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: FORMATS[extension],
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
      opened = true;
    } catch (error) {
      throw new Error(
        'Không mở được trình đọc tài liệu. Kiểm tra điện thoại có ứng dụng đọc tài liệu, ' +
        `rồi thử lại. Chi tiết: ${error.message}`
      );
    }
  } finally {
    // Giữ bản đã mở trong cache để ứng dụng đọc tài liệu không mất file đang dùng.
    // Mỗi tài liệu chỉ có một bản cache; lần mở sau vẫn xác thực và tải lại.
    if (!opened) await removeCacheFile(file);
  }
}

export async function updateDocument(id, changes) {
  const data = await authorizedRequest(`/documents/${checkedId(id)}`, { method: 'PATCH', body: changes });
  return data.document;
}

export async function deleteDocument(id) {
  const documentId = checkedId(id);
  await authorizedRequest(`/documents/${documentId}`, { method: 'DELETE' });
  await Promise.all(Object.keys(FORMATS).map(ext => removeCacheFile(previewFile(documentId, ext))));
}

// Lấy bản văn bản đã lưu. extraction=null nghĩa là chưa trích xuất.
export async function getDocumentText(id) {
  const data = await authorizedRequest(`/documents/${checkedId(id)}/text`);
  return data.extraction;
}

export async function extractDocumentText(id, force = false) {
  const data = await authorizedRequest(`/documents/${checkedId(id)}/extract`, {
    method: 'POST',
    body: { force },
    timeoutMs: 45000,
  });
  return data.extraction;
}

function checkedSummaryLevel(level) {
  if (!['short', 'medium', 'detailed'].includes(level)) throw new Error('Mức tóm tắt không hợp lệ.');
  return level;
}

function checkedSummaryScope(scope) {
  if (typeof scope !== 'string' || !/^(all|range:[1-9]\d{0,5}:[1-9]\d{0,5}|section:[1-9]\d{0,5}:\d{1,7})$/.test(scope)) {
    throw new Error('Phạm vi tóm tắt không hợp lệ.');
  }
  return scope;
}

// Chọn phạm vi/mức chỉ đọc bản đã lưu, không gọi Gemini.
export function getDocumentSummary(id, level = 'medium', scope = 'all') {
  return authorizedRequest(`/documents/${checkedId(id)}/summary?level=${checkedSummaryLevel(level)}&scope=${encodeURIComponent(checkedSummaryScope(scope))}`);
}

export function summarizeDocument(id, force = false, level = 'medium', scope = 'all', sourceVersion = undefined) {
  return authorizedRequest(`/documents/${checkedId(id)}/summarize`, {
    method: 'POST', body: { force, level: checkedSummaryLevel(level), scope: checkedSummaryScope(scope), sourceVersion }, timeoutMs: 150000,
  });
}
