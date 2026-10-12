import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { authorizedRequest } from './auth';

const MAX_SIZE = 10 * 1024 * 1024;

export async function getDocuments() {
  const data = await authorizedRequest('/documents');
  return data.documents;
}

export async function uploadDocument(asset) {
  if (!asset?.uri) {
    throw new Error('Không có đường dẫn file đã chọn.');
  }

  if (asset.size > MAX_SIZE) {
    throw new Error('PDF vượt giới hạn 10 MB.');
  }

  // Tạo đường dẫn mới trong cache của ứng dụng.
  const temporaryFile = new File(
    Paths.cache,
    `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
  );

  try {
    // Đọc file được người dùng chọn và tạo bản sao để upload.
    try {
      await FileSystem.copyAsync({
        from: asset.uri,
        to: temporaryFile.uri,
      });
    } catch (error) {
      throw new Error(
        `Không sao chép được PDF vào cache: ${error.message}`
      );
    }

    if (!temporaryFile.exists) {
      throw new Error(
        'Đã gọi sao chép nhưng FileSystem chưa truy cập được bản sao:\n' +
        temporaryFile.uri
      );
    }

    if (temporaryFile.size === 0) {
      throw new Error('Bản sao PDF đang trống.');
    }

    if (temporaryFile.size > MAX_SIZE) {
      throw new Error('PDF vượt giới hạn 10 MB.');
    }

    const body = new FormData();

    // Tên hiển thị giữ nguyên tên file người dùng chọn.
    body.append('name', asset.name);
    body.append('file', temporaryFile);

    const data = await authorizedRequest('/documents', {
      method: 'POST',
      body,
      timeoutMs: 60000,
    });

    return data.document;
  } finally {
    // Chỉ dọn bản sao do hàm này tạo, không xóa file gốc.
    try {
      await FileSystem.deleteAsync(temporaryFile.uri, {
        idempotent: true,
      });
    } catch {
      // Lỗi dọn cache không làm thay đổi kết quả upload.
    }
  }
}

export async function deleteDocument(id) {
  await authorizedRequest(`/documents/${id}`, {
    method: 'DELETE',
  });
}