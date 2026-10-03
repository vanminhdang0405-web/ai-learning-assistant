import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { getCurrentUser, logoutAccount } from '../services/auth';

// Component dùng chung để hiển thị một mục chức năng.
function FeatureCard({ number, title, description, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      <Text style={styles.cardNumber}>{number}</Text>

      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>

      <Text style={styles.arrow}>›</Text>
    </Pressable>
  );
}

export default function HomeScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [checkingAccount, setCheckingAccount] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const account = await getCurrentUser();

        if (active) {
          setUser(account);
      }
      } catch (error) {
        if (active) {
          Alert.alert('Chưa tải được tài khoản', error.message);
        }
      } finally {
        if (active) {
          setCheckingAccount(false);
        }
      }
    } 

    loadAccount();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    setCheckingAccount(true);

    try {
      await logoutAccount();

      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      Alert.alert('Chưa đăng xuất được', error.message);
    } finally {
      setCheckingAccount(false);
    }
  }

  function showFeature(title) {
    Alert.alert(
      title,
      'Bạn đã bấm thành công. Chức năng này sẽ được xây dựng ở bước tiếp theo.'
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.brand}>AI LEARNING ASSISTANT</Text>
          <Text style={styles.heading}>
            {user ? `Xin chào, ${user.name}!` : 'Hôm nay bạn muốn học gì?'}
          </Text>
          <Text style={styles.subtitle}>
            Quản lý tài liệu, tìm hiểu kiến thức và luyện giải bài tập.
          </Text>
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Bắt đầu từ tài liệu của bạn</Text>
          <Text style={styles.bannerDescription}>
            Thêm tài liệu để tạo bản tóm tắt và đặt câu hỏi về nội dung bài học.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => showFeature('Thêm tài liệu')}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>+ Thêm tài liệu</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Góc học tập</Text>

        <FeatureCard
          number="01"
          title="Tài liệu học tập"
          description="Quản lý tài liệu, tóm tắt và hỏi đáp với AI."
          onPress={() => showFeature('Tài liệu học tập')}
        />

        <FeatureCard
          number="02"
          title="Quét đề bài"
          description="Chụp hoặc chọn ảnh đề bài để nhận gợi ý từng bước."
          onPress={() => showFeature('Quét đề bài')}
        />

        <FeatureCard
          number="03"
          title="Lịch sử học tập"
          description="Xem lại bản tóm tắt và các cuộc hội thoại đã lưu."
          onPress={() => showFeature('Lịch sử học tập')}
        />

        <View>
          {user && (
            <Text style={[styles.subtitle, { textAlign: 'center' }]}>
              {user.email}
            </Text>
          )}

          {user && (
            <Pressable
              style={styles.accountButton}
              disabled={checkingAccount}
              onPress={() => navigation.navigate('Profile')}
            >
            <Text style={styles.accountText}>
                Hồ sơ cá nhân
            </Text>
          </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={checkingAccount}
            onPress={
              user
                ? handleLogout
                : () => navigation.navigate('Login')
            }
            style={styles.accountButton}
          >
            <Text style={styles.accountText}>
              {checkingAccount
                ? 'Đang kiểm tra tài khoản...'
                : user
                  ? 'Đăng xuất'
                  : 'Đăng nhập / Đăng ký'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  content: {
    padding: 24,
    paddingBottom: 32,
  },
  header: {
    marginTop: 12,
    marginBottom: 24,
  },
  brand: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    letterSpacing: 1,
    marginBottom: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#172033',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: '#596579',
  },
  banner: {
    backgroundColor: '#1D4ED8',
    borderRadius: 20,
    padding: 22,
    marginBottom: 28,
  },
  bannerTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  bannerDescription: {
    fontSize: 14,
    lineHeight: 22,
    color: '#EFF6FF',
    marginBottom: 20,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#172033',
    marginBottom: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  cardPressed: {
    backgroundColor: '#EAF1FF',
  },
  cardNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563EB',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#172033',
    marginBottom: 5,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: '#596579',
  },
  arrow: {
    fontSize: 28,
    color: '#64748B',
    marginLeft: 12,
  },
  accountButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  accountText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1D4ED8',
  },
});