import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { getCurrentUser, updateProfile } from '../services/auth';

export default function ProfileScreen({ navigation }) {
  const headerHeight = useHeaderHeight();

  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const account = await getCurrentUser();

        if (!active) return;

        if (!account) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
          return;
        }

        setUser(account);
        setName(account.name);
      } catch (error) {
        if (active) {
          setLoadError(error.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [navigation]);

  async function handleSave() {
    if (saving || !user) return;

    const cleanName = name.trim();

    if (!cleanName || cleanName.length > 100) {
      Alert.alert(
        'Tên chưa hợp lệ',
        'Vui lòng nhập tên từ 1 đến 100 ký tự.'
      );
      return;
    }

    setSaving(true);

    try {
      const updatedUser = await updateProfile(cleanName);

      setUser(updatedUser);
      setName(updatedUser.name);

      Alert.alert(
        'Thành công',
        'Hồ sơ của bạn đã được cập nhật.',
        [
          {
            text: 'Về trang chủ',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Home' }],
              });
            },
          },
        ],
        { cancelable: false }
      );
    } catch (error) {
      if (error.status === 401) {
        Alert.alert(
          'Phiên đăng nhập đã hết hạn',
          'Vui lòng đăng nhập lại để tiếp tục.',
          [
            {
              text: 'Đăng nhập',
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                });
              },
            },
          ],
          { cancelable: false }
        );
      } else {
        Alert.alert('Chưa cập nhật được', error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['bottom']}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.statusText}>Đang tải hồ sơ...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.center} edges={['bottom']}>
        <Text style={styles.statusText}>
          {loadError || 'Không tải được hồ sơ.'}
        </Text>

        <Pressable
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Quay lại</Text>
        </Pressable>
      </SafeAreaView>
    );
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
          <Text style={styles.title}>Hồ sơ của tôi</Text>
          <Text style={styles.subtitle}>
            Xem thông tin tài khoản và cập nhật tên của bạn.
          </Text>

          <Text style={styles.label}>Email</Text>
          <Text style={styles.email}>{user.email}</Text>

          <Text style={styles.label}>Tên hiển thị</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nhập tên của bạn"
            maxLength={100}
            autoCapitalize="words"
            editable={!saving}
          />

          <Pressable
            disabled={saving}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.button,
              (pressed || saving) && styles.dimmed,
            ]}
          >
            <Text style={styles.buttonText}>
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 23,
    marginBottom: 28,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#172033',
    marginBottom: 8,
  },
  email: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 24,
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
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dimmed: {
    opacity: 0.6,
  },
  statusText: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    marginVertical: 16,
  },
});