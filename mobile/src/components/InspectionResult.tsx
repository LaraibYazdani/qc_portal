/** The full result of one print check: verdict, marked photo, defects, inks, details. */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fileUrl } from '@/lib/config';
import { formatDateTime } from '@/lib/format';
import { Inspection } from '@/lib/types';
import { Artwork } from './Artwork';
import { colors, ink, radius } from './theme';
import { Alert, Badge, Card, Row, Segmented, T, VERDICT } from './ui';

const SENSITIVITY_LABEL = { low: 'Tolerant', normal: 'Normal', high: 'Strict' } as const;

export function VerdictBanner({ inspection }: { inspection: Inspection }) {
  if (!inspection.verdict) return null;
  const v = VERDICT[inspection.verdict];
  return (
    <View style={[styles.banner, { backgroundColor: v.color }]} accessibilityRole="summary"
      accessibilityLabel={`${v.label}. ${v.sub}`}>
      <Ionicons name={v.icon} size={44} color="#fff" />
      <View style={{ flex: 1 }}>
        <T style={styles.bannerTitle}>{v.label}</T>
        <T style={styles.bannerSub}>{v.sub}</T>
      </View>
    </View>
  );
}

export function InspectionResult({ inspection }: { inspection: Inspection }) {
  const r = inspection.result;
  const [image, setImage] = useState<'overlay' | 'heatmap' | 'photo'>('overlay');
  const [tab, setTab] = useState<'defects' | 'inks' | 'details'>('defects');

  if (inspection.status === 'failed' || !r || !inspection.verdict) {
    return (
      <Alert tone="danger" title="The check could not be completed">
        {`${inspection.error ? inspection.error + '. ' : ''}Try again; if it keeps happening, tell IT.`}
      </Alert>
    );
  }

  const shown = image === 'photo' ? inspection.photo_path : r.images[image] ?? inspection.photo_path;
  const inks = r.inks.filter(i => i.status !== 'NOT VISIBLE');
  const imageOptions = [
    ...(r.images.overlay ? [{ value: 'overlay' as const, label: 'Marked' }] : []),
    ...(r.images.heatmap ? [{ value: 'heatmap' as const, label: 'Differences' }] : []),
    { value: 'photo' as const, label: 'Photo' },
  ];

  return (
    <View style={{ gap: 16 }}>
      <VerdictBanner inspection={inspection} />

      {r.reasons.length > 0 && (
        <View style={{ gap: 6 }}>
          {r.reasons.map((reason, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <T style={{ color: ink[400] }}>•</T>
              <T style={{ flex: 1 }}>{reason}</T>
            </View>
          ))}
        </View>
      )}

      <Card style={{ gap: 12 }}>
        {imageOptions.length > 1 && <Segmented value={image} onChange={setImage} options={imageOptions} />}
        <Artwork path={shown} height={300} label={`Job ${inspection.job_number}, checked print`} />
      </Card>

      <Segmented value={tab} onChange={setTab} options={[
        { value: 'defects', label: 'Defects', count: r.defects.length },
        { value: 'inks', label: 'Inks', count: inks.length },
        { value: 'details', label: 'Details' },
      ]} />

      {tab === 'defects' && (r.defects.length === 0 ? (
        <Card><T variant="small">{r.match_failed ? 'Not compared: the photo did not match the design.' : 'No print defects found.'}</T></Card>
      ) : (
        <View style={{ gap: 12 }}>
          {r.defects.map(d => (
            <Card key={d.id} padded={false} style={{ overflow: 'hidden' }}>
              {d.closeup ? (
                <Image source={{ uri: fileUrl(d.closeup)! }} style={styles.closeup} contentFit="contain" transition={120}
                  accessibilityLabel={`Defect ${d.id} close-up`} />
              ) : null}
              <View style={styles.defectRow}>
                <View style={styles.defectNo}><T style={styles.defectNoText}>{d.id}</T></View>
                <T variant="heading" style={{ flex: 1, fontSize: 15 }}>{d.type}</T>
                <T variant="caption">ΔE {d.severity}</T>
              </View>
            </Card>
          ))}
          <T variant="caption">Each close-up shows the approved design on the left and the print on the right.</T>
        </View>
      ))}

      {tab === 'inks' && (inks.length === 0 ? (
        <Card><T variant="small">No ink colours could be measured in this photo.</T></Card>
      ) : (
        <Card padded={false}>
          {inks.map((i, n) => (
            <View key={i.name} style={[styles.inkRow, n === inks.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={[styles.swatch, { backgroundColor: i.hex }]} />
              <View style={{ flex: 1 }}>
                <T variant="small" style={{ color: ink[900], fontWeight: '600' }}>{i.name}</T>
                <T variant="caption">ΔE {i.delta_e ?? '—'}{i.limit ? ` / ${i.limit}` : ''}</T>
              </View>
              {i.photo_hex ? <View style={[styles.swatch, { backgroundColor: i.photo_hex }]} accessibilityLabel="Printed colour" /> : null}
              {i.status === 'PASS' ? <Badge label="OK" tone="success" /> : <Badge label={i.note || 'Off'} tone="danger" />}
            </View>
          ))}
        </Card>
      ))}

      {tab === 'details' && (
        <Card style={{ paddingVertical: 6 }}>
          <Row label="Job" value={`${inspection.job_number} · design v${inspection.version_no}`} />
          <Row label="Design shown in photo" value={`${Math.round((r.coverage ?? 0) * 100)}%`} />
          <Row label="Similarity" value={r.ssim != null ? r.ssim.toFixed(3) : '—'} />
          <Row label="Matching points" value={String(r.inliers ?? 0)} />
          <Row label="Sensitivity" value={SENSITIVITY_LABEL[inspection.sensitivity]} />
          <Row label="Lighting correction" value={r.lighting ?? '—'} />
          <Row label="Checked by" value={inspection.inspected_by_name} />
          <Row label="When" value={formatDateTime(inspection.completed_at ?? inspection.created_at)} />
          <Row label="Time taken" value={`${r.seconds} s`} last />
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.xl, paddingHorizontal: 18, paddingVertical: 18 },
  bannerTitle: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.4 },
  bannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  closeup: { width: '100%', aspectRatio: 2, backgroundColor: ink[50] },
  defectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  defectNo: { width: 24, height: 24, borderRadius: 6, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  defectNoText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  inkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ink[200] },
  swatch: { width: 24, height: 24, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.15)' },
});
