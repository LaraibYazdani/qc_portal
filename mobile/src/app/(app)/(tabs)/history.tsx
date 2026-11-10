/** History tab: recent print checks, mine or my company's, filtered by result. */
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, ApiError, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fileUrl } from '@/lib/config';
import { timeAgo } from '@/lib/format';
import { CHECKER_ROLES, Inspection, Verdict } from '@/lib/types';
import { ink, mono, radius } from '@/components/theme';
import { Alert, Empty, Loading, Segmented, T, VerdictBadge } from '@/components/ui';

type Filter = 'all' | Verdict;

export default function History() {
  const { user } = useAuth();
  const [items, setItems] = useState<Inspection[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [mine, setMine] = useState<'mine' | 'team'>('mine');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const canCheck = !!user && CHECKER_ROLES.includes(user.role);
  const supervisor = !!user && user.role !== 'operator';

  const load = useCallback(async () => {
    if (!canCheck) return;
    const q = new URLSearchParams({ limit: '100' });
    if (filter !== 'all') q.set('verdict', filter);
    if (mine === 'mine') q.set('mine', '1');
    try {
      const res = await api<{ data: Inspection[] }>(`/api/inspections?${q}`);
      setItems(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'Your role cannot see print checks.' : errorText(e));
    }
  }, [canCheck, filter, mine]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!canCheck) {
    return <Empty icon="lock-closed-outline" title="No print checks for your role" text="Quality checkers and supervisors see their checks here." />;
  }

  return (
    <FlatList
      data={items ?? []}
      keyExtractor={i => String(i.id)}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 6 }}>
          {supervisor && (
            <Segmented value={mine} onChange={v => { setItems(null); setMine(v); }} options={[
              { value: 'mine', label: 'My checks' }, { value: 'team', label: 'Everyone' },
            ]} />
          )}
          <Segmented<Filter> value={filter} onChange={v => { setItems(null); setFilter(v); }} options={[
            { value: 'all', label: 'All' }, { value: 'PASS', label: 'Pass' }, { value: 'FAIL', label: 'Fail' }, { value: 'RETAKE', label: 'Retake' },
          ]} />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {items === null && !error ? <Loading /> : null}
        </View>
      }
      ListEmptyComponent={items ? (
        <Empty icon="time-outline" title="No checks yet"
          text={filter === 'all' ? 'Checks you make appear here.' : 'No checks with this result.'} />
      ) : undefined}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push({ pathname: '/inspection/[id]', params: { id: String(item.id) } })}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: ink[50] }]}>
          <View style={styles.thumb}>
            <Image source={{ uri: fileUrl(item.overlay ?? item.photo_path)! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={100} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T style={[styles.jobNo, mono]}>{item.job_number}</T>
              <VerdictBadge verdict={item.verdict} status={item.status} />
            </View>
            {item.design_name ? <T variant="small" numberOfLines={1}>{item.design_name}</T> : null}
            <T variant="caption" numberOfLines={1}>
              {timeAgo(item.created_at)}{mine === 'team' ? ` · ${item.inspected_by_name}` : ''}
              {item.defect_count ? ` · ${item.defect_count} defect${item.defect_count === 1 ? '' : 's'}` : ''}
            </T>
          </View>
          <Ionicons name="chevron-forward" size={18} color={ink[300]} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: radius.lg, padding: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: ink[200],
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: ink[100], overflow: 'hidden' },
  jobNo: { fontSize: 16, fontWeight: '700', color: ink[950] },
});
