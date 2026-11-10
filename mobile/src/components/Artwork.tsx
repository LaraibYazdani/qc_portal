/** Designs and photos from the API: tap to see full screen (pinch to zoom on iPhone, double-tap zoom elsewhere). */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fileUrl } from '@/lib/config';
import { ink, radius } from './theme';
import { T } from './ui';

/** `height` is the most the frame may take; once the image is known the frame takes its shape
 *  (carton artwork is often a wide strip), but never less than 140 px. */
export function Artwork({ path, style, height = 260, label, zoomable = true }: {
  path?: string | null; style?: StyleProp<ViewStyle>; height?: number; label?: string; zoomable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);   // width / height
  const [frameWidth, setFrameWidth] = useState(0);
  const uri = fileUrl(path);
  useEffect(() => { setFailed(false); setRatio(null); }, [uri]);
  const fitted =ratio && frameWidth ? Math.max(140, Math.min(height, frameWidth / ratio)) : height;

  return (
    <>
      <Pressable disabled={!zoomable || !uri || failed} onPress={() => setOpen(true)}
        onLayout={e => setFrameWidth(e.nativeEvent.layout.width)}
        accessibilityRole="imagebutton" accessibilityLabel={label ? `${label}, open full screen` : 'Open full screen'}
        style={[styles.frame, { height: fitted }, style]}>
        {uri && !failed ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={150}
            onLoad={e => { const { width, height: h } = e.source; if (width && h) setRatio(width / h); }}
            onError={() => setFailed(true)} accessibilityLabel={label} />
        ) : (
          <View style={styles.missing}>
            <Ionicons name="image-outline" size={28} color={ink[300]} />
            <T variant="caption">{uri ? 'Image not available' : 'No image'}</T>
          </View>
        )}
        {zoomable && uri && !failed ? (
          <View style={styles.expand}><Ionicons name="expand" size={14} color="#fff" /></View>
        ) : null}
      </Pressable>
      {uri ? <ImageViewer uri={uri} visible={open} onClose={() => setOpen(false)} title={label} /> : null}
    </>
  );
}

export function ImageViewer({ uri, visible, onClose, title }: { uri: string; visible: boolean; onClose: () => void; title?: string }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [zoomed, setZoomed] = useState(false);
  const size = zoomed ? { width: width * 2.5, height: height * 2.5 } : { width, height };
  return (
    <Modal visible={visible} onRequestClose={() => { setZoomed(false); onClose(); }} animationType="fade"
      presentationStyle="fullScreen" statusBarTranslucent>
      <View style={styles.viewer}>
        {/* iPhone: pinch zoom from the outer scroll view. Everywhere: tap for 2.5×, then pan both ways. */}
        <ScrollView maximumZoomScale={5} minimumZoomScale={1} centerContent bouncesZoom
          showsVerticalScrollIndicator={false}>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
            <Pressable onPress={() => setZoomed(z => !z)} style={size}>
              <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
            </Pressable>
          </ScrollView>
        </ScrollView>
        <View style={[styles.viewerBar, { paddingTop: insets.top + 8 }]}>
          <T variant="small" style={{ color: '#fff', flex: 1 }} numberOfLines={1}>{title ?? ''}</T>
          <Pressable onPress={() => { setZoomed(false); onClose(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
        <T variant="caption" style={[styles.hint, { bottom: insets.bottom + 16 }]}>
          {zoomed ? 'Tap to fit the screen' : 'Tap or pinch to zoom'}
        </T>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: ink[50], borderRadius: radius.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: ink[200] },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  expand: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(12,16,32,0.55)', borderRadius: 8, padding: 6 },
  viewer: { flex: 1, backgroundColor: '#05070D' },
  viewerBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, backgroundColor: 'rgba(5,7,13,0.6)' },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', alignSelf: 'center', color: 'rgba(255,255,255,0.7)' },
});
