import * as SecureStore from 'expo-secure-store';

// IPv4 của máy tính đang chạy backend.
const API_URL = 'http://10.7.139.249:3000/api';
const TOKEN_KEY = 'auth_token';

// Gửi yêu cầu JSON hoặc FormData chứa file.
async function request(
  path,
  {
    method = 'GET',
    body,
    token,
    timeoutMs = 15000,
  } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const isFormData =
    typeof FormData !== 'undefined' && body instanceof FormData;

  try {
    const headers = {
      Accept: 'application/json',
    };

    // Với FormData, fetch tự tạo Content-Type kèm multipart boundary.
    if (body !== undefined && !isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      const error = new Error(
        data.message || 'Yêu cầu không thành công.'
      );

      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        'Kết nối quá lâu. Kiểm tra backend và mạng Wi-Fi.'
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        'Không kết nối được backend. Kiểm tra IP và Wi-Fi.'
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Đăng nhập và lưu token.
export async function loginAccount(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  await SecureStore.setItemAsync(TOKEN_KEY, data.token);

  return data.user;
}

// Đăng ký tài khoản.
export function registerAccount(name, email, password) {
  return request('/auth/register', {
    method: 'POST',
    body: { name, email, password },
  });
}

// Lấy thông tin tài khoản đang đăng nhập.
export async function getCurrentUser() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);

  if (!token) {
    return null;
  }

  try {
    const data = await request('/auth/me', { token });
    return data.user;
  } catch (error) {
    if (error.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      return null;
    }

    throw error;
  }
}

// Cập nhật tên hiển thị.
export async function updateProfile(name) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);

  if (!token) {
    const error = new Error('Bạn cần đăng nhập lại.');
    error.status = 401;
    throw error;
  }

  try {
    const data = await request('/auth/me', {
      method: 'PATCH',
      token,
      body: { name },
    });

    return data.user;
  } catch (error) {
    if (error.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }

    throw error;
  }
}

// Đăng xuất.
export function logoutAccount() {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

// Gửi mã đặt lại mật khẩu qua email.
export function requestPasswordReset(email) {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

// Đặt lại mật khẩu bằng mã đã nhận.
export function resetPassword(email, code, newPassword) {
  return request('/auth/reset-password', {
    method: 'POST',
    body: { email, code, newPassword },
  });
}

// Dùng cho các API cần đăng nhập, bao gồm quản lý tài liệu.
export async function authorizedRequest(path, options = {}) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);

  if (!token) {
    const error = new Error(
      'Bạn cần đăng nhập để quản lý tài liệu.'
    );

    error.status = 401;
    throw error;
  }

  try {
    return await request(path, {
      ...options,
      token,
    });
  } catch (error) {
    if (error.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }

    throw error;
  }
}