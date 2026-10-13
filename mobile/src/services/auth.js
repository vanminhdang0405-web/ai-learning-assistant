import * as SecureStore from 'expo-secure-store';

// Thay bằng IPv4 của máy tính đang chạy backend.
const API_URL = 'http://192.168.1.7:3000/api';
const TOKEN_KEY = 'auth_token';

async function request(
  path,
  { method = 'GET', body, token, timeoutMs = 15000, responseType = 'json' } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  try {
    const headers = {
      Accept: responseType === 'arrayBuffer' ? 'application/pdf' : 'application/json',
    };

    if (body !== undefined && !isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.ok && responseType === 'arrayBuffer') {
      const contentType = response.headers.get('content-type') || '';
      if (!/^application\/pdf(?:;|$)/i.test(contentType)) {
        throw new Error('Backend chưa trả về file PDF. Kiểm tra API tài liệu.');
      }
      return await response.arrayBuffer();
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      const error = new Error(data.message || 'Yêu cầu không thành công.');
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Kết nối quá lâu. Kiểm tra backend và mạng Wi-Fi.');
    }

    if (error instanceof TypeError) {
      throw new Error('Không kết nối được backend. Kiểm tra IP và Wi-Fi.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loginAccount(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  await SecureStore.setItemAsync(TOKEN_KEY, data.token);

  return data.user;
}

export function registerAccount(name, email, password) {
  return request('/auth/register', {
    method: 'POST',
    body: { name, email, password },
  });
}

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

export function logoutAccount() {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function requestPasswordReset(email) {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

export function resetPassword(email, code, newPassword) {
  return request('/auth/reset-password', {
    method: 'POST',
    body: { email, code, newPassword },
  });
}

export async function authorizedRequest(path, options = {}) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) {
    const error = new Error('Bạn cần đăng nhập để quản lý tài liệu.');
    error.status = 401;
    throw error;
  }
  try {
    return await request(path, { ...options, token });
  } catch (error) {
    if (error.status === 401) await SecureStore.deleteItemAsync(TOKEN_KEY);
    throw error;
  }
}