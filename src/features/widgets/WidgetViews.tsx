import { t as translate } from 'i18next';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { palettes, type ThemeMode } from '@/design/tokens';
import type { Translate } from '@/i18n';
import type { WidgetName, WidgetSnapshot } from './snapshot';

/**
 * The home screen widgets, drawn from a snapshot (snapshot.ts). Same look as the app: white card,
 * Figtree, fills for progress, the accent only on the main action. Taps open the app where it
 * makes sense (deep links of the "fft" scheme).
 */

type HexColor = `#${string}`;
type Palette = (typeof palettes)['light'];

const FONT = 'Figtree_600SemiBold';
const FONT_REGULAR = 'Figtree_400Regular';
// Keys are built from widget names (widgets.macro.protein…): the untyped form.
const t = translate as unknown as Translate;
const hex = (c: string) => c as HexColor;
const fmt = (n: number) => Math.round(n).toLocaleString('en');

function Card({ p, uri, children }: { p: Palette; uri: string; children: React.ReactNode }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hex(p.surface),
        borderRadius: 24,
        borderWidth: 1,
        borderColor: hex(p.borderDecorative),
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {children}
    </FlexWidget>
  );
}

function Label({ p, text }: { p: Palette; text: string }) {
  return (
    <TextWidget
      text={text}
      style={{ fontSize: 13, color: hex(p.textMuted), fontFamily: FONT_REGULAR }}
      maxLines={1}
      truncate="END"
    />
  );
}

function Big({ p, text, size = 26 }: { p: Palette; text: string; size?: number }) {
  return (
    <TextWidget
      text={text}
      style={{ fontSize: size, color: hex(p.text), fontFamily: FONT }}
      maxLines={1}
      truncate="END"
    />
  );
}

