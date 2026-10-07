import { useEffect, useRef, useState } from 'react';
import {
  Alert, AppState, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { requestPasswordReset, resetPassword } from '../services/auth';

// Giữ khoảng chờ khi người dùng đóng rồi mở lại màn hình trong cùng phiên app.
let nextSendAllowedAt = 0;

function Field({ label, ...props }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor="#64748B"
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
    </>
  );
}

function Action({ title, onPress, disabled, secondary = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        secondary ? styles.linkButton : styles.button,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text style={secondary ? styles.link : styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export default function ForgotPasswordScreen({ navigation, route }) {
  const headerHeight = useHeaderHeight();
  const [email, setEmail] = useState(route.params?.email || '');
  const [sentEmail, setSentEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [sendAt, setSendAt] = useState(nextSendAllowedAt);
  const [now, setNow] = useState(Date.now());
  const working = useRef(false);
  const mounted = useRef(true);
  const remaining = Math.max(0, Math.ceil((sendAt - now) / 1000));

  useEffect(() => {
    mounted.current = true;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', tick);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  function startCooldown(seconds) {
    nextSendAllowedAt = Date.now() + seconds * 1000;
    if (mounted.current) {
      setSendAt(nextSendAllowedAt);
      setNow(Date.now());
    }
  }

  async function handleSend() {
    if (working.current || Date.now() < nextSendAllowedAt) return;
    const cleanEmail = sentEmail || email.trim().toLowerCase();
    if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert('Email chưa hợp lệ', 'Vui lòng nhập email đã đăng ký.');
      return;
    }
    working.current = true;
    setBusy('send');
    try {
      const data = await requestPasswordReset(cleanEmail);
      startCooldown(60);
      if (!mounted.current) return;
      setEmail(cleanEmail);
      setSentEmail(cleanEmail);
      setCode('');
      setNotice(data.message);
    } catch (error) {
      if (error.status === 429) startCooldown(15 * 60);
      if (mounted.current) Alert.alert('Chưa gửi được yêu cầu', error.message);
    } finally {
      working.current = false;
      if (mounted.current) setBusy('');
    }
  }

  async function handleReset() {
    if (working.current || !sentEmail) return;
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Mã chưa hợp lệ', 'Vui lòng nhập đủ 6 chữ số trong email.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Mật khẩu quá ngắn', 'Vui lòng dùng ít nhất 8 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mật khẩu không khớp', 'Kiểm tra ô nhập lại mật khẩu mới.');
      return;
    }
    working.current = true;
    setBusy('reset');
    let succeeded = false;
    try {
      const data = await resetPassword(sentEmail, code, password);
      succeeded = true;
      if (!mounted.current) return;
      setCode('');
      setPassword('');
      setConfirmPassword('');
      setBusy('done');
      Alert.alert('Đặt lại mật khẩu thành công', data.message, [
        {
          text: 'Về đăng nhập',
          onPress: () => navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          }),
        },
      ], { cancelable: false });
    } catch (error) {
      if (mounted.current) Alert.alert('Chưa đặt lại được mật khẩu', error.message);
    } finally {
      if (!succeeded) {
        working.current = false;
        if (mounted.current) setBusy('');
      }
    }
  }

  function changeEmail() {
    if (working.current) return;
    setSentEmail('');
    setCode('');
    setPassword('');
    setConfirmPassword('');
    setNotice('');
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Quên mật khẩu</Text>
          <Text style={styles.subtitle}>
            {sentEmail
              ? 'Nhập mã trong email mới nhất và tạo mật khẩu mới.'
              : 'Nhập email đã đăng ký để yêu cầu mã đặt lại mật khẩu.'}
          </Text>

          <Field label="Email" value={email} onChangeText={setEmail}
            placeholder="ban@example.com" keyboardType="email-address"
            maxLength={254} editable={!busy && !sentEmail} />

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          {sentEmail ? (
            <>
              <Field label="Mã xác nhận" value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 chữ số" keyboardType="number-pad"
                maxLength={6} editable={!busy} />
              <Field label="Mật khẩu mới" value={password} onChangeText={setPassword}
                placeholder="Ít nhất 8 ký tự" secureTextEntry editable={!busy} />
              <Field label="Nhập lại mật khẩu mới" value={confirmPassword}
                onChangeText={setConfirmPassword} placeholder="Nhập lại mật khẩu"
                secureTextEntry editable={!busy} />
              <Text style={styles.hint}>
                Mã có hạn 10 phút. Kiểm tra cả thư Spam nếu chưa thấy email.
              </Text>
              <Action title={busy === 'reset' ? 'Đang đặt lại...' : 'Đặt lại mật khẩu'}
                onPress={handleReset} disabled={!!busy} />
              <Action secondary
                title={busy === 'send' ? 'Đang gửi yêu cầu...'
                  : remaining > 0 ? `Gửi lại sau ${remaining}s` : 'Gửi lại mã'}
                onPress={handleSend} disabled={!!busy || remaining > 0} />
              <Action secondary title="Đổi email" onPress={changeEmail} disabled={!!busy} />
            </>
          ) : (
            <Action
              title={busy === 'send' ? 'Đang gửi yêu cầu...'
                : remaining > 0 ? `Gửi mã sau ${remaining}s` : 'Gửi mã xác nhận'}
              onPress={handleSend} disabled={!!busy || remaining > 0} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' },
  content: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '700', color: '#172033', marginBottom: 10 },
  subtitle: { fontSize: 15, lineHeight: 23, color: '#596579', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#172033', marginBottom: 8 },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#172033', marginBottom: 18,
  },
  notice: {
    backgroundColor: '#DBEAFE', color: '#1E40AF', padding: 14,
    borderRadius: 12, lineHeight: 22, marginBottom: 20,
  },
  hint: { color: '#596579', lineHeight: 22, marginBottom: 16 },
  button: { backgroundColor: '#1D4ED8', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  linkButton: { paddingVertical: 14, alignItems: 'center' },
  link: { color: '#1D4ED8', fontSize: 14, fontWeight: '600' },
  dimmed: { opacity: 0.5 },
});