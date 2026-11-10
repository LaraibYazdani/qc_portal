/** Photograph a printed sheet (or pick a photo), review it, send it for checking. */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, errorText } from '@/lib/api';
import { preparePhoto, uploadForCheck } from '@/lib/photo';
import { Sensitivity, SENSITIVITY_OPTIONS } from '@/lib/types';
import { brand, mono } from '@/components/theme';
import { Button, Segmented, T } from '@/components/ui';

type Shot = { uri: string; width?: number; height?: number };

export default function CheckCamera() {
  const params = useLocalSearchParams<{ jobId: string; jobNumber?: string; sensitivity?: Sensitivity }>();
  const jobId = Number(params.jobId);
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [taking, setTaking] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>(params.sensitivity ?? 'normal');
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'uploading'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const take = async () => {
    if (!camera.current || !ready || taking) return;
    setTaking(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const pic = await camera.current.takePictureAsync({ quality: 0.92, skipProcessing: false, exif: false });
      if (pic) setShot({ uri: pic.uri, width: pic.width, height: pic.height });
    } catch {
      setError('The photo could not be taken. Try again.');
    } finally {
      setTaking(false);
    }
  };

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setShot({ uri: a.uri, width: a.width, height: a.height });
    }
  };

  const send = async () => {
    if (!shot) return;
    setError(null);
    try {
      setPhase('preparing');
      const photo = await preparePhoto(shot.uri, shot.width, shot.height);
      setPhase('uploading');
      setProgress(0);
      const id = await uploadForCheck(jobId, photo.uri, sensitivity, setProgress);
      router.replace({ pathname: '/inspection/[id]', params: { id: String(id), fresh: '1' } });
    } catch (e) {
      setPhase('idle');
      setError(e instanceof ApiError && e.code === 'REFERENCE_NOT_APPROVED'
        ? `${e.message} Go back to the job to see why.` : errorText(e));
    }
  };

  // ── Review the photo before sending ─────────────────────────────────────────
  if (shot) {
    const busy = phase !== 'idle';
    return (
      <View style={styles.dark}>
        <StatusBar style="light" />
        <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <RoundButton icon="close" label="Cancel" onPress={close} disabled={busy} />
          <T style={styles.topTitle}>Job <T style={[styles.topTitle, mono]}>{params.jobNumber ?? ''}</T></T>
          <View style={{ width: 44 }} />
        </View>
        <View style={[styles.reviewPanel, { paddingBottom: insets.bottom + 16 }]}>
          {error ? <T style={styles.error}>{error}</T> : (
            <T style={styles.reviewHint}>Is the whole sheet in the photo, sharp and evenly lit?</T>
          )}
          <Segmented dark value={sensitivity} onChange={setSensitivity} options={SENSITIVITY_OPTIONS} />
          {busy ? (
            <View style={{ gap: 10, paddingVertical: 6 }}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round((phase === 'preparing' ? 0.05 : Math.max(progress, 0.05)) * 100)}%` }]} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <ActivityIndicator color="#fff" size="small" />
                <T style={{ color: '#fff' }}>{phase === 'preparing' ? 'Preparing the photo…' : `Sending… ${Math.round(progress * 100)}%`}</T>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button title="Retake" variant="light" icon="refresh" size="lg" style={{ flex: 1 }}
                onPress={() => { setShot(null); setError(null); }} />
              <Button title="Check print" icon="shield-checkmark" size="lg" style={{ flex: 1.4 }} onPress={send} />
            </View>
          )}
        </View>
      </View>
    );
  }

  // ── Camera permission ───────────────────────────────────────────────────────
  if (!permission) return <View style={styles.dark} />;
  if (!permission.granted) {
    return (
      <View style={[styles.dark, styles.center, { padding: 28, gap: 14 }]}>
        <StatusBar style="light" />
        <View style={styles.permIcon}><Ionicons name="camera" size={30} color="#fff" /></View>
        <T style={styles.permTitle}>Camera access</T>
        <T style={styles.permText}>PackVision needs the camera to photograph printed sheets. Photos are only sent when you press Check print.</T>
        {permission.canAskAgain ? (
          <Button title="Allow camera" size="lg" onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
        ) : (
          <Button title="Open settings" size="lg" onPress={() => Linking.openSettings()} style={{ alignSelf: 'stretch' }} />
        )}
        <Button title="Choose a photo instead" variant="light" onPress={pick} style={{ alignSelf: 'stretch' }} />
        <Button title="Cancel" variant="ghost" onPress={close} />
      </View>
    );
  }

  // ── Camera ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.dark}>
      <StatusBar style="light" />
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch}
        onCameraReady={() => setReady(true)} onMountError={() => setError('The camera could not start.')} />

      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
        <FrameGuide />
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <RoundButton icon="close" label="Close" onPress={close} />
        <View style={{ alignItems: 'center' }}>
          <T style={styles.topTitle}>Job <T style={[styles.topTitle, mono]}>{params.jobNumber ?? ''}</T></T>
          <T style={styles.topSub}>{SENSITIVITY_OPTIONS.find(o => o.value === sensitivity)?.label} check</T>
        </View>
        <RoundButton icon={torch ? 'flashlight' : 'flashlight-outline'} label={torch ? 'Torch off' : 'Torch on'}
          onPress={() => setTorch(t => !t)} active={torch} />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <T style={styles.hint}>{error ?? 'Lay the sheet flat, printed side up. Fit the whole sheet inside the frame.'}</T>
        <View style={styles.controls}>
          <RoundButton icon="images" label="Choose a photo" onPress={pick} size={52} />
          <Pressable onPress={take} disabled={!ready || taking} accessibilityRole="button" accessibilityLabel="Take photo"
            style={({ pressed }) => [styles.shutter, (pressed || taking) && { transform: [{ scale: 0.94 }] }, !ready && { opacity: 0.5 }]}>
            <View style={styles.shutterInner}>{taking ? <ActivityIndicator color={brand[600]} /> : null}</View>
          </Pressable>
          <View style={{ width: 52 }} />
        </View>
      </View>
    </View>
  );
}

function RoundButton({ icon, label, onPress, size = 44, active, disabled }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; size?: number; active?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => [styles.round, { width: size, height: size, borderRadius: size / 2 },
        active && { backgroundColor: '#fff' }, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}>
      <Ionicons name={icon} size={size * 0.48} color={active ? '#111' : '#fff'} />
    </Pressable>
  );
}

/** Viewfinder corners, like PackVision's mark. */
function FrameGuide() {
  const corner = (pos: object, rot: string) => <View style={[styles.corner, pos, { transform: [{ rotate: rot }] }]} />;
  return (
    <View style={styles.frame}>
      {corner({ top: 0, left: 0 }, '0deg')}
      {corner({ top: 0, right: 0 }, '90deg')}
      {corner({ bottom: 0, right: 0 }, '180deg')}
      {corner({ bottom: 0, left: 0 }, '270deg')}
    </View>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.35)' },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  topSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  round: { backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  frame: { width: '86%', aspectRatio: 0.72, maxHeight: '66%' },
  corner: { position: 'absolute', width: 44, height: 44, borderColor: '#fff', borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14, opacity: 0.9 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 16, backgroundColor: 'rgba(0,0,0,0.4)', gap: 18 },
  hint: { color: '#fff', textAlign: 'center', fontSize: 14, paddingHorizontal: 32 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 36 },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  reviewPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 14, backgroundColor: 'rgba(8,10,18,0.82)' },
  reviewHint: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontSize: 14 },
  error: { color: '#FCA5A5', textAlign: 'center', fontSize: 14 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: brand[400] },
  permIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: brand[600], alignItems: 'center', justifyContent: 'center' },
  permTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  permText: { color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontSize: 15, lineHeight: 22, marginBottom: 6 },
});
