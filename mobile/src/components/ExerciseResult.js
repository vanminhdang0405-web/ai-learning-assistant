import { StyleSheet, Text, View } from 'react-native';

const labels = { hint: 'GỢI Ý', explain: 'GIẢI THÍCH KHÁI NIỆM', solution: 'LỜI GIẢI THAM KHẢO', followup: 'HỎI TIẾP' };
const colors = { hint: '#216647', explain: '#356888', solution: '#92530F', followup: '#715A92' };
export default function ExerciseResult({ turn }) {
  const content = turn.content;
  return <View style={[styles.card, { borderLeftColor: colors[turn.kind] }]}>
    <Text style={[styles.badge, { color: colors[turn.kind] }]}>{labels[turn.kind]}{turn.kind === 'hint' ? ` ${turn.hintNumber}` : ''}</Text>
    {!!turn.question && <Text selectable style={styles.question}>Bạn: {turn.question}</Text>}
    <Text style={styles.title}>{content.title}</Text>
    {!!content.content && <Text selectable style={styles.body}>{content.content}</Text>}
    {!!content.nextTask && <View style={styles.task}><Text style={styles.label}>Bạn thử làm</Text><Text selectable style={styles.body}>{content.nextTask}</Text></View>}
    {!!content.example && <><Text style={styles.label}>Ví dụ minh họa</Text><Text selectable style={styles.body}>{content.example}</Text></>}
    {content.steps?.map((step, index) => <View key={index} style={styles.step}><Text style={styles.label}>Bước {index + 1}: {step.title}</Text><Text selectable style={styles.body}>{step.content}</Text></View>)}
    {!!content.finalAnswer && <><Text style={styles.label}>Kết quả tham khảo</Text><Text selectable style={styles.body}>{content.finalAnswer}</Text></>}
    {!!content.check && <><Text style={styles.label}>Kiểm tra lại</Text><Text selectable style={styles.body}>{content.check}</Text></>}
    {content.caveats?.map((line, index) => <Text key={index} style={styles.warning}>• {line}</Text>)}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DEE6D9', borderLeftWidth: 4, borderRadius: 20, padding: 20, marginTop: 16 },
  badge: { fontSize: 12, fontWeight: '800', lineHeight: 20 }, title: { fontWeight: '700', fontSize: 17, color: '#253B31', lineHeight: 24, marginVertical: 8 },
  body: { color: '#253B31', fontSize: 15, lineHeight: 25 }, label: { color: '#253B31', fontWeight: '700', fontSize: 14, lineHeight: 22, marginTop: 12, marginBottom: 4 },
  question: { color: '#715A92', lineHeight: 22, marginTop: 10 }, task: { backgroundColor: '#EFF5E9', padding: 12, borderRadius: 8, marginTop: 12 },
  step: { marginTop: 4 }, warning: { color: '#92530F', lineHeight: 21, marginTop: 8 },
});
