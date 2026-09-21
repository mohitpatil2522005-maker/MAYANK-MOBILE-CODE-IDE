import { Link, Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePalette } from '@/src/constants/theme';

export default function NotFoundScreen() {
  const palette = usePalette();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={[styles.container, { backgroundColor: palette.bg }]}>
        <Text style={[styles.title, { color: palette.text }]}>404</Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>
          This screen doesn&apos;t exist.
        </Text>
        <Link href="/" style={[styles.link, { color: palette.tint }]}>
          Back to the editor
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  title: { fontSize: 48, fontWeight: '800' },
  body: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '600', marginTop: 8 },
});
