/** Everything behind sign-in. Signed out → the sign-in screen. */
import React, { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { brand, colors, ink } from '@/components/theme';

export default function SignedInLayout() {
  const { status } = useAuth();
  // A layout must always render its navigator (returning null or a <Redirect> instead makes
  // Expo Router loop), so leave for the sign-in screen from an effect once it has mounted.
  // While the session is still loading the launch screen covers this.
  useEffect(() => {
    if (status === 'signedOut') router.replace('/login');
  }, [status]);

  return (
    <Stack screenOptions={{
      headerTintColor: brand[700],
      headerTitleStyle: { color: ink[950], fontWeight: '600' },
      headerStyle: { backgroundColor: colors.canvas },
      headerShadowVisible: false,
      headerBackButtonDisplayMode: 'minimal',
      contentStyle: { backgroundColor: colors.canvas },
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
      <Stack.Screen name="check/[jobId]" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="inspection/[id]" options={{ title: 'Print check' }} />
    </Stack>
  );
}
