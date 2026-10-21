import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import type en from '@/i18n/locales/en.json';
import type { Translate } from '@/i18n';
import { tick } from '@/lib/haptics';
import { Button } from './Button';
import { Icon } from './Icon';
import { AnimatedPressable, pressFeedback, usePressScale } from './motion';
import { Sheet } from './Sheet';
import { Text } from './Text';

/** A concept explained in `en.json` under `explain.<topic>` (term, title, body, example, why?). */
export type ExplainTopic = keyof typeof en.explain;

/** The explanation of a topic, read from i18n (`why` is optional). */
export function useExplanation(topic: ExplainTopic) {
  const { t, i18n } = useTranslation();
  const tr = t as unknown as Translate;
  const key = (part: string) => `explain.${topic}.${part}`;
  const text = (part: string) => (i18n.exists(key(part)) ? tr(key(part)) : undefined);
  return {
    term: tr(key('term')),
    title: tr(key('title')),
    body: tr(key('body')),
    example: text('example'),
    why: text('why'),
  };
}

/**
 * "What's this?": a small ⓘ next to a concept a beginner may not know (DECISIONS 124). The
 * target is the full 44 pt, but negative margins keep it from making its row taller. Opens a
 * bottom sheet with 2–4 plain sentences, an example with numbers and, when useful, why it matters.
 */
export function InfoButton({
  topic,
  style,
  link = false,
}: {
  topic: ExplainTopic;
  style?: StyleProp<ViewStyle>;
  /**
   * A text link ("What does this mean?") instead of the ⓘ: for rows that are one control as a
   * whole (a switch row), where a button inside the row could not be reached.
   */
  link?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const press = usePressScale(pressFeedback.icon);
  const info = useExplanation(topic);
  const box = touch.minTarget;
  if (link)
    return (
      <>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={t('help.about', { term: info.term })}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          onPress={() => {
            tick();
            setOpen(true);
          }}
          style={[
            {
              minHeight: box,
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: press.opacity,
            },
            style,
            press.style,
          ]}
        >
          <Icon name="info" size={16} color={colors.textMuted} />
          <Text variant="bodyS" semibold muted style={{ textDecorationLine: 'underline' }}>
            {t('help.whatsThis')}
          </Text>
        </AnimatedPressable>
        <ExplainSheet visible={open} onClose={() => setOpen(false)} info={info} />
      </>
    );
  return (
    <>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={t('help.about', { term: info.term })}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          tick();
          setOpen(true);
        }}
        style={[
          {
            width: box,
            height: box,
            margin: -12,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: press.opacity,
          },
          style,
          press.style,
        ]}
      >
        <Icon name="info" size={18} color={colors.textMuted} />
      </AnimatedPressable>
      <ExplainSheet visible={open} onClose={() => setOpen(false)} info={info} />
    </>
  );
}

function ExplainSheet({
  visible,
  onClose,
  info,
}: {
  visible: boolean;
  onClose: () => void;
  info: ReturnType<typeof useExplanation>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={info.title}
      closeLabel={t('common.close')}
      footer={<Button label={t('help.gotIt')} variant="secondary" onPress={onClose} />}
    >
      <Text>{info.body}</Text>
      {info.example ? (
        <View
          style={{
            gap: 4,
            padding: 14,
            borderRadius: radius.tile,
            backgroundColor: colors.surfaceAlt,
          }}
        >
          <Text variant="bodyS" semibold muted>
            {t('help.forExample')}
          </Text>
          <Text>{info.example}</Text>
        </View>
      ) : null}
      {info.why ? (
        <View style={{ gap: 4 }}>
          <Text variant="bodyS" semibold muted>
            {t('help.why')}
          </Text>
          <Text>{info.why}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}
