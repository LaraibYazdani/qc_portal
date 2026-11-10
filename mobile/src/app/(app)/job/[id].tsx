/** One job: the approved design, whether it can be checked, and its earlier checks. */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, ApiError, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fileUrl, isImagePath } from '@/lib/config';
import { timeAgo } from '@/lib/format';
import { getItem, KEYS, setItem } from '@/lib/store';
import { CHECKER_ROLES, EngineStatus, Inspection, Reference, Sensitivity, SENSITIVITY_OPTIONS } from '@/lib/types';
import { Artwork } from '@/components/Artwork';
import { referenceTone } from '@/components/reference';
import { brand, ink, mono } from '@/components/theme';
import { Alert, Badge, Button, Card, Empty, Loading, Segmented, T, VerdictBadge } from '@/components/ui';

export default function JobScreen() {
  const { id, jobNumber } = useLocalSearchParams<{ id: string; jobNumber?: string }>();
  const { user } = useAuth();
  const [reference, setReference] = useState<Reference | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [history, setHistory] = useState<Inspection[]>([]);
  const [error, setError] = useState<{ text: string; notYours?: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sensitivity, setSensitivity] = useState<Sensitivity>('normal');

  const canCheck = !!user && CHECKER_ROLES.includes(user.role);

  const load = useCallback(async () => {
    try {
      const [ref, eng, hist] = await Promise.all([
        api<{ data: Reference }>(`/api/jobs/${id}/reference`),
        api<{ data: EngineStatus }>('/api/engine/status'),
        api<{ data: Inspection[] }>(`/api/jobs/${id}/inspections`),
      ]);
      setReference(ref.data);
      setEngine(eng.data);
      setHistory(hist.data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404
        ? { text: "This job belongs to a company you don't work for, so it can't be checked from your account.", notYours: true }
        : { text: errorText(e) });
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    getItem(KEYS.sensitivity).then(v => { if (v === 'low' || v === 'normal' || v === 'high') setSensitivity(v); });
  }, []);

  const pickSensitivity = (v: Sensitivity) => { setSensitivity(v); setItem(KEYS.sensitivity, v); };
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const title = reference?.job_number ?? jobNumber ?? 'Job';
  const designPath = reference ? (isImagePath(reference.design_path) ? reference.design_path : reference.clean) : null;
  const approved = reference?.status === 'approved';

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {error ? (
          <Card><Empty icon={error.notYours ? 'lock-closed-outline' : 'cloud-offline-outline'} title={error.notYours ? 'Not in your company' : "Couldn't load this job"} text={error.text}>
            {!error.notYours && <Button title="Try again" variant="secondary" onPress={load} style={{ marginTop: 8 }} />}
          </Empty></Card>
        ) : !reference ? (
          <Loading />
        ) : (
          <>
            <Card padded={false} style={{ overflow: 'hidden' }}>
              <Artwork path={designPath} height={300} label={`Job ${reference.job_number} approved design`}
                style={{ borderRadius: 0, borderWidth: 0 }} />
              <View style={{ padding: 16, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge label="Approved design" tone="success" dot />
                  {reference.version_no > 1 && <Badge label={`Version ${reference.version_no}`} />}
                </View>
                <T style={[styles.jobNo, mono]}>{reference.job_number}</T>
                {reference.design_name ? <T>{reference.design_name}</T> : null}
                {reference.company_name ? <T variant="small">{reference.company_name}</T> : null}
                {!isImagePath(reference.design_path) && (
                  <Pressable onPress={() => WebBrowser.openBrowserAsync(fileUrl(reference.design_path)!)} style={styles.link}>
                    <Ionicons name="document-text-outline" size={16} color={brand[700]} />
                    <T variant="small" style={{ color: brand[700], fontWeight: '600' }}>Open the design PDF</T>
                  </Pressable>
                )}
              </View>
            </Card>

            <Card style={{ gap: 14 }}>
              <View style={{ gap: 2 }}>
                <T variant="heading">Check a print</T>
                <T variant="small">Lay the printed sheet flat, printed side up, and fit the whole sheet in the photo.</T>
              </View>
              {!canCheck ? (
                <Alert tone="info">Your role can look up designs but not check prints. Ask your administrator if you need to.</Alert>
              ) : engine && !engine.enabled ? (
                <Alert tone="info">Photo checks are not switched on on the server yet.</Alert>
              ) : !approved ? (
                <Alert tone="warning" title={`Can't be checked yet: ${reference.status_label.toLowerCase()}.`}>
                  {reference.status === 'needs_review' ? 'A QC supervisor needs to approve how PackVision reads this design first (in the web portal, Reference review).'
                    : reference.status === 'failed' ? (reference.error ?? 'Ask a supervisor to prepare it again.')
                    : reference.status === 'rejected' ? (reference.review_note ? `Reason: ${reference.review_note}` : 'Ask pre-press for a corrected design.')
                    : 'It is prepared automatically; this usually takes under a minute once it starts.'}
                </Alert>
              ) : (
                <>
                  <View style={{ gap: 6 }}>
                    <T variant="caption">How strict</T>
                    <Segmented value={sensitivity} onChange={pickSensitivity} options={SENSITIVITY_OPTIONS} />
                  </View>
                  <Button title="Take photo" size="lg" icon="camera"
                    onPress={() => router.push({ pathname: '/check/[jobId]', params: { jobId: String(reference.job_id), jobNumber: reference.job_number, sensitivity } })} />
                </>
              )}
              {reference && !approved && <Badge {...referenceTone(reference.status)} dot />}
            </Card>

            <View style={{ gap: 8 }}>
              <T variant="eyebrow" style={{ marginLeft: 4 }}>Earlier checks of this job</T>
              {history.length === 0 ? (
                <Card><T variant="small">No checks yet.</T></Card>
              ) : (
                <Card padded={false}>
                  {history.slice(0, 10).map((h, i) => (
                    <Pressable key={h.id} onPress={() => router.push({ pathname: '/inspection/[id]', params: { id: String(h.id) } })}
                      style={({ pressed }) => [styles.historyRow, i === Math.min(history.length, 10) - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: ink[50] }]}>
                      <VerdictBadge verdict={h.verdict} status={h.status} />
                      <T variant="small" style={{ flex: 1, color: ink[800] }} numberOfLines={1}>{h.inspected_by_name}</T>
                      <T variant="caption">{timeAgo(h.created_at)}</T>
                      <Ionicons name="chevron-forward" size={16} color={ink[300]} />
                    </Pressable>
                  ))}
                </Card>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16, paddingBottom: 40 },
  jobNo: { fontSize: 26, fontWeight: '700', color: ink[950], marginTop: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ink[200] },
});