/** A 270° arc like the app's calories gauge, filled to `ratio`. */
function arcSvg(ratio: number, color: string, track: string) {
  const r = 34;
  const c = 40;
  const sweep = 270;
  const start = 135;
  const point = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  };
  const path = (to: number) =>
    `M ${point(start)} A ${r} ${r} 0 ${to - start > 180 ? 1 : 0} 1 ${point(to)}`;
  const filled = Math.max(0, Math.min(1, ratio));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <path d="${path(start + sweep)}" fill="none" stroke="${track}" stroke-width="9" stroke-linecap="round"/>
    ${filled > 0.005 ? `<path d="${path(start + sweep * filled)}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"/>` : ''}
  </svg>`;
}

/** A filled bar (track + fill) of a fixed width. */
function Bar({
  p,
  ratio,
  color,
  width,
}: {
  p: Palette;
  ratio: number;
  color: string;
  width: number;
}) {
  const w = Math.round(width * Math.max(0, Math.min(1, ratio)));
  return (
    <FlexWidget
      style={{
        width,
        height: 6,
        borderRadius: 3,
        backgroundColor: hex(p.dotOff),
        flexDirection: 'row',
      }}
    >
      {w > 0 ? (
        <FlexWidget style={{ width: w, height: 6, borderRadius: 3, backgroundColor: hex(color) }} />
      ) : (
        <FlexWidget style={{ width: 1, height: 6 }} />
      )}
    </FlexWidget>
  );
}

function CaloriesView({ s, p }: { s: WidgetSnapshot; p: Palette }) {
  const { eaten, target } = s.calories;
  const left = target != null ? target - eaten : null;
  return (
    <Card p={p} uri="fft://diet">
      <Label p={p} text={t('widgets.calories')} />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
        <SvgWidget
          svg={arcSvg(target ? eaten / target : 0, p.accentDefault, p.dotOff)}
          style={{ width: 64, height: 64 }}
        />
        <FlexWidget style={{ flexDirection: 'column', marginLeft: 12, flex: 1 }}>
          <Big
            p={p}
            text={
              left == null
                ? t('widgets.kcal', { kcal: fmt(eaten) })
                : left >= 0
                  ? t('widgets.kcalLeft', { kcal: fmt(left) })
                  : t('widgets.kcalOver', { kcal: fmt(-left) })
            }
            size={20}
          />
          <Label
            p={p}
            text={
              target != null
                ? t('widgets.ofTarget', { eaten: fmt(eaten), target: fmt(target) })
                : t('widgets.eaten')
            }
          />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget
        style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}
      >
        {s.calories.macros.map((m) => (
          <FlexWidget key={m.key} style={{ flexDirection: 'column' }}>
            <TextWidget
              text={`${t(`widgets.macro.${m.key}`)} ${fmt(m.eaten)}${m.target != null ? `/${fmt(m.target)}` : ''} g`}
              style={{ fontSize: 12, color: hex(p.textMuted), fontFamily: FONT_REGULAR }}
              maxLines={1}
            />
            <Bar
              p={p}
              ratio={m.target ? m.eaten / m.target : 0}
              color={p.macroSplit[m.key]}
              width={72}
            />
          </FlexWidget>
        ))}
      </FlexWidget>
    </Card>
  );
}

function WorkoutView({ s, p }: { s: WidgetSnapshot; p: Palette }) {
  const w = s.workout;
  return (
    <Card p={p} uri="fft://train">
      <Label p={p} text={w.kind === 'done' ? t('widgets.workoutDone') : t('widgets.upNext')} />
      <Big
        p={p}
        text={w.name ?? (w.kind === 'done' ? t('widgets.wellDone') : t('widgets.noPlan'))}
        size={20}
      />
      {w.kind === 'next' && w.exercises > 0 ? (
        <FlexWidget
          style={{
            backgroundColor: hex(p.accentDefault),
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 6,
          }}
        >
          <TextWidget
            text={t('widgets.start', { count: w.exercises })}
            style={{ fontSize: 13, color: '#FFFFFF', fontFamily: FONT }}
          />
        </FlexWidget>
      ) : (
        <Label p={p} text={t('widgets.openTrain')} />
      )}
    </Card>
  );
}

function WaterView({ s, p }: { s: WidgetSnapshot; p: Palette }) {
  const glasses = Math.round(s.water.ml / s.water.glassMl);
  return (
    <Card p={p} uri="fft://">
      <Label p={p} text={t('widgets.water')} />
      <FlexWidget style={{ flexDirection: 'column' }}>
        <Big p={p} text={t('widgets.glasses', { n: glasses, goal: s.water.goalGlasses })} />
        <Bar p={p} ratio={glasses / s.water.goalGlasses} color={p.macroSplit.protein} width={100} />
      </FlexWidget>
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'fft://add-water?from=widget' }}
        style={{
          borderWidth: 1,
          borderColor: hex(p.borderControl),
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        <TextWidget
          text={t('widgets.addGlass', { ml: s.water.glassMl })}
          style={{ fontSize: 13, color: hex(p.text), fontFamily: FONT }}
        />
      </FlexWidget>
    </Card>
  );
}

function WeightView({ s, p }: { s: WidgetSnapshot; p: Palette }) {
  const w = s.weight;
  return (
    <Card p={p} uri="fft://progress/body">
      <Label p={p} text={t('widgets.weight')} />
      <Big p={p} text={w.kg != null ? t('widgets.kg', { kg: w.kg.toFixed(1) }) : '—'} />
      <TextWidget
        text={
          w.change7 != null
            ? t('widgets.change7', { kg: (w.change7 > 0 ? '+' : '') + w.change7.toFixed(1) })
            : w.day
              ? t('widgets.on', { day: w.day })
              : t('widgets.logWeight')
        }
        style={{
          fontSize: 13,
          color: hex(w.change7 != null && w.change7 <= 0 ? p.successText : p.textMuted),
          fontFamily: FONT_REGULAR,
        }}
        maxLines={1}
      />
    </Card>
  );
}

function SupplementsView({ s, p }: { s: WidgetSnapshot; p: Palette }) {
  const list = s.supplements.slice(0, 4);
  const done = s.supplements.filter((x) => x.taken).length;
  return (
    <Card p={p} uri="fft://">
      <Label p={p} text={t('widgets.supplementsCount', { done, total: s.supplements.length })} />
      {list.length === 0 ? (
        <Label p={p} text={t('widgets.noSupplements')} />
      ) : (
        <FlexWidget style={{ flexDirection: 'column' }}>
          {list.map((x, i) => (
            <TextWidget
              key={i}
              text={`${x.taken ? '✓' : '○'}  ${x.name}`}
              style={{
                fontSize: 14,
                color: hex(x.taken ? p.text : p.textMuted),
                fontFamily: x.taken ? FONT : FONT_REGULAR,
              }}
              maxLines={1}
              truncate="END"
            />
          ))}
        </FlexWidget>
      )}
    </Card>
  );
}

function Empty({ p }: { p: Palette }) {
  return (
    <Card p={p} uri="fft://">
      <Label p={p} text="FFT" />
      <Big p={p} text={t('widgets.openApp')} size={16} />
    </Card>
  );
}

export function renderWidgetView(
  name: WidgetName | string,
  s: WidgetSnapshot | null,
  mode: ThemeMode,
) {
  const p = palettes[mode];
  if (!s) return <Empty p={p} />;
  switch (name) {
    case 'Calories':
      return <CaloriesView s={s} p={p} />;
    case 'Workout':
      return <WorkoutView s={s} p={p} />;
    case 'Water':
      return <WaterView s={s} p={p} />;
    case 'Weight':
      return <WeightView s={s} p={p} />;
    case 'Supplements':
      return <SupplementsView s={s} p={p} />;
    default:
      return <Empty p={p} />;
  }
}

/** Light and dark versions: the launcher picks the one of the phone's theme. */
export function widgetFor(name: string, s: WidgetSnapshot | null) {
  return { light: renderWidgetView(name, s, 'light'), dark: renderWidgetView(name, s, 'dark') };
}
