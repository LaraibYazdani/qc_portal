import React from 'react';
import { ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand, colors, ink } from '@/components/theme';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
const icon = (on: Icon, off: Icon) => ({ color, focused }: { color: ColorValue; focused: boolean }) =>
  <Ionicons name={focused ? on : off} size={24} color={color as string} />;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: brand[600],
      tabBarInactiveTintColor: ink[400],
      // Room for icon + label above the home indicator on every phone (the default clips labels on some)
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: ink[100], height: 64 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) },
      // Fixed line height and no shrinking: otherwise the icon squeezes the label to a few pixels
      tabBarLabelStyle: { fontSize: 11, lineHeight: 14, minHeight: 14, flexShrink: 0, fontWeight: '600' },
      headerStyle: { backgroundColor: colors.canvas },
      headerShadowVisible: false,
      headerTitleStyle: { color: ink[950], fontWeight: '700', fontSize: 17 },
      sceneStyle: { backgroundColor: colors.canvas },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Check', headerShown: false, tabBarIcon: icon('scan', 'scan-outline') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('time', 'time-outline') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
