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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { getCurrentUser, updateProfile } from '../services/auth';
import { Badge, Button, Field, Icon, ScreenIntro } from '../components/AppUI';
import { colors, ui } from '../theme';

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
        <ActivityIndicator size="large" color={colors.primary} />
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
          <ScreenIntro eyebrow="KHÔNG GIAN CÁ NHÂN" title="Hồ sơ của bạn." description="Một tài khoản cho tài liệu và hành trình học tập." />
          <View style={styles.profileCard}><View style={styles.avatar}><Text style={styles.initials}>{user.name.trim().split(/\s+/).slice(-2).map(word => word[0]).join('').toUpperCase()}</Text></View>
            <Text style={styles.userName}>{user.name}</Text><Badge label="Người học" icon="book-open" />
          </View>
          <View style={styles.form}><View style={styles.emailRow}><Icon name="mail" size={18} /><View style={styles.flex}><Text style={styles.label}>EMAIL ĐĂNG NHẬP</Text><Text selectable style={styles.email}>{user.email}</Text></View></View>
            <Field label="Tên hiển thị" icon="user" value={name} onChangeText={setName} placeholder="Nhập tên của bạn" maxLength={100} autoCapitalize="words" editable={!saving} />
            <Button label={saving ? 'Đang lưu…' : 'Lưu thay đổi'} icon="check" onPress={handleSave} loading={saving} disabled={saving || name.trim() === user.name} />
          </View>
          <View style={styles.note}><Icon name="shield" size={18} /><Text style={styles.noteText}>Tài liệu và lịch sử học tập của bạn được lưu theo tài khoản này.</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: ui.screen, center: { ...ui.screen, alignItems: 'center', justifyContent: 'center', padding: 24 }, content: { padding: 22, paddingBottom: 36 }, flex: { flex: 1 },
  profileCard: { ...ui.card, alignItems: 'center', padding: 26, backgroundColor: colors.soft, marginBottom: 20 }, avatar: { width: 76, height: 76, borderRadius: 28, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, initials: { color: colors.accent, fontWeight: '700', fontSize: 24 }, userName: { ...ui.section, marginBottom: 12, textAlign: 'center' },
  form: { ...ui.card, padding: 20 }, emailRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingBottom: 20, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.border }, label: { color: colors.muted, fontSize: 10, letterSpacing: 1.1, marginBottom: 6 }, email: { color: colors.text, fontSize: 14, lineHeight: 22 },
  note: { flexDirection: 'row', gap: 10, marginTop: 22, paddingHorizontal: 8 }, noteText: { ...ui.caption, flex: 1, fontSize: 12 }, button: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: colors.primary }, buttonText: { color: '#FFFFFF', fontWeight: '700' }, statusText: { ...ui.caption, marginVertical: 16 },
});
