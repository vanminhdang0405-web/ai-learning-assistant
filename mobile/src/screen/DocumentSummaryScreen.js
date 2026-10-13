import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDocumentSummary, summarizeDocument } from '../services/documents';

const LEVELS = [
  { value: 'short', label: 'Ngắn', hint: 'Đọc nhanh các ý cốt lõi, tối đa 3 ý chính.' },
  { value: 'medium', label: 'Trung bình', hint: 'Bao quát nội dung chính và giải thích vừa đủ.' },
  { value: 'detailed', label: 'Chi tiết', hint: 'Giải thích đầy đủ hơn những nội dung có trong tài liệu.' },
];

function SourcePages({ pages, unit = 'trang' }) {
  return <Text style={styles.reference}>Tham chiếu: {unit} {pages.join(', ')}</Text>;
}

function PointSection({ title, items, unit }) {
  if (!items.length) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.section}>{title}</Text>
      {items.map((item, index) => (
        <View key={index} style={styles.item}>
          <Text selectable style={styles.body}>{index + 1}. {item.text}</Text>
          <SourcePages pages={item.pages} unit={unit} />
        </View>
      ))}
    </View>
  );
}

export default function DocumentSummaryScreen({ route, navigation }) {
  const { documentId, documentName } = route.params;
  const [level, setLevel] = useState('medium');
  const selectedLevel = useRef('medium');
  const [summary, setSummary] = useState(null);
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const mounted = useRef(false);
  const working = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    working.current = false;
    setLevel('medium');
    selectedLevel.current = 'medium';
    setSummary(null);
    setSource(null);
    perform(false, false, 'medium');
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [documentId]);

  async function perform(create, force = false, requestedLevel = selectedLevel.current) {
    if (working.current || requestedLevel !== selectedLevel.current) return;
    working.current = true;
    const ticket = ++generation.current;
    const current = () => mounted.current && generation.current === ticket && selectedLevel.current === requestedLevel;
    setBusy(create ? 'generating' : 'loading');
    setErrorMessage('');
    try {
      const data = create
        ? await summarizeDocument(documentId, force, requestedLevel)
        : await getDocumentSummary(documentId, requestedLevel);
      if (!current()) return;
      if (data.level !== requestedLevel || (data.summary && data.summary.level !== requestedLevel)) {
        throw new Error('Backend chưa trả đúng mức tóm tắt. Kiểm tra đã cập nhật đủ file FR-18 và khởi động lại backend.');
      }
      setSummary(data.summary);
      setSource(data.source);
    } catch (error) {
      if (!current()) return;
      setErrorMessage(error.message || 'Chưa thực hiện được. Vui lòng thử lại.');
      if (error.status === 401) {
        setSummary(null);
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        Alert.alert('Cần đăng nhập', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      } else if (error.status === 404) {
        setSummary(null);
        setSource(null);
      }
    } finally {
      if (current()) {
        working.current = false;
        setBusy('');
      }
    }
  }

  function selectLevel(nextLevel) {
    if (working.current || nextLevel === selectedLevel.current) return;
    selectedLevel.current = nextLevel;
    setLevel(nextLevel);
    setSummary(null);
    setErrorMessage('');
    perform(false, false, nextLevel);
  }

  function handleCreate() {
    if (working.current) return;
    const requestedLevel = selectedLevel.current;
    const label = LEVELS.find(item => item.value === requestedLevel).label;
    if (summary) {
      Alert.alert(`Tạo lại mức ${label}?`, 'Văn bản sẽ được gửi lại tới Gemini và sử dụng thêm hạn mức. Chỉ bản của mức đang chọn được thay khi tạo thành công.', [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Tạo lại', onPress: () => perform(true, true, requestedLevel) },
      ]);
    } else {
      perform(true, false, requestedLevel);
    }
  }

  const selected = LEVELS.find(item => item.value === level);
  const content = summary?.level === level ? summary.content : null;
  const unit = source?.sourceUnit === 'part' ? 'phần văn bản' : 'trang';
  const disabled = !!busy;
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{documentName}</Text>
        <Text style={styles.description}>
          Khi bấm tạo tóm tắt, phần chữ đã trích xuất sẽ được gửi tới Google Gemini.
          Hãy dùng tài liệu học tập không chứa thông tin cá nhân. Mở bản đã lưu không gọi AI.
        </Text>

        <Text style={styles.levelHeading}>Mức độ tóm tắt</Text>
        <View style={styles.levelRow} accessibilityRole="radiogroup">
          {LEVELS.map(option => (
            <Pressable key={option.value} accessibilityRole="radio"
              accessibilityState={{ checked: level === option.value, disabled }}
              disabled={disabled} onPress={() => selectLevel(option.value)}
              style={[styles.levelButton, level === option.value && styles.levelSelected, disabled && styles.disabled]}>
              <Text style={[styles.levelText, level === option.value && styles.levelTextSelected]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.description}>{selected.hint}</Text>
        <Text style={styles.meta}>Mỗi mức được lưu riêng. Chuyển mức chỉ tải bản đã lưu; bấm tạo mới sử dụng AI.</Text>

        {source && (
          <Text style={styles.meta}>
            {source.pageCount} {unit} · {source.charCount.toLocaleString('vi-VN')} ký tự
          </Text>
        )}
        {source && !source.ready && <Text style={styles.notice}>{source.reason}</Text>}
        {!!source?.pagesWithoutText?.length && (
          <Text style={styles.notice}>
            Chưa có chữ ở {unit} {source.pagesWithoutText.join(', ')}. Tóm tắt chỉ dựa trên phần chữ đã đọc được; chưa bao gồm OCR.
          </Text>
        )}
        {source?.sourceUnit === 'part' && <Text style={styles.meta}>DOCX/TXT được đọc thành phần văn bản; tham chiếu không phải số trang trong file gốc.</Text>}
        {summary?.stale && <Text style={styles.notice}>Văn bản đã thay đổi. Bản tóm tắt dưới đây thuộc phiên bản cũ; hãy tạo lại.</Text>}

        <Pressable accessibilityRole="button" disabled={disabled || !source?.ready}
          onPress={handleCreate} style={[styles.primary, (disabled || !source?.ready) && styles.disabled]}>
          {busy === 'generating' && <ActivityIndicator color="#FFFFFF" style={styles.spinner} />}
          <Text style={styles.primaryText}>
            {busy === 'generating' ? 'Đang tạo tóm tắt...' : summary ? `Tạo lại · ${selected.label}` : `Tạo tóm tắt · ${selected.label}`}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={disabled} onPress={() => perform(false)} style={styles.secondary}>
          <Text style={styles.secondaryText}>{busy === 'loading' ? 'Đang tải...' : 'Tải bản đã lưu'}</Text>
        </Pressable>
        {!!errorMessage && <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>}
        {busy === 'generating' && <Text style={styles.meta}>Có thể mất đến 2 phút. Giữ màn hình này mở trong lúc chờ. Không cần bấm tạo nhiều lần.</Text>}

        {content ? (
          <>
            <View style={styles.card}>
              <Text style={styles.levelBadge}>Mức {selected.label}</Text>
              <Text style={styles.section}>{content.title}</Text>
              <Text selectable style={styles.body}>{content.overview}</Text>
              <Text style={styles.meta}>Đã lưu: {new Date(summary.createdAt).toLocaleString('vi-VN')}</Text>
            </View>
            <PointSection title="Các ý chính" items={content.mainPoints} unit={unit} />
            {!!content.keyTerms.length && (
              <View style={styles.card}>
                <Text style={styles.section}>Thuật ngữ cần nhớ</Text>
                {content.keyTerms.map((item, index) => (
                  <View key={index} style={styles.item}>
                    <Text selectable style={styles.term}>{item.term}</Text>
                    <Text selectable style={styles.body}>{item.definition}</Text>
                    <SourcePages pages={item.pages} unit={unit} />
                  </View>
                ))}
              </View>
            )}
            <PointSection title="Kiến thức cần nhớ" items={content.takeaways} unit={unit} />
            {!!content.caveats.length && (
              <View style={styles.card}>
                <Text style={styles.section}>Giới hạn của nội dung</Text>
                {content.caveats.map((item, index) => <Text key={index} selectable style={styles.body}>• {item}</Text>)}
              </View>
            )}
            <Text style={styles.meta}>AI có thể tóm tắt sai hoặc tham chiếu chưa chính xác. Hãy đối chiếu các ý quan trọng với tài liệu gốc.</Text>
          </>
        ) : !busy && !errorMessage && (
          <Text style={styles.empty}>Chưa có bản tóm tắt mức {selected.label}. Chọn mức mong muốn rồi bấm tạo khi tài liệu đã có văn bản.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#172033', marginBottom: 10 },
  description: { fontSize: 14, lineHeight: 22, color: '#596579' },
  levelHeading: { fontSize: 16, fontWeight: '700', color: '#172033', marginTop: 20, marginBottom: 10 },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  levelButton: { paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, backgroundColor: '#FFFFFF' },
  levelSelected: { borderColor: '#0F766E', backgroundColor: '#0F766E' },
  levelText: { color: '#172033', fontWeight: '600' },
  levelTextSelected: { color: '#FFFFFF' },
  levelBadge: { color: '#0F766E', fontWeight: '700', marginBottom: 8 },
  meta: { fontSize: 12, lineHeight: 20, color: '#596579', marginTop: 10, marginBottom: 10 },
  notice: { fontSize: 14, lineHeight: 22, color: '#854D0E', marginTop: 12 },
  primary: { backgroundColor: '#0F766E', borderRadius: 12, padding: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 16 },
  primaryText: { fontSize: 16, color: '#FFFFFF', fontWeight: '700' },
  spinner: { marginRight: 8 },
  disabled: { opacity: 0.5 },
  secondary: { alignItems: 'center', paddingVertical: 15 },
  secondaryText: { color: '#2563EB', fontWeight: '600' },
  error: { color: '#B91C1C', fontSize: 14, lineHeight: 22, marginBottom: 16 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 14 },
  section: { fontSize: 18, fontWeight: '700', color: '#0F766E', marginBottom: 10 },
  item: { marginBottom: 15 },
  body: { fontSize: 15, lineHeight: 25, color: '#172033' },
  term: { fontSize: 15, fontWeight: '700', lineHeight: 24, color: '#172033' },
  reference: { fontSize: 12, lineHeight: 19, color: '#2563EB', marginTop: 6 },
  empty: { textAlign: 'center', color: '#596579', lineHeight: 23, marginTop: 24 },
});
