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

function previewFile(id) {
  return new File(Paths.cache, `document-preview-${checkedId(id)}.pdf`);
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
  if (asset.size > MAX_SIZE) throw new Error('PDF vượt giới hạn 10 MB.');

  const temporaryFile = new File(
    Paths.cache,
    `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
  );
  try {
    try {
      await FileSystem.copyAsync({ from: asset.uri, to: temporaryFile.uri });
    } catch (error) {
      throw new Error(`Không sao chép được PDF vào cache: ${error.message}`);
    }
    if (!temporaryFile.exists) {
      throw new Error('Không truy cập được bản sao PDF trong cache.');
    }
    if (temporaryFile.size === 0) throw new Error('Bản sao PDF đang trống.');
    if (temporaryFile.size > MAX_SIZE) throw new Error('PDF vượt giới hạn 10 MB.');

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
    throw new Error('Chức năng mở PDF ở bản này dành cho Android.');
  }
  const id = checkedId(document.id);

  // Luôn tải lại qua API có token, không dùng cache để bỏ qua kiểm tra quyền.
  const data = await authorizedRequest(`/documents/${id}/content`, {
    responseType: 'arrayBuffer',
    timeoutMs: 60000,
  });
  if (!canOpen()) return;

  const bytes = new Uint8Array(data);
  if (bytes.length === 0 || bytes.length > MAX_SIZE) {
    throw new Error('Dung lượng PDF tải về không hợp lệ.');
  }
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (!signature.every((value, index) => bytes[index] === value)) {
    throw new Error('Backend chưa trả về nội dung PDF hợp lệ.');
  }

  const file = previewFile(id);
  let opened = false;
  try {
    file.create({ overwrite: true });
    await file.write(bytes);
    const contentUri = await FileSystem.getContentUriAsync(file.uri);
    if (!canOpen()) return;
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: 'application/pdf',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
      opened = true;
    } catch (error) {
      throw new Error(
        'Không mở được trình đọc PDF. Kiểm tra điện thoại có ứng dụng đọc PDF, ' +
        `rồi thử lại. Chi tiết: ${error.message}`
      );
    }
  } finally {
    // Giữ bản đã mở trong cache để ứng dụng đọc PDF không mất file đang dùng.
    // Mỗi tài liệu chỉ có một bản cache; lần mở sau vẫn xác thực và tải lại.
    if (!opened) await removeCacheFile(file);
  }
}

export async function deleteDocument(id) {
  const documentId = checkedId(id);
  await authorizedRequest(`/documents/${documentId}`, { method: 'DELETE' });
  await removeCacheFile(previewFile(documentId));
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

// Đọc bản đã lưu không gọi Gemini.
export function getDocumentSummary(id) {
  return authorizedRequest(`/documents/${checkedId(id)}/summary`);
}

export function summarizeDocument(id, force = false) {
  return authorizedRequest(`/documents/${checkedId(id)}/summarize`, {
    method: 'POST', body: { force }, timeoutMs: 75000,
  });
}
