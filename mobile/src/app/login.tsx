import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInputInstance, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { errorText } from '@/lib/api';
import { SignInError, useAuth } from '@/lib/auth';
import { brand, ink, radius } from '@/components/theme';
import { Alert, Button, Input, LogoMark, T } from '@/components/ui';

const POINTS: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'search', text: 'Look up the approved design by job number' },
  { icon: 'camera', text: 'Photograph the printed sheet' },
  { icon: 'shield-checkmark', text: 'Pass, fail or retake in about half a minute' },
];

export default function Login() {
  const { status } = useAuth();
  if (status === 'signedIn') return <Redirect href="/" />;
  return <LoginForm />;
}

function LoginForm() {
  const { sapEnabled, signInWithSap, signInWithPassword, notice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);   // with SAP on, email sign-in is folded away
  const [busy, setBusy] = useState<'sap' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(notice);
  const passwordRef = useRef<TextInputInstance>(null);

  const sap = async () => {
    setError(null); setInfo(null); setBusy('sap');
    try {
      await signInWithSap();
    } catch (e) {
      if (e instanceof SignInError && e.info) setInfo(e.message);
      else setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const password_ = async () => {
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setError(null); setInfo(null); setBusy('password');
    try {
      await signInWithPassword(email, password);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const passwordForm = showPassword || !sapEnabled;

  return (
    <View style={{ flex: 1, backgroundColor: ink[900] }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <SafeAreaView edges={['top']} style={styles.hero}>
            <View style={styles.glow} />
            <View style={styles.brandRow}>
              <LogoMark size={44} />
              <View>
                <T style={styles.wordmark}>PackVision</T>
                <T style={styles.group}>Packages Group</T>
              </View>
            </View>
            <T style={styles.heroTitle}>Print checks against the approved design.</T>
            <View style={{ gap: 12, marginTop: 20 }}>
              {POINTS.map(p => (
                <View key={p.text} style={styles.point}>
                  <View style={styles.pointIcon}><Ionicons name={p.icon} size={16} color={brand[200]} /></View>
                  <T style={styles.pointText}>{p.text}</T>
                </View>
              ))}
            </View>
          </SafeAreaView>

          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <T variant="title">Sign in</T>
            <T variant="small" style={{ marginTop: 4, marginBottom: 18 }}>
              {sapEnabled ? 'Use your Packages SAP account.' : 'Use the account your administrator gave you.'}
            </T>

            {info ? <Alert tone="info" style={{ marginBottom: 14 }}>{info}</Alert> : null}
            {error ? <Alert tone="danger" style={{ marginBottom: 14 }}>{error}</Alert> : null}

            {sapEnabled && (
              <Button title="Continue with SAP" size="lg" icon="business" onPress={sap} loading={busy === 'sap'} disabled={!!busy} />
            )}

            {sapEnabled && (
              <Pressable onPress={() => setShowPassword(s => !s)} style={styles.toggle} accessibilityRole="button">
                <View style={styles.rule} />
                <T variant="caption" style={{ color: ink[500] }}>{showPassword ? 'Hide email sign-in' : 'Or sign in with email'}</T>
                <View style={styles.rule} />
              </Pressable>
            )}

            {passwordForm && (
              <View style={{ gap: 14 }}>
                <Input label="Email" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="name@packages.com.pk"
                  autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username"
                  autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
                <Input ref={passwordRef} label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword}
                  placeholder="Password" secureTextEntry textContentType="password" autoComplete="password"
                  returnKeyType="go" onSubmitEditing={password_} />
                <Button title="Sign in" size="lg" variant={sapEnabled ? 'secondary' : 'primary'} onPress={password_}
                  loading={busy === 'password'} disabled={!!busy} style={{ marginTop: 4 }} />
              </View>
            )}
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 24, paddingBottom: 36, overflow: 'hidden' },
  glow: { position: 'absolute', width: 420, height: 420, borderRadius: 210, backgroundColor: brand[600], opacity: 0.22, top: -220, right: -160 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  wordmark: { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  group: { color: ink[300], fontSize: 12, letterSpacing: 0.6 },
  heroTitle: { color: '#fff', fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6, marginTop: 40 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(95,125,250,0.18)', alignItems: 'center', justifyContent: 'center' },
  pointText: { color: ink[200], fontSize: 15, flex: 1 },
  sheet: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: radius.xl + 6, borderTopRightRadius: radius.xl + 6, padding: 24, paddingTop: 28 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: ink[200] },
});
