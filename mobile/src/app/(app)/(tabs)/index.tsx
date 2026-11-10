/** Check tab: which job are you checking? Job number in, approved design out. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, TextInputInstance, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fileUrl } from '@/lib/config';
import { isUsualJobNumber, normaliseJobNumber } from '@/lib/format';
import { getJSON, KEYS, setJSON } from '@/lib/store';
import { EngineStatus, Job } from '@/lib/types';
import { brand, colors, ink, mono, radius, shadow } from '@/components/theme';
import { Alert, Badge, Card, Empty, Loading, T } from '@/components/ui';
import { referenceTone } from '@/components/reference';

export default function CheckTab() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Job[] | null>(null);
  const [searched, setSearched] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const input = useRef<TextInputInstance>(null);

  useEffect(() => { getJSON<string[]>(KEYS.recent, []).then(setRecent); }, []);
  useFocusEffect(useCallback(() => {
    api<{ data: EngineStatus }>('/api/engine/status').then(r => setEngine(r.data)).catch(() => {});
  }, []));

  const search = async (raw = query) => {
    const job = normaliseJobNumber(raw);
    if (!job) { input.current?.focus(); return; }
    setQuery(job);
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ data: Job[] }>(`/api/jobs/search?job_number=${encodeURIComponent(job)}`);
      setResults(res.data);
      setSearched(job);
      if (res.data.length) {
        const next = [job, ...recent.filter(r => r !== job)].slice(0, 6);
        setRecent(next);
        setJSON(KEYS.recent, next);
      }
      if (res.data.length === 1) open(res.data[0]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  const open = (job: Job) => router.push({ pathname: '/job/[id]', params: { id: String(job.id), jobNumber: job.job_number } });

  const firstName = user?.name?.split(/\s+/)[0];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <T variant="eyebrow" style={{ color: brand[600] }}>{firstName ? `Hello, ${firstName}` : 'Design lookup'}</T>
          <T variant="display" style={{ marginTop: 6 }}>Which job are you checking?</T>
          <T variant="small" style={{ marginTop: 6 }}>Enter the job number from the job card.</T>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={22} color={ink[400]} style={{ marginLeft: 16 }} />
            <TextInput ref={input} value={query} onChangeText={t => setQuery(t.toUpperCase())}
              placeholder="e.g. 267N2943" placeholderTextColor={ink[400]} autoCapitalize="characters" autoCorrect={false}
              spellCheck={false} returnKeyType="search" onSubmitEditing={() => search()} accessibilityLabel="Job number"
              style={[styles.searchInput, query ? mono : null]} />
            {query ? (
              <Pressable onPress={() => { setQuery(''); setResults(null); input.current?.focus(); }} hitSlop={10}
                accessibilityLabel="Clear" style={{ paddingHorizontal: 6 }}>
                <Ionicons name="close-circle" size={20} color={ink[300]} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => search()} style={({ pressed }) => [styles.go, pressed && { backgroundColor: brand[700] }]}
              accessibilityRole="button" accessibilityLabel="Search">
              <Ionicons name="arrow-forward" size={22} color="#fff" />
            </Pressable>
          </View>
          {query.trim() && !isUsualJobNumber(query) ? (
            <T variant="caption" style={{ color: colors.warningText, marginTop: 8 }}>
              Job numbers usually look like 267N2943, 26ON4465 or 2670699.
            </T>
          ) : null}

          {recent.length > 0 && (
            <View style={styles.chips}>
              <T variant="caption" style={{ marginRight: 2 }}>Recent</T>
              {recent.map(r => (
                <Pressable key={r} onPress={() => search(r)} style={({ pressed }) => [styles.chip, pressed && { backgroundColor: ink[100] }]}>
                  <T style={[styles.chipText, mono]}>{r}</T>
                </Pressable>
              ))}
            </View>
          )}

          {engine && !engine.enabled && (
            <Alert tone="info" style={{ marginTop: 20 }} title="Photo checks aren't switched on yet">
              You can look up designs now; checking prints starts once the server is ready.
            </Alert>
          )}

          <View style={{ marginTop: 24, gap: 12 }}>
            {loading && <Loading label="Searching…" />}
            {error && <Alert tone="danger">{error}</Alert>}
            {!loading && results && results.length === 0 && (
              <Card>
                <Empty icon="search" title={`No design found for ${searched}`}
                  text="Check the number on the job card. If it's right, the design may not be uploaded yet: ask pre-press." />
              </Card>
            )}
            {!loading && results && results.length > 1 && (
              <T variant="eyebrow">{results.length} designs for {searched}</T>
            )}
            {!loading && results?.map(job => (
              <Pressable key={job.id} onPress={() => open(job)} accessibilityRole="button"
                style={({ pressed }) => [styles.result, pressed && { opacity: 0.85 }]}>
                <View style={styles.thumb}>
                  {/\.(jpe?g|png)$/i.test(job.image_path)
                    ? <Image source={{ uri: fileUrl(job.image_path)! }} style={StyleSheet.absoluteFill} contentFit="contain" transition={120} />
                    : <Ionicons name="document-text-outline" size={28} color={ink[300]} />}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <T style={[styles.jobNo, mono]}>{job.job_number}</T>
                  {job.design_name ? <T variant="small" numberOfLines={2}>{job.design_name}</T> : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                    {job.company_name ? <Badge label={job.company_name} /> : null}
                    {job.reference_status ? <Badge {...referenceTone(job.reference_status)} dot /> : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={ink[300]} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingTop: 28, paddingBottom: 40 },
  searchBox: {
    marginTop: 22, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.lg,
    borderWidth: 1, borderColor: ink[200], padding: 6, ...shadow,
  },
  searchInput: { flex: 1, minHeight: 52, paddingHorizontal: 12, fontSize: 20, color: ink[950] },
  go: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: brand[600], alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: ink[200] },
  chipText: { fontSize: 13, color: ink[700] },
  result: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: radius.lg, padding: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: ink[200], ...shadow,
  },
  thumb: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: ink[50], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  jobNo: { fontSize: 18, fontWeight: '700', color: ink[950] },
});
