import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const LABELS = { short: 'Ngắn', medium: 'Trung bình', detailed: 'Chi tiết' };

export default function SummarySavedList({ items, disabled, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(15);
  const matches = items.filter(item => `${item.scope.label} ${LABELS[item.level]}`
    .toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}>
      <Text style={styles.heading}>Bản tóm tắt đã lưu ({items.length}) · {expanded ? 'Thu gọn' : 'Xem danh sách'}</Text>
    </Pressable>
    <Text style={styles.meta}>Tạo thành công sẽ tự lưu. Mở bản đã lưu không gọi AI.</Text>
    {expanded && <>
      {!!items.length && <TextInput accessibilityLabel="Tìm bản tóm tắt đã lưu" placeholder="Tìm chương/phạm vi hoặc mức độ"
        style={styles.input} value={search} onChangeText={value => { setSearch(value); setLimit(15); }} />}
      {matches.slice(0, limit).map(item => <Pressable key={`${item.scope.key}/${item.level}`} accessibilityRole="button"
        disabled={disabled} accessibilityState={{ disabled }} onPress={() => { if (!disabled) { onOpen(item); setExpanded(false); } }}
        style={[styles.item, disabled && styles.disabled]}>
        <Text style={styles.label}>{item.scope.label} · {LABELS[item.level]}</Text>
        <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString('vi-VN')}</Text>
        {item.stale && <Text style={styles.notice}>Nguồn đã thay đổi · vẫn đọc được bản cũ</Text>}
      </Pressable>)}
      {!matches.length && <Text style={styles.meta}>{items.length ? 'Không tìm thấy bản phù hợp.' : 'Chưa có bản tóm tắt đã lưu cho tài liệu này.'}</Text>}
      {matches.length > limit && <Pressable accessibilityRole="button" style={styles.item} onPress={() => setLimit(limit + 15)}>
        <Text style={styles.label}>Xem thêm ({matches.length - limit})</Text>
      </Pressable>}
      <Text style={styles.meta}>Mỗi phạm vi + mức độ giữ một bản. Tạo lại thành công thay bản đó; không lưu lịch sử các lần tạo lại.</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, marginTop: 16 },
  heading: { color: '#0F766E', fontSize: 16, lineHeight: 24, fontWeight: '700' },
  meta: { color: '#596579', fontSize: 12, lineHeight: 20, marginTop: 5 },
  label: { color: '#172033', fontSize: 14, lineHeight: 22, fontWeight: '600' },
  input: { padding: 12, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, marginTop: 10, color: '#172033', minHeight: 48 },
  item: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  notice: { color: '#854D0E', fontSize: 12, lineHeight: 20 },
  disabled: { opacity: 0.5 },
});
