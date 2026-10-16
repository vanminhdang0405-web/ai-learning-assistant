import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function SummaryScopePicker({ scope, sections, savedRanges, documentSource, truncated, disabled, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [start, setStart] = useState('1');
  const [end, setEnd] = useState('1');
  const [error, setError] = useState('');
  const unit = documentSource?.sourceUnit === 'part' ? 'phần văn bản' : 'trang';
  const count = documentSource?.pageCount || 0;
  const matches = sections.filter(item => item.label.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  function select(key) {
    if (disabled) return;
    setError('');
    setExpanded(false);
    onSelect(key);
  }
  function applyRange() {
    if (!/^[1-9]\d*$/.test(start.trim()) || !/^[1-9]\d*$/.test(end.trim())
        || Number(start) > Number(end) || Number(end) > count) {
      setError(`Nhập số từ 1 đến ${count}; số bắt đầu không lớn hơn số kết thúc.`);
      return;
    }
    select(`range:${Number(start)}:${Number(end)}`);
  }
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Phạm vi tóm tắt</Text>
      <Text style={styles.selected}>{scope?.label || 'Toàn bộ tài liệu'}</Text>
      {!!scope?.startPage && <Text style={styles.meta}>{unit} {scope.startPage}–{scope.endPage}</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded, disabled }}
        disabled={disabled} onPress={() => setExpanded(!expanded)} style={[styles.button, disabled && styles.disabled]}>
        <Text style={styles.action}>{expanded ? 'Đóng lựa chọn' : 'Đổi phạm vi'}</Text>
      </Pressable>
      {expanded && <>
        <Pressable accessibilityRole="button" disabled={disabled} onPress={() => select('all')} style={styles.option}>
          <Text style={styles.action}>Toàn bộ tài liệu</Text>
        </Pressable>
        <Text style={styles.heading}>Chương / mục gợi ý</Text>
        <Text style={styles.meta}>Nhận diện từ tiêu đề trong văn bản, có thể chưa chính xác. Kiểm tra đoạn đầu/cuối trước khi tạo.</Text>
        {!!sections.length && <TextInput accessibilityLabel="Tìm chương hoặc mục" placeholder="Tìm theo tên chương/mục"
          value={search} onChangeText={setSearch} editable={!disabled} style={styles.input} />}
        {matches.slice(0, 20).map(item => <Pressable key={item.key} accessibilityRole="button"
          disabled={disabled} onPress={() => select(item.key)} style={styles.option}>
          <Text style={styles.action}>{item.label}</Text>
          <Text style={styles.meta}>{unit} {item.startPage}–{item.endPage}</Text>
        </Pressable>)}
        {matches.length > 20 && <Text style={styles.meta}>Đang hiện 20/{matches.length} mục. Nhập tên để tìm mục khác.</Text>}
        {!matches.length && <Text style={styles.meta}>{sections.length ? 'Không tìm thấy mục phù hợp.' : 'Chưa nhận diện được tiêu đề. Bạn có thể chọn khoảng bên dưới.'}</Text>}
        {truncated && <Text style={styles.meta}>Chỉ gợi ý 200 tiêu đề đầu tiên. Dùng khoảng bên dưới để chọn phần khác.</Text>}
        <Text style={styles.heading}>Chọn khoảng {unit}</Text>
        <Text style={styles.meta}>{count} {unit} trong tài liệu. Khoảng chọn lấy toàn bộ chữ của các {unit} đó.</Text>
        {documentSource?.sourceUnit === 'part' && <Text style={styles.meta}>Phần văn bản là đơn vị chia khi trích xuất DOCX/TXT, không phải số trang Word.</Text>}
        <View style={styles.row}>
          <View style={styles.field}><Text style={styles.meta}>Từ</Text><TextInput accessibilityLabel={`Từ ${unit}`}
            keyboardType="number-pad" maxLength={6} value={start} onChangeText={setStart} editable={!disabled} style={styles.input} /></View>
          <View style={styles.field}><Text style={styles.meta}>Đến</Text><TextInput accessibilityLabel={`Đến ${unit}`}
            keyboardType="number-pad" maxLength={6} value={end} onChangeText={setEnd} editable={!disabled} style={styles.input} /></View>
        </View>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={disabled || !count} onPress={applyRange}
          style={[styles.button, (disabled || !count) && styles.disabled]}><Text style={styles.action}>Áp dụng khoảng</Text></Pressable>
        {!!savedRanges.length && <>
          <Text style={styles.heading}>Khoảng đã có bản lưu</Text>
          {savedRanges.map(item => <Pressable key={item.key} accessibilityRole="button"
            disabled={disabled} onPress={() => select(item.key)} style={styles.option}><Text style={styles.action}>{item.label}</Text></Pressable>)}
        </>}
        <Text style={styles.meta}>Chọn phạm vi chỉ tải dữ liệu đã lưu. Bấm Tạo tóm tắt mới gọi AI.</Text>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 12, marginTop: 16 },
  heading: { color: '#172033', fontWeight: '700', fontSize: 16, marginTop: 10, marginBottom: 8 },
  selected: { color: '#0F766E', fontSize: 16, fontWeight: '700', lineHeight: 24 },
  meta: { color: '#596579', fontSize: 13, lineHeight: 21, marginBottom: 6 },
  action: { color: '#0F766E', fontWeight: '600', lineHeight: 22 },
  button: { paddingVertical: 12, alignItems: 'center', backgroundColor: '#E6F4F1', borderRadius: 8, marginTop: 8 },
  option: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 12, color: '#172033', backgroundColor: '#FFFFFF', minHeight: 48 },
  row: { flexDirection: 'row', gap: 12 }, field: { flex: 1 },
  error: { color: '#B91C1C', lineHeight: 22, marginTop: 8 }, disabled: { opacity: 0.5 },
});
