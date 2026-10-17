import { Alert } from 'react-native';

// Only the app's cooldown uses this popup. Quota/network errors keep their own handling.
export function isAICooldown(error) {
  return error?.code === 'AI_COOLDOWN';
}

export function showAICooldown(error) {
  if (!isAICooldown(error)) return false;
  const message = typeof error.message === 'string' && error.message.trim()
    ? error.message
    : 'Vui lòng chờ một chút trước khi gửi yêu cầu AI tiếp theo.';
  Alert.alert('AI đang trong thời gian chờ', message, [{ text: 'Đã hiểu' }], { cancelable: true });
  return true;
}
