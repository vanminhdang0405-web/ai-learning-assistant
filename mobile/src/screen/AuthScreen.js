import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { loginAccount, registerAccount } from '../services/auth';

function AuthForm({ navigation, isRegister }) {
  const headerHeight = useHeaderHeight();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const title = isRegister ? 'Tạo tài khoản' : 'Đăng nhập';

  async function handleSubmit() {
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();

    if (
      !cleanEmail ||
      !password ||
      (isRegister && (!name.trim() || !confirmPassword))
    ) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập đầy đủ các ô.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert('Email chưa hợp lệ', 'Ví dụ: ban@example.com');
      return;
   }

    if (isRegister && password.length < 8) {
      Alert.alert('Mật khẩu quá ngắn', 'Vui lòng dùng ít nhất 8 ký tự.');
      return;
    }

    if (isRegister && password !== confirmPassword) {
      Alert.alert('Mật khẩu không khớp', 'Kiểm tra lại ô nhập lại mật khẩu.');
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        await registerAccount(name.trim(), cleanEmail, password);

        Alert.alert(
          'Đăng ký thành công',
          'Bạn có thể đăng nhập bằng tài khoản vừa tạo.',
          [
            {
              text: 'Đăng nhập',
              onPress: () => navigation.replace('Login'),
            },
          ],
          { cancelable: false }
        );
      } else {
        await loginAccount(cleanEmail, password);

        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        });
      }
    } catch (error) {
      Alert.alert(
        isRegister ? 'Đăng ký chưa thành công' : 'Đăng nhập chưa thành công',
        error.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView
      style={styles.container}
      edges={['left', 'right', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{title}</Text>

          <Text style={styles.subtitle}>
            {isRegister
              ? 'Tạo tài khoản để quản lý tài liệu và quá trình học tập.'
              : 'Đăng nhập để tiếp tục học tập cùng AI Learning Assistant.'}
          </Text>

          {isRegister && (
            <>
              <Text style={styles.label}>Họ và tên</Text>
              <TextInput
                style={styles.input}
                placeholder="Nhập họ và tên"
                placeholderTextColor="#64748B"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                accessibilityLabel="Họ và tên"
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="ban@example.com"
            placeholderTextColor="#64748B"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Email"
          />

          <Text style={styles.label}>Mật khẩu</Text>
          <TextInput
            style={styles.input}
            placeholder={isRegister ? 'Ít nhất 8 ký tự' : 'Nhập mật khẩu'}
            placeholderTextColor="#64748B"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Mật khẩu"
          />

          {isRegister && (
            <>
              <Text style={styles.label}>Nhập lại mật khẩu</Text>
              <TextInput
                style={styles.input}
                placeholder="Nhập lại mật khẩu"
                placeholderTextColor="#64748B"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Nhập lại mật khẩu"
              />
            </>
          )}

          {!isRegister && (
            <Pressable
              accessibilityRole="button"
              style={styles.linkButton}
              onPress={() =>
                Alert.alert(
                  'Quên mật khẩu',
                  'Chức năng gửi email đặt lại mật khẩu sẽ được nối với backend.'
                )
              }
            >
              <Text style={styles.link}>Quên mật khẩu?</Text>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.submitButton,
              (pressed || loading) && styles.pressed,
            ]}
          >
            <Text style={styles.submitText}>
              {loading ? 'Đang xử lý...' : title}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={loading}
            style={styles.linkButton}
            onPress={() =>
              navigation.replace(isRegister ? 'Login' : 'Register')
            }
          >
            <Text style={styles.link}>
              {isRegister
                ? 'Đã có tài khoản? Đăng nhập'
                : 'Chưa có tài khoản? Đăng ký'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function LoginScreen({ navigation }) {
  return <AuthForm navigation={navigation} isRegister={false} />;
}

export function RegisterScreen({ navigation }) {
  return <AuthForm navigation={navigation} isRegister={true} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#172033',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: '#596579',
    marginBottom: 28,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#172033',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#172033',
    marginBottom: 18,
  },
  submitButton: {
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.8,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  linkButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  link: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '600',
  },
});