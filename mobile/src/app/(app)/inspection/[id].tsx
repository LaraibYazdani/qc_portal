/** One print check: waits while it runs, then shows the result. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api, errorText } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Inspection } from '@/lib/types';
import { Artwork } from '@/components/Artwork';
import { InspectionResult } from '@/components/InspectionResult';
import { brand, ink, mono } from '@/components/theme';
import { Alert, Button, Card, Loading, T } from '@/components/ui';

const POLL_MS = 1500;

export default function InspectionScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announced = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ data: Inspection }>(`/api/inspections/${id}`);
      const i = res.data;
      setInspection(i);
      setError(null);
      if (i.status === 'queued' || i.status === 'processing') {
        timer.current = setTimeout(load, POLL_MS);
      } else if (fresh && !announced.current) {
        announced.current = true;
        Haptics.notificationAsync(i.verdict === 'PASS' ? Haptics.NotificationFeedbackType.Success
          : i.verdict === 'RETAKE' ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    } catch (e) {
      setError(errorText(e));
      timer.current = setTimeout(load, POLL_MS * 3);   // keep trying through a Wi-Fi blip
    }
  }, [id, fresh]);

  useEffect(() => {
    load();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  const waiting = inspection && (inspection.status === 'queued' || inspection.status === 'processing');
  const again = () => inspection && router.replace({
    pathname: '/check/[jobId]',
    params: { jobId: String(inspection.job_id), jobNumber: inspection.job_number, sensitivity: inspection.sensitivity },
  });

  return (
    <>
      <Stack.Screen options={{ title: inspection ? `Job ${inspection.job_number}` : 'Print check' }} />
      <ScrollView contentContainerStyle={styles.page}>
        {!inspection ? (
          error ? <Alert tone="danger">{error}</Alert> : <Loading />
        ) : waiting ? (
          <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 28 }}>
            <Scanner />
            <T variant="title" style={{ textAlign: 'center' }}>Checking the print…</T>
            <T variant="small" style={{ textAlign: 'center', maxWidth: 300 }}>
              {inspection.status === 'queued' && inspection.queue_position
                ? `${inspection.queue_position} check${inspection.queue_position === 1 ? '' : 's'} ahead of yours.`
                : `Comparing with job ${inspection.job_number}'s approved design. Usually 10–30 seconds.`}
            </T>
            <Artwork path={inspection.photo_path} height={180} style={{ alignSelf: 'stretch' }} zoomable={false} label="Your photo" />
            {error ? <T variant="caption" style={{ color: ink[500] }}>Connection lost, retrying…</T> : null}
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <T style={[styles.jobNo, mono]}>{inspection.job_number}</T>
              <T variant="caption">{formatDateTime(inspection.completed_at ?? inspection.created_at)} · {inspection.inspected_by_name}</T>
            </View>
            <InspectionResult inspection={inspection} />
            <View style={{ gap: 10, marginTop: 4 }}>
              <Button title={inspection.verdict === 'PASS' ? 'Check another print' : 'Take a new photo'} size="lg" icon="camera" onPress={again} />
              <Button title="Back to the job" variant="secondary" size="lg"
                onPress={() => router.dismissTo({ pathname: '/job/[id]', params: { id: String(inspection.job_id), jobNumber: inspection.job_number } })} />
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

/** A scan line sweeping over a sheet while the engine works. */
function Scanner() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(t, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <View style={styles.sheet}>
      <Animated.View style={[styles.scan, { transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, 68] }) }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16, paddingBottom: 40 },
  jobNo: { fontSize: 20, fontWeight: '700', color: ink[950] },
  sheet: { width: 64, height: 76, borderRadius: 8, backgroundColor: brand[50], borderWidth: 2, borderColor: brand[300], overflow: 'hidden' },
  scan: { height: 4, marginHorizontal: -2, backgroundColor: brand[500], opacity: 0.85 },
});
