import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentUser, logoutAccount } from '../services/auth';
import { getDocuments } from '../services/documents';
import StudyExercisePanel from './StudyExercisePanel';
import { Badge, Button, Icon, Notice } from '../components/AppUI';
import { colors, ui } from '../theme';

export default function HomeScreen({ navigation }) {
  const [user, setUser] = useState(null), [checkingAccount, setCheckingAccount] = useState(true);
  const [showExercise, setShowExercise] = useState(false), [documents, setDocuments] = useState(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const account = await getCurrentUser();
        if (!active) return;
        setUser(account); setCheckingAccount(false);
        if (account) {
          try { const items = await getDocuments(); if (active) setDocuments(items); }
          catch { /* The library screen has its own retry and session handling. */ }
        }
      } catch (error) { if (active) setLoadError(error.message); }
      finally { if (active) setCheckingAccount(false); }
    }
    load(); return () => { active = false; };
  }, []);
  async function handleLogout() {
    if (checkingAccount) return;
    setCheckingAccount(true);
    try { await logoutAccount(); navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); }
    catch (error) { Alert.alert('Chưa đăng xuất được', error.message); }
    finally { setCheckingAccount(false); }
  }
  function open(action) {
    if (checkingAccount) return;
    if (!user) {
      Alert.alert('Bắt đầu cùng tài khoản của bạn', 'Đăng nhập để lưu tài liệu, bài tập và kết quả học tập.', [
        { text: 'Để sau', style: 'cancel' }, { text: 'Đăng nhập', onPress: () => navigation.navigate('Login') },
      ]); return;
    }
    action();
  }
  const openDocuments = () => open(() => navigation.navigate('Documents'));
  const openExercise = () => open(() => setShowExercise(true));
  const firstName = user?.name?.trim().split(/\s+/).pop();
  const initials = user?.name?.trim().split(/\s+/).slice(-2).map(word => word[0]).join('').toUpperCase() || 'AI';
  if (showExercise) return <SafeAreaView style={ui.screen}><StudyExercisePanel onClose={() => setShowExercise(false)} onSessionExpired={() => {
    setShowExercise(false); setUser(null); setDocuments(null);
    Alert.alert('Phiên đăng nhập đã hết hạn', 'Bạn hãy đăng nhập lại để tiếp tục.');
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }} /></SafeAreaView>;
  return <SafeAreaView style={ui.screen}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.topbar}>
        <View style={s.brand}><View style={s.logo}><Icon name="book-open" size={21} color="#FFFFFF" /></View><Text style={s.brandText}>AI Learning{ '\n' }Assistant</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={user ? 'Mở hồ sơ cá nhân' : 'Đăng nhập'} disabled={checkingAccount}
          onPress={() => navigation.navigate(user ? 'Profile' : 'Login')} style={s.avatar}><Text style={s.initials}>{initials}</Text></Pressable>
      </View>
      <Text style={s.greeting}>{user ? `Chào ${firstName},` : 'Chào bạn,'}</Text>
      <Text style={s.subtitle}>Sẵn sàng cho một điều mới hôm nay?</Text>
      {!!loadError && <Notice tone="error">{loadError}</Notice>}
      {checkingAccount && <Notice loading>Đang mở không gian học tập của bạn…</Notice>}
      <View style={s.hero}>
        <View pointerEvents="none" accessible={false} style={s.orbit} /><View pointerEvents="none" accessible={false} style={s.orbitSmall} />
        <View style={s.heroTag}><Icon name="sun" size={13} color={colors.accent} /><Text style={s.heroTagText}>HỌC THEO CÁCH CỦA BẠN</Text></View>
        <Text style={s.heroTitle}>Mỗi ngày,{ '\n' }hiểu thêm một chút.</Text>
        <Text style={s.heroDescription}>Từ tài liệu đến lời giải,{ '\n' }cùng AI tìm ra cách hiểu của riêng bạn.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Mở tài liệu học tập" disabled={checkingAccount} onPress={openDocuments} style={({ pressed }) => [s.heroButton, pressed && s.pressed]}>
          <Text style={s.heroButtonText}>Bắt đầu học</Text><Icon name="arrow-up-right" size={19} color={colors.forest} />
        </Pressable>
      </View>
      <View style={s.sectionRow}><Text style={ui.section}>Bạn muốn làm gì?</Text><Text style={s.sectionCaption}>Chọn một cách bắt đầu</Text></View>
      <View style={s.tiles}>
        <Pressable accessibilityRole="button" accessibilityLabel="Tài liệu học tập" disabled={checkingAccount} onPress={openDocuments} style={({ pressed }) => [s.tile, pressed && s.pressed]}>
          <View style={s.tileIcon}><Icon name="layers" size={24} /></View><Text style={s.tileTitle}>Tài liệu</Text>
          <Text style={s.tileDescription}>Tóm tắt kiến thức{ '\n' }Hỏi đáp cùng AI</Text><View style={s.tileFooter}><Text style={s.tileLink}>Khám phá</Text><Icon name="arrow-right" size={18} /></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Quét đề bài & gợi ý" disabled={checkingAccount} onPress={openExercise} style={({ pressed }) => [s.tile, s.scanTile, pressed && s.pressed]}>
          <View style={[s.tileIcon, s.scanIcon]}><Icon name="maximize" size={24} color={colors.warning} /></View><Text style={s.tileTitle}>Quét đề bài</Text>
          <Text style={s.tileDescription}>Chụp ảnh đề bài{ '\n' }Gợi ý từng bước</Text><View style={s.tileFooter}><Text style={s.tileLink}>Thử ngay</Text><Icon name="arrow-right" size={18} /></View>
        </Pressable>
      </View>
      <View style={s.sectionRow}><Text style={ui.section}>Tài liệu gần đây</Text><Pressable accessibilityRole="button" onPress={openDocuments} disabled={checkingAccount} style={s.seeAll}><Text style={s.tileLink}>Xem tất cả</Text></Pressable></View>
      {documents?.length ? <View style={s.recent}>{documents.slice(0, 3).map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Học tiếp ${item.name}`}
        disabled={checkingAccount} onPress={() => open(() => navigation.navigate('DocumentText', { documentId: item.id, documentName: item.name, sourceUnit: item.mime_type === 'application/pdf' ? 'page' : 'part' }))}
        style={({ pressed }) => [s.recentRow, index > 0 && s.recentBorder, pressed && s.pressed]}>
        <View style={s.fileIcon}><Icon name="file-text" size={21} /></View><View style={s.flex}><Text numberOfLines={2} style={s.fileName}>{item.name}</Text><Text style={s.fileMeta}>{item.topic || 'Chưa phân loại'}</Text></View><Icon name="chevron-right" size={18} color={colors.muted} />
      </Pressable>)}</View> : <View style={s.libraryEmpty}>
        <Icon name="folder-plus" size={25} /><View style={s.flex}><Text style={s.fileName}>{documents ? 'Một góc học tập đang chờ bạn' : 'Mang bài học của bạn vào đây'}</Text><Text style={s.fileMeta}>Thêm PDF, DOCX hoặc TXT để bắt đầu.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Thêm tài liệu" disabled={checkingAccount} onPress={openDocuments} style={s.smallPlus}><Icon name="plus" /></Pressable>
      </View>}
      <View style={s.tip}><Icon name="compass" size={20} /><Text style={s.tipText}>Thử tự trả lời trước, rồi dùng AI để kiểm tra cách hiểu của mình.</Text></View>
      {user ? <View style={s.account}>
        <View style={s.accountHeader}><Badge label="Tài khoản của bạn" icon="user" /><Text numberOfLines={1} style={s.accountEmail}>{user.email}</Text></View>
        <View style={s.accountActions}><Button compact tone="ghost" label="Hồ sơ" icon="user" onPress={() => navigation.navigate('Profile')} disabled={checkingAccount} style={s.flex} />
          <Button compact tone="ghost" label="Đăng xuất" icon="log-out" disabled={checkingAccount} onPress={() => Alert.alert('Đăng xuất?', 'Bạn có thể đăng nhập lại để tiếp tục học.', [{ text: 'Ở lại', style: 'cancel' }, { text: 'Đăng xuất', onPress: handleLogout }])} style={s.flex} /></View>
      </View> : <Button label="Đăng nhập để lưu tiến trình" icon="arrow-right" onPress={() => navigation.navigate('Login')} disabled={checkingAccount} />}
      <Text style={s.footer}>AI LEARNING ASSISTANT · HỌC TỪNG CHÚT MỘT</Text>
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  content: { padding: 22, paddingBottom: 28 }, flex: { flex: 1 }, topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, marginBottom: 26 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, brandText: { color: colors.heading, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, initials: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  greeting: { ...ui.title, fontSize: 29 }, subtitle: { ...ui.caption, marginTop: 4, marginBottom: 22 },
  hero: { backgroundColor: colors.forest, borderRadius: 25, padding: 24, overflow: 'hidden' }, heroTag: { flexDirection: 'row', alignItems: 'center', gap: 7 }, heroTagText: { color: colors.accent, fontSize: 9, letterSpacing: 1.3, fontWeight: '700' },
  heroTitle: { color: '#FFFFFF', fontSize: 29, lineHeight: 38, fontWeight: '700', letterSpacing: -0.7, marginTop: 15 }, heroDescription: { color: '#D1E3D1', fontSize: 12, lineHeight: 21, marginTop: 10 },
  heroButton: { alignSelf: 'flex-start', minHeight: 44, backgroundColor: colors.accent, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 16, paddingVertical: 12, marginTop: 20 }, heroButtonText: { color: colors.forest, fontWeight: '700', fontSize: 13 },
  orbit: { position: 'absolute', width: 160, height: 220, borderWidth: 1, borderColor: '#39654A', borderRadius: 100, right: -90, top: 8, transform: [{ rotate: '-25deg' }] }, orbitSmall: { position: 'absolute', width: 110, height: 170, borderWidth: 1, borderColor: '#39654A', borderRadius: 80, right: -65, top: 55, transform: [{ rotate: '-25deg' }] },
  sectionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 26, marginBottom: 12 }, sectionCaption: { color: colors.muted, fontSize: 11, lineHeight: 18 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, tile: { flex: 1, minWidth: 135, borderRadius: 21, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', padding: 17 }, scanTile: { backgroundColor: '#FCF9F0', borderColor: '#EAE4D2' },
  tileIcon: { backgroundColor: colors.soft, width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, scanIcon: { backgroundColor: '#F4EACD' }, tileTitle: { color: colors.heading, fontSize: 18, fontWeight: '700', marginBottom: 7 }, tileDescription: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  tileFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }, tileLink: { color: colors.primary, fontSize: 12, fontWeight: '700' }, seeAll: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  recent: { ...ui.card, padding: 4 }, recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, minHeight: 80 }, recentBorder: { borderTopWidth: 1, borderTopColor: colors.border }, fileIcon: { width: 42, height: 46, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  fileName: { color: colors.heading, fontSize: 13, lineHeight: 21, fontWeight: '600' }, fileMeta: { color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 3 }, libraryEmpty: { ...ui.card, flexDirection: 'row', alignItems: 'center', gap: 12 }, smallPlus: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.soft },
  tip: { flexDirection: 'row', gap: 10, backgroundColor: colors.soft, borderRadius: 16, padding: 16, marginTop: 20, marginBottom: 24 }, tipText: { color: colors.primary, fontSize: 12, lineHeight: 20, flex: 1 },
  account: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18 }, accountHeader: { gap: 8, marginBottom: 12 }, accountEmail: { color: colors.muted, fontSize: 12 }, accountActions: { flexDirection: 'row', gap: 10 },
  footer: { color: colors.muted, fontSize: 8, letterSpacing: 1.2, textAlign: 'center', marginTop: 26 }, pressed: { opacity: 0.72 },
});
