import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { loginAccount, registerAccount } from '../services/auth';
import { Button, Field, Icon } from '../components/AppUI';
import { colors, ui } from '../theme';

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

  return <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.welcome}><View style={styles.logo}><Icon name="book-open" size={31} color={colors.primary} /></View>
          <Text style={styles.eyebrow}>AI LEARNING ASSISTANT</Text>
          <Text style={styles.title}>{isRegister ? 'Một khởi đầu mới.' : 'Chào mừng trở lại.'}</Text>
          <Text style={styles.subtitle}>{isRegister ? 'Tạo một góc học tập dành riêng cho bạn.' : 'Tiếp tục hành trình khám phá kiến thức của bạn.'}</Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.formTitle}>{title}</Text>
          {isRegister && <Field label="Họ và tên" icon="user" value={name} onChangeText={setName} placeholder="Tên của bạn" autoCapitalize="words" maxLength={100} editable={!loading} />}
          <Field label="Email" icon="mail" value={email} onChangeText={setEmail} placeholder="ban@example.com" keyboardType="email-address" maxLength={254} editable={!loading} />
          <Field label="Mật khẩu" icon="lock" value={password} onChangeText={setPassword} placeholder={isRegister ? 'Ít nhất 8 ký tự' : 'Nhập mật khẩu'} secureTextEntry editable={!loading} />
          {isRegister && <Field label="Nhập lại mật khẩu" icon="lock" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Nhập lại mật khẩu" secureTextEntry editable={!loading} />}
          {!isRegister && <Pressable accessibilityRole="button" disabled={loading} style={styles.forgot}
            onPress={() => navigation.navigate('ForgotPassword', { email: email.trim().toLowerCase() })}><Text style={styles.link}>Quên mật khẩu?</Text></Pressable>}
          <Button label={loading ? 'Đang xử lý…' : title} icon="arrow-right" loading={loading} onPress={handleSubmit} />
        </View>
        <View style={styles.switchRow}><Text style={styles.switchText}>{isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}</Text>
          <Pressable accessibilityRole="button" disabled={loading} style={styles.switchButton} onPress={() => navigation.replace(isRegister ? 'Login' : 'Register')}>
            <Text style={styles.link}>{isRegister ? 'Đăng nhập' : 'Đăng ký ngay'}</Text></Pressable>
        </View>
        <View style={styles.footer}><Icon name="shield" size={14} color={colors.muted} /><Text style={styles.footerText}>Tài liệu và lịch sử gắn với tài khoản của bạn.</Text></View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function LoginScreen({ navigation }) {
  return <AuthForm navigation={navigation} isRegister={false} />;
}

export function RegisterScreen({ navigation }) {
  return <AuthForm navigation={navigation} isRegister={true} />;
}

const styles = StyleSheet.create({
  container: ui.screen, content: { padding: 22, paddingBottom: 36, flexGrow: 1 },
  welcome: { alignItems: 'center', paddingTop: 12, paddingBottom: 26 }, logo: { width: 78, height: 78, borderRadius: 27, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  eyebrow: { color: colors.primary, fontSize: 10, letterSpacing: 1.8, fontWeight: '700', marginBottom: 10 }, title: { ...ui.title, textAlign: 'center', fontSize: 26 },
  subtitle: { ...ui.caption, textAlign: 'center', marginTop: 8, maxWidth: 290 }, form: { ...ui.card, padding: 22 }, formTitle: { ...ui.section, marginBottom: 24 },
  forgot: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: -10, marginBottom: 10 }, link: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 }, switchText: { ...ui.caption }, switchButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 3 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 28 }, footerText: { fontSize: 11, lineHeight: 18, color: colors.muted, flexShrink: 1 },
});
