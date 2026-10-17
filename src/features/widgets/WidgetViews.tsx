// The widget library calls these components as plain functions, outside React: compiled by the
// React Compiler they would use hooks and fail ("Invalid hook call"), leaving the widget empty.
'use no memo';

import { t as translate } from 'i18next';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { buildTheme, textScaleFor, type ThemeColors } from '@/design/theme';
import { palettes, type ThemeMode } from '@/design/tokens';
import type { Translate } from '@/i18n';
import type { WidgetAction } from './actions';
import { COACH_PROMPTS, widgetLinks } from './links';
import { weightTenths, type WidgetName, type WidgetSnapshot } from './snapshot';
import { emptyState, type WidgetState } from './state';

/**
 * The home screen widgets (DECISIONS 51, 68), drawn from a snapshot (snapshot.ts) and the widgets'
 * own state (state.ts: Undo, the weight being set, a message). Same look as the app: white card,
 * Figtree, fills for progress, ONE accent button (the main quick action). Buttons are at least
 * 44 dp high and each has a description for screen readers. Taps either run a quick action in the
 * background (a click action, see actions.ts) or open the app at the right place (links.ts).
 */

type HexColor = `#${string}`;
type Look = { c: ThemeColors; scale: number; bold: boolean };
export type WidgetSize = { width: number; height: number };
type Click = { uri: string } | { action: WidgetAction; data?: Record<string, unknown> };

const FONT = 'Figtree_600SemiBold';
const FONT_REGULAR = 'Figtree_400Regular';
// Keys are built from values (widgets.macro.protein…): the untyped form.
const t = translate as unknown as Translate;
const hex = (c: string) => c as HexColor;
const fmt = (n: number) => Math.round(n).toLocaleString('en');
const PAD = 12;
const BUTTON = 44;
const GAP = 6;

const clickProps = (click: Click) =>
  'uri' in click
    ? { clickAction: 'OPEN_URI', clickActionData: { uri: click.uri } }
    : { clickAction: click.action, clickActionData: click.data ?? {} };

function lookOf(s: WidgetSnapshot | null, mode: ThemeMode): Look {
  const look = s?.look;
  return {
    c: buildTheme({
      accent: look?.accent ?? 'red',
      highContrast: look?.highContrast ?? false,
      mode,
    }),
    // Bigger text as in the app, up to what still fits a widget.
    scale: Math.min(textScaleFor(look?.textScaleStep ?? 3), 1.15),
    bold: look?.bold ?? false,
  };
}

function Card({
  look,
  click,
  label,
  children,
}: {
  look: Look;
  click: Click;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <FlexWidget
      {...clickProps(click)}
      accessibilityLabel={label}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hex(look.c.surface),
        borderRadius: 24,
        borderWidth: 1,
        borderColor: hex(look.c.borderDecorative),
        padding: PAD,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {children}
    </FlexWidget>
  );
}

function Txt({
  look,
  text,
  size = 13,
  muted = false,
  strong = false,
  color,
  lines = 1,
}: {
  look: Look;
  text: string;
  size?: number;
  muted?: boolean;
  strong?: boolean;
  color?: string;
  lines?: number;
}) {
  return (
    <TextWidget
      text={text}
      style={{
        fontSize: Math.max(12, Math.round(size * look.scale)),
        color: hex(color ?? (muted ? look.c.textMuted : look.c.text)),
        fontFamily: strong || look.bold ? FONT : FONT_REGULAR,
      }}
      maxLines={lines}
      truncate="END"
    />
  );
}

