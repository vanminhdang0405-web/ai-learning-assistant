import * as SecureStore from 'expo-secure-store';

// Thay bằng IPv4 của máy tính đang chạy backend.
const API_URL = 'http://10.7.148.69:3000/api';
const TOKEN_KEY = 'auth_token';

async function request(path, { method = 'GET', body, token } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const headers = {
      Accept: 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

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