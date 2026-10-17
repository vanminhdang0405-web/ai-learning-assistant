import { StyleSheet } from 'react-native';

export const colors = {
  background: '#F6F8F2', surface: '#FFFFFF', primary: '#216647', forest: '#143D2C',
  text: '#253B31', heading: '#183E32', muted: '#66776D', border: '#DEE6D9',
  soft: '#E9F2E3', accent: '#C6E6A1', onAccent: '#36592E', disabled: '#E4E9DF',
  danger: '#B33B3B', dangerSoft: '#FFF1EE', warning: '#92530F', warningSoft: '#FFF5E2',
  blue: '#356888', blueSoft: '#EBF3F8', purple: '#715A92', purpleSoft: '#F1EDF7',
};
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 36 },
  title: { color: colors.heading, fontSize: 27, lineHeight: 35, fontWeight: '700', letterSpacing: -0.7 },
  section: { color: colors.heading, fontSize: 18, lineHeight: 26, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 25 }, caption: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 18 },
});