/** A button of at least 44 dp: the accent one (the main action) or an outlined one. */
function Button({
  look,
  text,
  label,
  click,
  accent = false,
  width,
}: {
  look: Look;
  text: string;
  /** What a screen reader says (what the tap does). */
  label: string;
  click: Click;
  accent?: boolean;
  width?: number;
}) {
  return (
    <FlexWidget
      {...clickProps(click)}
      accessibilityLabel={label}
      style={{
        height: BUTTON,
        ...(width != null ? { width } : { flex: 1 }),
        borderRadius: 14,
        paddingHorizontal: 10,
        backgroundColor: hex(accent ? look.c.accent : look.c.surface),
        ...(accent ? {} : { borderWidth: 1, borderColor: hex(look.c.borderControl) }),
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Txt look={look} text={text} strong color={accent ? look.c.onAccent : look.c.text} />
    </FlexWidget>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <FlexWidget
      style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', flexGap: GAP }}
    >
      {children}
    </FlexWidget>
  );
}

/** The last quick action with its Undo button, for a few seconds (state.ts). */
function UndoRow({ look, st, name }: { look: Look; st: WidgetState; name: WidgetName }) {
  const undo = st.undo?.widget === name ? st.undo : null;
  if (!undo) return null;
  return (
    <Row>
      <FlexWidget style={{ flex: 1 }}>
        <Txt look={look} text={undo.message} lines={2} />
      </FlexWidget>
      <Button
        look={look}
        text={t('widgets.undo')}
        label={t('widgets.undoA11y', { message: undo.message })}
        click={{ action: 'UNDO', data: { id: undo.id } }}
        width={88}
      />
    </Row>
  );
}

/** A short message (a failure, "open the app") on the widget it concerns. */
function notice(st: WidgetState, name: WidgetName) {
  return st.notice?.widget === name ? st.notice.text : null;
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
  look,
  ratio,
  color,
  width,
}: {
  look: Look;
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
        backgroundColor: hex(look.c.dotOff),
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

type ViewProps = {
  s: WidgetSnapshot;
  st: WidgetState;
  look: Look;
  size: WidgetSize;
  now: number;
};

function kcalLine(s: WidgetSnapshot) {
  const { eaten, target } = s.calories;
  const left = target != null ? target - eaten : null;
  return left == null
    ? t('widgets.kcal', { kcal: fmt(eaten) })
    : left >= 0
      ? t('widgets.kcalLeft', { kcal: fmt(left) })
      : t('widgets.kcalOver', { kcal: fmt(-left) });
}

/** Fixed meals: the next meal, Followed / Skipped from the widget, Different in the app. */
function FixedMealsView({ s, st, look }: ViewProps) {
  const next = s.diet.nextMeal;
  const undo = UndoRow({ look, st, name: 'Calories' });
  const message = notice(st, 'Calories');
  return (
    <Card
      look={look}
      click={{ uri: widgetLinks.diet }}
      label={
        next
          ? t('widgets.meal.cardA11y', { name: next.name, kcal: fmt(next.kcal) })
          : t('widgets.meal.allDone')
      }
    >
      <Txt
        look={look}
        muted
        text={
          next
            ? t('widgets.meal.next', { done: s.diet.mealsDone, total: s.diet.mealsTotal })
            : s.diet.mealsTotal > 0
              ? t('widgets.meal.allDone')
              : t('widgets.meal.noPlan')
        }
      />
      <FlexWidget style={{ flexDirection: 'column' }}>
        <Txt look={look} strong size={20} text={next ? next.name : kcalLine(s)} />
        <Txt
          look={look}
          muted
          text={
            message ??
            (next
              ? [t('widgets.kcal', { kcal: fmt(next.kcal) }), next.description]
                  .filter(Boolean)
                  .join(' · ')
              : t('widgets.ofTarget', {
                  eaten: fmt(s.calories.eaten),
                  target: fmt(s.calories.target ?? 0),
                }))
          }
        />
      </FlexWidget>
      {undo ??
        (next ? (
          <Row>
            <Button
              look={look}
              accent
              text={t('widgets.meal.followBtn')}
              label={t('widgets.meal.followA11y', { name: next.name })}
              click={{ action: 'MEAL_DONE', data: { mealId: next.id } }}
            />
            <Button
              look={look}
              text={t('widgets.meal.skipBtn')}
              label={t('widgets.meal.skipA11y', { name: next.name })}
              click={{ action: 'MEAL_SKIPPED', data: { mealId: next.id } }}
            />
            <Button
              look={look}
              text={t('widgets.meal.differentBtn')}
              label={t('widgets.meal.differentA11y', { name: next.name })}
              click={{ uri: widgetLinks.adjustMeal(next.id) }}
            />
          </Row>
        ) : (
          <Row>
            <Button
              look={look}
              text={t('widgets.openDiet')}
              label={t('widgets.openDiet')}
              click={{ uri: widgetLinks.diet }}
            />
          </Row>
        ))}
    </Card>
  );
}

/** Count foods: calories and protein, + water, same as yesterday, log food. */
function CaloriesView(props: ViewProps) {
  const { s, st, look, size } = props;
  if (s.diet.mode === 'fixed_meals') return FixedMealsView(props);
  const { eaten, target } = s.calories;
  const protein = s.calories.macros.find((m) => m.key === 'protein');
  const meal = t(`diet.meal.${s.diet.meal}`);
  const offerSame = s.diet.mealEmpty && s.diet.yesterdayCount > 0;
  // Three buttons need room; on a narrow widget "+ water" gives way (the Water widget has it).
  const showWater = !offerSame || size.width >= 300;
  const undo = UndoRow({ look, st, name: 'Calories' });
  const message = notice(st, 'Calories');
  return (
    <Card
      look={look}
      click={{ uri: widgetLinks.diet }}
      label={`${t('widgets.calories')}: ${kcalLine(s)}`}
    >
      <Row>
        <SvgWidget
          svg={arcSvg(target ? eaten / target : 0, look.c.accent, look.c.dotOff)}
          style={{ width: 44, height: 44 }}
        />
        <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
          <Txt look={look} strong size={18} text={kcalLine(s)} />
          <Txt
            look={look}
            muted
            text={
              message ??
              (protein?.target != null
                ? t('widgets.proteinLine', {
                    eaten: fmt(protein.eaten),
                    target: fmt(protein.target),
                  })
                : t('widgets.proteinOnly', { eaten: fmt(protein?.eaten ?? 0) }))
            }
          />
        </FlexWidget>
      </Row>
      {undo ?? (
        <Row>
          {showWater ? (
            <Button
              look={look}
              text={t('widgets.addGlass', { ml: s.water.glassMl })}
              label={t('widgets.addWaterA11y', { ml: s.water.glassMl })}
              click={{ action: 'WATER', data: { from: 'Calories' } }}
            />
          ) : null}
          {offerSame ? (
            <Button
              look={look}
              text={t('widgets.sameAsYesterday')}
              label={t('widgets.sameA11y', { meal })}
              click={{ action: 'SAME_MEAL', data: { meal: s.diet.meal } }}
            />
          ) : null}
          <Button
            look={look}
            accent
            text={t('widgets.logMeal', { meal })}
            label={t('widgets.logMealA11y', { meal })}
            click={{ uri: widgetLinks.logFood(s.diet.meal) }}
          />
        </Row>
      )}
    </Card>
  );
}

function restTime(endsAt: number) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(endsAt),
  );
}

/** Up next with Start; during a workout the next set with "Set done" and the rest. */
function WorkoutView({ s, st, look, now }: ViewProps) {
  const w = s.workout;
  const undo = UndoRow({ look, st, name: 'Workout' });
  const message = notice(st, 'Workout');
  const a = w.active;
  if (w.kind === 'active' && a) {
    const values =
      a.reps == null
        ? ''
        : a.weight
          ? t('widgets.workout.weightReps', { weight: a.weight, unit: a.unit, reps: a.reps })
          : t('widgets.workout.reps', { reps: a.reps });
    const resting = a.restEndsAt != null && a.restEndsAt > now;
    const line = [t('widgets.workout.setOf', { n: a.setNumber, total: a.setsTotal }), values]
      .filter(Boolean)
      .join(' · ');
    return (
      <Card
        look={look}
        click={{ uri: widgetLinks.session(a.sessionId) }}
        label={t('widgets.workout.activeA11y', { name: a.exercise ?? w.name ?? '' })}
      >
        <Txt
          look={look}
          muted
          text={
            message ??
            (resting
              ? t('widgets.workout.restUntil', { time: restTime(a.restEndsAt!) })
              : t('widgets.workout.inProgress'))
          }
        />
        <FlexWidget style={{ flexDirection: 'column' }}>
          <Txt look={look} strong size={18} text={a.exercise ?? t('widgets.workout.allSetsDone')} />
          {a.exercise ? <Txt look={look} muted text={line} /> : null}
        </FlexWidget>
        {undo ?? (
          <Row>
            {a.exercise && a.quick && a.setId ? (
              <Button
                look={look}
                accent
                text={t('widgets.workout.setDone')}
                label={t('widgets.workout.setDoneA11y', {
                  n: a.setNumber,
                  name: a.exercise,
                  values,
                })}
                click={{ action: 'SET_DONE', data: { sessionId: a.sessionId, setId: a.setId } }}
              />
            ) : (
              <Button
                look={look}
                accent
                text={a.exercise ? t('widgets.workout.open') : t('widgets.workout.finish')}
                label={a.exercise ? t('widgets.workout.open') : t('widgets.workout.finish')}
                click={{ uri: widgetLinks.session(a.sessionId) }}
              />
            )}
          </Row>
        )}
      </Card>
    );
  }
  return (
    <Card
      look={look}
      click={{ uri: widgetLinks.train }}
      label={`${w.kind === 'done' ? t('widgets.workoutDone') : t('widgets.upNext')}: ${w.name ?? ''}`}
    >
      <Txt
        look={look}
        muted
        text={w.kind === 'done' ? t('widgets.workoutDone') : t('widgets.upNext')}
      />
      <FlexWidget style={{ flexDirection: 'column' }}>
        <Txt
          look={look}
          strong
          size={18}
          text={w.name ?? (w.kind === 'done' ? t('widgets.wellDone') : t('widgets.noPlan'))}
        />
        {w.kind === 'next' ? (
          <Txt
            look={look}
            muted
            text={message ?? t('widgets.workout.exercises', { count: w.exercises })}
          />
        ) : null}
      </FlexWidget>
      {w.kind === 'next' && w.dayId && w.exercises > 0 ? (
        <Row>
          <Button
            look={look}
            accent
            text={t('widgets.workout.start')}
            label={t('widgets.workout.startA11y', { name: w.name ?? '' })}
            click={{ uri: widgetLinks.startWorkout(w.dayId) }}
          />
        </Row>
      ) : (
        <Row>
          <Button
            look={look}
            text={t('widgets.openTrain')}
            label={t('widgets.openTrain')}
            click={{ uri: widgetLinks.train }}
          />
        </Row>
      )}
    </Card>
  );
}

function WaterView({ s, st, look, size }: ViewProps) {
  const glasses = Math.round(s.water.ml / s.water.glassMl);
  const undo = UndoRow({ look, st, name: 'Water' });
  return (
    <Card
      look={look}
      click={{ uri: widgetLinks.home }}
      label={t('widgets.waterA11y', { n: glasses, goal: s.water.goalGlasses })}
    >
      <Txt look={look} muted text={notice(st, 'Water') ?? t('widgets.water')} />
      <FlexWidget style={{ flexDirection: 'column', flexGap: 4 }}>
        <Txt
          look={look}
          strong
          size={24}
          text={t('widgets.glasses', { n: glasses, goal: s.water.goalGlasses })}
        />
        <Bar
          look={look}
          ratio={glasses / s.water.goalGlasses}
          color={look.c.water}
          width={Math.max(60, Math.min(160, size.width - 2 * PAD - 4))}
        />
      </FlexWidget>
      {undo ?? (
        <Row>
          <Button
            look={look}
            accent
            text={t('widgets.addGlass', { ml: s.water.glassMl })}
            label={t('widgets.addWaterA11y', { ml: s.water.glassMl })}
            click={{ action: 'WATER' }}
          />
        </Row>
      )}
    </Card>
  );
}

/** Today's weight with − / + (0.1 in the user's unit) and Save: widgets cannot take typing. */
function WeightView({ s, st, look }: ViewProps) {
  const w = s.weight;
  const unit = s.weightUnit;
  const draft =
    st.weightDraft && st.weightDraft.userId === s.userId && st.weightDraft.day === s.day
      ? st.weightDraft.tenths
      : null;
  const base = draft ?? (w.kg != null ? weightTenths(w.kg, unit) : null);
  const value = base != null ? (base / 10).toFixed(1) : null;
  const undo = UndoRow({ look, st, name: 'Weight' });
  const message = notice(st, 'Weight');
  const sub =
    message ??
    (draft != null
      ? t('widgets.weightUnsaved')
      : w.change7 != null
        ? t('widgets.change7', { kg: (w.change7 > 0 ? '+' : '') + w.change7.toFixed(1) })
        : w.day
          ? t('widgets.on', { day: w.day })
          : t('widgets.logWeight'));
  return (
    <Card
      look={look}
      click={{ uri: widgetLinks.body }}
      label={value ? t('widgets.weightA11y', { value, unit }) : t('widgets.logWeight')}
    >
      <Txt look={look} muted text={sub} />
      {value == null ? (
        <Row>
          <Button
            look={look}
            accent
            text={t('widgets.logWeight')}
            label={t('widgets.logWeight')}
            click={{ uri: widgetLinks.checkIn }}
          />
        </Row>
      ) : (
        <Row>
          <Button
            look={look}
            text="−"
            label={t('widgets.weightLess', { unit })}
            click={{ action: 'WEIGHT_STEP', data: { delta: -1 } }}
            width={BUTTON}
          />
          <FlexWidget style={{ flex: 1, alignItems: 'center' }}>
            <Txt look={look} strong size={22} text={t('widgets.unitValue', { value, unit })} />
          </FlexWidget>
          <Button
            look={look}
            text="+"
            label={t('widgets.weightMore', { unit })}
            click={{ action: 'WEIGHT_STEP', data: { delta: 1 } }}
            width={BUTTON}
          />
        </Row>
      )}
      {value == null
        ? null
        : (undo ?? (
            <Row>
              <Button
                look={look}
                accent
                text={t('widgets.save')}
                label={t('widgets.saveWeightA11y', { value, unit })}
                click={{ action: 'WEIGHT_SAVE' }}
              />
            </Row>
          ))}
    </Card>
  );
}

/** Today's supplements, one row each: a tap ticks it (or unticks it). */
function SupplementsView({ s, st, look, size }: ViewProps) {
  const done = s.supplements.filter((x) => x.taken).length;
  const fit = Math.max(1, Math.floor((size.height - 2 * PAD - 22) / (BUTTON + 2)));
  const list = s.supplements.slice(0, fit);
  const more = s.supplements.length - list.length;
  return (
    <Card
      look={look}
      click={{ uri: widgetLinks.home }}
      label={t('widgets.supplementsCount', { done, total: s.supplements.length })}
    >
      <Txt
        look={look}
        muted
        text={
          notice(st, 'Supplements') ??
          (more > 0
            ? `${t('widgets.supplementsCount', { done, total: s.supplements.length })} · ${t('widgets.more', { count: more })}`
            : t('widgets.supplementsCount', { done, total: s.supplements.length }))
        }
      />
      {list.length === 0 ? (
        <Txt look={look} muted text={t('widgets.noSupplements')} />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', flexGap: 2 }}>
          {list.map((x) => (
            <FlexWidget
              key={x.id}
              clickAction="SUPPLEMENT"
              clickActionData={{ id: x.id }}
              accessibilityLabel={t(
                x.taken ? 'widgets.supplementTaken' : 'widgets.supplementTodo',
                {
                  name: x.name,
                },
              )}
              style={{
                height: BUTTON,
                width: 'match_parent',
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Txt
                look={look}
                size={15}
                strong={x.taken}
                muted={!x.taken}
                text={`${x.taken ? '✓' : '○'}  ${x.name}`}
              />
            </FlexWidget>
          ))}
        </FlexWidget>
      )}
    </Card>
  );
}

/** Quick questions for the coach (they open the chat, where the answer arrives) and "Ask…". */
function CoachView({ s, look, size }: ViewProps) {
  const fit = Math.max(0, Math.floor((size.height - 2 * PAD - 22 - BUTTON - GAP) / (BUTTON + GAP)));
  const prompts = COACH_PROMPTS.slice(0, Math.min(COACH_PROMPTS.length, fit));
  return (
    <Card look={look} click={{ uri: widgetLinks.askTyping }} label={t('widgets.coach.title')}>
      <Txt look={look} muted text={t('widgets.coach.title')} />
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', flexGap: GAP }}>
        {prompts.map((p) => (
          <Row key={p}>
            <Button
              look={look}
              text={t(`widgets.coach.prompt.${p}`)}
              label={t('widgets.coach.promptA11y', { prompt: t(`widgets.coach.prompt.${p}`) })}
              click={{ uri: widgetLinks.ask(p, s.token) }}
            />
          </Row>
        ))}
        <Row>
          <Button
            look={look}
            accent
            text={t('widgets.coach.ask')}
            label={t('widgets.coach.askA11y')}
            click={{ uri: widgetLinks.askTyping }}
          />
        </Row>
      </FlexWidget>
    </Card>
  );
}

function Empty({ look }: { look: Look }) {
  return (
    <Card look={look} click={{ uri: widgetLinks.home }} label={t('widgets.openApp')}>
      <Txt look={look} muted text="FFT" />
      <Txt look={look} strong size={16} text={t('widgets.openApp')} lines={2} />
    </Card>
  );
}

const DEFAULT_SIZE: WidgetSize = { width: 250, height: 180 };

export function renderWidgetView(
  name: WidgetName | string,
  s: WidgetSnapshot | null,
  mode: ThemeMode,
  st: WidgetState = emptyState,
  size: WidgetSize = DEFAULT_SIZE,
  /** When the picture is drawn (a rest already over is not shown). */
  now = 0,
) {
  const look = lookOf(s, mode);
  if (!s) return <Empty look={look} />;
  const props: ViewProps = { s, st, look, size, now };
  switch (name) {
    case 'Calories':
      return CaloriesView(props);
    case 'Workout':
      return WorkoutView(props);
    case 'Water':
      return WaterView(props);
    case 'Weight':
      return WeightView(props);
    case 'Supplements':
      return SupplementsView(props);
    case 'Coach':
      return CoachView(props);
    default:
      return <Empty look={look} />;
  }
}

/** Drawn when a widget cannot be drawn: never an empty, transparent widget. */
export function fallbackWidget() {
  const p = palettes.light;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="FFT"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hex(p.surface),
        borderRadius: 24,
        padding: 14,
        justifyContent: 'center',
      }}
    >
      <TextWidget text="FFT" style={{ fontSize: 16, color: hex(p.text) }} />
    </FlexWidget>
  );
}

/** Light and dark versions: the launcher picks the one of the phone's theme. */
export function widgetFor(
  name: string,
  s: WidgetSnapshot | null,
  st: WidgetState = emptyState,
  size?: WidgetSize | null,
  now = Date.now(),
) {
  const box = size && size.width > 0 && size.height > 0 ? size : DEFAULT_SIZE;
  return {
    light: renderWidgetView(name, s, 'light', st, box, now),
    dark: renderWidgetView(name, s, 'dark', st, box, now),
  };
}
