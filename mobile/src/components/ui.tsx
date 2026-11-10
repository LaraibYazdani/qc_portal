/** Building blocks for PackVision's screens. */
import React from 'react';
import {
  ActivityIndicator, Pressable, PressableProps, StyleProp, StyleSheet, Text, TextInput, TextInputInstance, TextInputProps,
  TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { brand, colors, ink, radius, shadow } from './theme';
import { Verdict } from '@/lib/types';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// â”€â”€ Text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Variant = 'display' | 'title' | 'heading' | 'body' | 'small' | 'caption' | 'eyebrow';
const TEXT: Record<Variant, TextStyle> = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: ink[950], letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: ink[950], letterSpacing: -0.3 },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: ink[900] },
  body: { fontSize: 15, lineHeight: 22, color: ink[800] },
  small: { fontSize: 13, lineHeight: 18, color: ink[600] },
  caption: { fontSize: 12, lineHeight: 16, color: ink[500] },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: ink[500], letterSpacing: 1.2, textTransform: 'uppercase' },
};

export function T({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return <Text {...rest} style={[TEXT[variant], style]} />;
}

// â”€â”€ Logo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** PackVision's mark: a carton inside a viewfinder (same drawing as the web app). */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <LinearGradient id="pvMark" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5F7DFA" />
          <Stop offset="1" stopColor="#2737AD" />
        </LinearGradient>
      </Defs>
      <Rect width="32" height="32" rx="9" fill="url(#pvMark)" />
      <Path d="M7 11V8.5A1.5 1.5 0 0 1 8.5 7H11M21 7h2.5A1.5 1.5 0 0 1 25 8.5V11M25 21v2.5a1.5 1.5 0 0 1-1.5 1.5H21M11 25H8.5A1.5 1.5 0 0 1 7 23.5V21"
        fill="none" stroke="#fff" strokeOpacity={0.75} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M11 13.5 16 11l5 2.5v5L16 21l-5-2.5z" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M11 13.5 16 16l5-2.5M16 16v5" fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}

// â”€â”€ Button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';
interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BUTTON: Record<ButtonVariant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: brand[600], pressed: brand[700], fg: '#fff' },
  secondary: { bg: '#fff', pressed: ink[50], fg: ink[900], border: ink[200] },
  ghost: { bg: 'transparent', pressed: ink[100], fg: brand[700] },
  danger: { bg: colors.danger, pressed: '#B91C1C', fg: '#fff' },
  light: { bg: 'rgba(255,255,255,0.14)', pressed: 'rgba(255,255,255,0.24)', fg: '#fff' },
};

export function Button({ title, variant = 'primary', size = 'md', icon, loading, disabled, style, ...rest }: ButtonProps) {
  const v = BUTTON[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      {...rest}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' && styles.buttonLg,
        { backgroundColor: pressed ? v.pressed : v.bg, borderColor: v.border ?? 'transparent', opacity: off && !loading ? 0.5 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Ionicons name={icon} size={size === 'lg' ? 20 : 18} color={v.fg} /> : null}
      <Text style={[styles.buttonText, size === 'lg' && styles.buttonTextLg, { color: v.fg }]} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}

// â”€â”€ Card, rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && { padding: 16 }, style]}>{children}</View>;
}

export function Row({ label, value, last }: { label: string; value?: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <T variant="small" style={{ color: ink[500] }}>{label}</T>
      {typeof value === 'string' || typeof value === 'number'
        ? <T variant="small" style={styles.rowValue} numberOfLines={2}>{value}</T>
        : value}
    </View>
  );
}

// â”€â”€ Input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const Input = React.forwardRef<TextInputInstance, TextInputProps & { label?: string; icon?: IconName }>(
  function Input({ label, icon, style, ...rest }, ref) {
    return (
      <View style={{ gap: 6 }}>
        {label ? <T variant="small" style={{ fontWeight: '600', color: ink[700] }}>{label}</T> : null}
        <View style={styles.inputWrap}>
          {icon ? <Ionicons name={icon} size={18} color={ink[400]} style={{ marginLeft: 14 }} /> : null}
          <TextInput ref={ref} placeholderTextColor={ink[400]} {...rest} style={[styles.input, style]} />
        </View>
      </View>
    );
  },
);

