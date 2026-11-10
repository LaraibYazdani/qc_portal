/** Account tab: who is signed in, the server, sign out. */
import React, { useCallback, useState } from 'react';
import { Alert as RNAlert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { initials } from '@/lib/format';
import { EngineStatus, ROLE_LABELS } from '@/lib/types';
import { brand } from '@/components/theme';
import { Badge, Button, Card, Row, T } from '@/components/ui';

export default function Account() {
  const { user, signOut, refresh } = useAuth();
  const [engine, setEngine] = useState<EngineStatus | null | 'offline'>(null);

  useFocusEffect(useCallback(() => {
    refresh().catch(() => {});
    api<{ data: EngineStatus }>('/api/engine/status').then(r => setEngine(r.data)).catch(() => setEngine('offline'));
  }, [refresh]));

  const confirmSignOut = () => {
    if (Platform.OS === 'web') { signOut(); return; }
    RNAlert.alert('Sign out?', 'You will need to sign in again to check prints.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  if (!user) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 24 }}>
        <View style={styles.avatar}><T style={styles.avatarText}>{initials(user.name)}</T></View>
        <T variant="title" style={{ marginTop: 6, textAlign: 'center' }}>{user.name}</T>
        <T variant="small">{user.email}</T>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Badge label={ROLE_LABELS[user.role] ?? user.role} tone="info" />
          {user.company_name ? <Badge label={user.company_name} /> : null}
        </View>
      </Card>

      <Card style={{ paddingVertical: 6 }}>
        <Row label="Server" value={API_URL.replace(/^https?:\/\//, '')} />
        <Row label="Photo checks" value={
          engine === null ? <T variant="small">…</T>
            : engine === 'offline' ? <Badge label="Can't reach server" tone="danger" />
            : engine.enabled ? <Badge label={engine.checks_waiting ? `On · ${engine.checks_waiting} waiting` : 'On'} tone="success" dot />
            : <Badge label="Not switched on yet" tone="warning" />
        } />
        <Row label="App version" value={Constants.expoConfig?.version ?? '—'} last />
      </Card>

      <Button title="Sign out" variant="secondary" icon="log-out-outline" size="lg" onPress={confirmSignOut} />
      <T variant="caption" style={{ textAlign: 'center' }}>Designs and checks are managed in the PackVision web portal.</T>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: brand[600], alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '700' },
});
