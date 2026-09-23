import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { LegalKey } from '../api';
import { colors, fonts, space } from '../theme';
import { Row } from './Layout';
import { Text } from './Text';

/** Renders the simple markdown used by the legal documents (#, ##, - lists, paragraphs). */
export function LegalText({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <View style={{ gap: 8 }}>
      {lines.map((raw, i) => {
        const line = raw.trim();
        if (!line) return <View key={i} style={{ height: 4 }} />;
        if (line.startsWith('## '))
          return (
            <Text key={i} variant="h3" accessibilityRole="header" style={{ marginTop: space.sm }}>
              {line.slice(3)}
            </Text>
          );
        if (line.startsWith('# '))
          return (
            <Text key={i} variant="h1" accessibilityRole="header">
              {line.slice(2)}
            </Text>
          );
        if (line.startsWith('- '))
          return (
            <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
              <Text color={colors.cobalt}>•</Text>
              <Text color={colors.textSoft} style={{ flex: 1 }}>
                {line.slice(2)}
              </Text>
            </Row>
          );
        return (
          <Text key={i} color={colors.textSoft}>
            {line}
          </Text>
        );
      })}
    </View>
  );
}

const LINKS: { key: LegalKey; label: string }[] = [
  { key: 'TERMS', label: 'תקנון' },
  { key: 'PRIVACY', label: 'פרטיות' },
  { key: 'CANCELLATION', label: 'ביטולים והחזרות' },
  { key: 'ACCESSIBILITY', label: 'נגישות' },
];

export const openLegal = (key: LegalKey) => router.push({ pathname: '/legal/[key]', params: { key } });

/** Footer with links to all legal documents. */
export function LegalLinks({ dark }: { dark?: boolean }) {
  return (
    <Row gap={4} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
      {LINKS.map((l, i) => (
        <Row key={l.key} gap={4}>
          {i > 0 && <Text color={dark ? colors.onDarkMuted : colors.textMuted}>·</Text>}
          <Pressable onPress={() => openLegal(l.key)} accessibilityRole="link" hitSlop={6}>
            <Text variant="small" weight={fonts.medium} color={dark ? colors.onDarkSoft : colors.textSoft} style={{ textDecorationLine: 'underline' }}>
              {l.label}
            </Text>
          </Pressable>
        </Row>
      ))}
    </Row>
  );
}

/** Inline link inside a sentence (e.g. "אני מסכים לתקנון"). */
export function LegalLink({ docKey, children }: { docKey: LegalKey; children: string }) {
  return (
    <Text
      accessibilityRole="link"
      onPress={() => openLegal(docKey)}
      color={colors.cobalt}
      weight={fonts.semibold}
      style={{ textDecorationLine: 'underline' }}
    >
      {children}
    </Text>
  );
}