// â”€â”€ Badges, alerts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
const TONE: Record<Tone, { bg: string; fg: string; dot: string }> = {
  success: { bg: colors.successBg, fg: colors.successText, dot: colors.success },
  danger: { bg: colors.dangerBg, fg: colors.dangerText, dot: colors.danger },
  warning: { bg: colors.warningBg, fg: colors.warningText, dot: colors.warning },
  info: { bg: colors.infoBg, fg: colors.infoText, dot: colors.info },
  neutral: { bg: ink[100], fg: ink[700], dot: ink[400] },
};

export function Badge({ label, tone = 'neutral', dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const t = TONE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.dot }]} /> : null}
      <Text style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const ALERT_ICON: Record<Tone, IconName> = {
  success: 'checkmark-circle', danger: 'alert-circle', warning: 'warning', info: 'information-circle', neutral: 'information-circle',
};

export function Alert({ tone = 'info', title, children, style }: { tone?: Tone; title?: string; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = TONE[tone];
  return (
    <View style={[styles.alert, { backgroundColor: t.bg }, style]} accessibilityRole="alert">
      <Ionicons name={ALERT_ICON[tone]} size={20} color={t.dot} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text style={[styles.alertTitle, { color: t.fg }]}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={[styles.alertText, { color: t.fg }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

export const VERDICT: Record<Verdict, { label: string; sub: string; color: string; tone: Tone; icon: IconName }> = {
  PASS: { label: 'Pass', sub: 'Matches the approved design', color: colors.success, tone: 'success', icon: 'checkmark-circle' },
  FAIL: { label: 'Fail', sub: 'Does not match the approved design', color: colors.danger, tone: 'danger', icon: 'close-circle' },
  RETAKE: { label: 'Retake photo', sub: 'The photo could not be judged', color: colors.warning, tone: 'warning', icon: 'warning' },
};

export function VerdictBadge({ verdict, status }: { verdict: Verdict | null; status?: string }) {
  if (!verdict) return status === 'failed' ? <Badge label="Error" tone="danger" /> : <Badge label="Checking" tone="info" dot />;
  return <Badge label={VERDICT[verdict].label} tone={VERDICT[verdict].tone} dot />;
}

// â”€â”€ Segmented control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function Segmented<V extends string>({ value, options, onChange, dark }: {
  value: V; options: { value: V; label: string; count?: number }[]; onChange: (v: V) => void; dark?: boolean;
}) {
  return (
    <View style={[styles.segmented, dark && { backgroundColor: 'rgba(255,255,255,0.12)' }]} accessibilityRole="tablist">
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[styles.segment, on && (dark ? styles.segmentOnDark : styles.segmentOn)]}>
            <Text style={[styles.segmentText, { color: dark ? (on ? ink[950] : 'rgba(255,255,255,0.8)') : on ? ink[950] : ink[500] }]} numberOfLines={1}>
              {o.label}{o.count != null ? ` ${o.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// â”€â”€ Empty / loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function Empty({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={26} color={ink[400]} /></View>
      <T variant="heading" style={{ textAlign: 'center' }}>{title}</T>
      {text ? <T variant="small" style={{ textAlign: 'center', maxWidth: 300 }}>{text}</T> : null}
      {children}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={brand[600]} />
      {label ? <T variant="small">{label}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 46, paddingHorizontal: 18, borderRadius: radius.md, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonLg: { minHeight: 54, paddingHorizontal: 22, borderRadius: radius.lg },
  buttonText: { fontSize: 15, fontWeight: '600' },
  buttonTextLg: { fontSize: 16 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: ink[200], ...shadow },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16,
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ink[200],
  },
  rowValue: { color: ink[900], fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.md,
    borderWidth: 1, borderColor: ink[200],
  },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 14, fontSize: 16, color: ink[950] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  alert: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md },
  alertTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  alertText: { fontSize: 14, lineHeight: 20 },
  segmented: { flexDirection: 'row', backgroundColor: ink[100], borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 9, alignItems: 'center' },
  segmentOn: { backgroundColor: '#fff', ...shadow, shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segmentOnDark: { backgroundColor: '#fff' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 36, paddingHorizontal: 20 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: ink[100], alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
