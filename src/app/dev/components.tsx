import { Redirect } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DotBar } from '@/components/ui/DotBar';
import { DotColumnChart } from '@/components/ui/DotColumnChart';
import { ExerciseImage } from '@/components/ui/ExerciseImage';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useAppearanceStore } from '@/design/appearance-store';
import { dotsOn } from '@/domain/dots';
import { accentOptions, type AccentName } from '@/design/tokens';
import { useToastStore } from '@/lib/toast-store';

/** Component catalogue, dev only (/dev/components). Compare every state with the mockups. */
export default function ComponentCatalogue() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Catalogue />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Text variant="label" muted>
        {title}
      </Text>
      {children}
    </View>
  );
}

const weeks = [0, 0.8, 1.5, 2.4, 3.1, 3.6, 4.5, 5.2, 6.0, 6.9, 7.6, 8.4];

function Catalogue() {
  const barHeight = useActionBarHeight();
  const appearance = useAppearanceStore();
  const showToast = useToastStore((s) => s.show);

  const [range, setRange] = useState<'4w' | '12w' | '1y' | 'all'>('12w');
  const [chips, setChips] = useState<string[]>(['Chest']);
  const [toggle, setToggle] = useState(true);
  const [sets, setSets] = useState(4);
  const [rest, setRest] = useState(120);
  const [grams, setGrams] = useState(150);
  const [name, setName] = useState('Push A');
  const [sheet, setSheet] = useState(false);

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 16} gap={28}>
        <Text variant="screenTitle">Components</Text>

        <Section title="ACCESSIBILITY (APPLIES TO EVERYTHING)">
          <Card gap={4}>
            <Row label="Bold text">
              <Toggle
                value={appearance.boldText}
                onValueChange={(v) => appearance.set('boldText', v)}
                accessibilityLabel="Bold text"
              />
            </Row>
            <Row label="Dot-matrix numbers">
              <Toggle
                value={appearance.dotNumbers}
                onValueChange={(v) => appearance.set('dotNumbers', v)}
                accessibilityLabel="Dot-matrix numbers"
              />
            </Row>
            <Row label="Higher contrast">
              <Toggle
                value={appearance.highContrast}
                onValueChange={(v) => appearance.set('highContrast', v)}
                accessibilityLabel="Higher contrast"
              />
            </Row>
            <Row label="Reduce motion">
              <Toggle
                value={appearance.reduceMotion}
                onValueChange={(v) => appearance.set('reduceMotion', v)}
                accessibilityLabel="Reduce motion"
              />
            </Row>
            <Stepper
              value={appearance.textScaleStep}
              min={1}
              max={5}
              onChange={(v) => appearance.set('textScaleStep', v)}
              format={(v) => `TEXT SIZE ${v}/5`}
              decreaseLabel="Smaller text"
              increaseLabel="Larger text"
            />
          </Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(Object.keys(accentOptions) as AccentName[]).map((a) => (
              <Chip
                key={a}
                role="radio"
                label={a}
                selected={appearance.accent === a}
                onPress={() => appearance.set('accent', a)}
              />
            ))}
          </View>
        </Section>

        <Section title="TYPOGRAPHY">
          <Text variant="label" muted>
            THU OCT 08
          </Text>
          <Text variant="displayXL" numeric>
            1360
          </Text>
          <Text variant="displayL">Today</Text>
          <Text variant="screenTitle">Food log</Text>
          <Text variant="displayM" numeric>
            78.4
          </Text>
          <Text variant="displayS">Finish now?</Text>
          <Text variant="titleM">Incline dumbbell press</Text>
          <Text variant="bodyL">Body large 17</Text>
          <Text variant="body">Body 15: Greek yogurt, oats, berries</Text>
          <Text variant="bodyS" muted>
            Body small 13, muted. Legs was done out of order on Wednesday, so Push is still up next.
          </Text>
        </Section>

        <Section title="BUTTONS">
          <Button label="Save day" size="large" onPress={() => undefined} />
          <Button label="Start" icon="play" size="medium" block={false} onPress={() => undefined} />
          <Button label="+ Add exercise" variant="secondary" onPress={() => undefined} />
          <Button label="Train a different day" variant="ghost" onPress={() => undefined} />
          <Button label="Discard workout" variant="danger" onPress={() => undefined} />
          <Button label="Disabled" disabled onPress={() => undefined} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <IconButton icon="bell" accessibilityLabel="Notifications" onPress={() => undefined} />
            <IconButton icon="plus" accessibilityLabel="Add" onPress={() => undefined} />
            <IconButton icon="close" accessibilityLabel="Close" onPress={() => undefined} />
          </View>
        </Section>

        <Section title="CARD, CHIP, SEGMENTED, TOGGLE">
          <Card>
            <Text variant="label" muted>
              Calories left
            </Text>
            <Text variant="displayL" numeric>
              1360
            </Text>
          </Card>
          <Card selected size="small">
            <Text>Selected card: white border, never a filled block</Text>
          </Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['Chest', 'Back', 'Shoulders', 'Legs'].map((m) => (
              <Chip
                key={m}
                label={m}
                selected={chips.includes(m)}
                onPress={() =>
                  setChips((c) => (c.includes(m) ? c.filter((x) => x !== m) : [...c, m]))
                }
              />
            ))}
          </View>
          <Segmented
            accessibilityLabel="Time range"
            value={range}
            onChange={setRange}
            options={[
              { value: '4w', label: '4 WK' },
              { value: '12w', label: '12 WK' },
              { value: '1y', label: '1 YR' },
              { value: 'all', label: 'ALL' },
            ]}
          />
          <Row label="Rest timer done">
            <Toggle value={toggle} onValueChange={setToggle} accessibilityLabel="Rest timer done" />
          </Row>
        </Section>

        <Section title="INPUTS">
          <Input label="DAY NAME" value={name} onChangeText={setName} display />
          <Input
            variant="search"
            accessibilityLabel="Search food"
            placeholder="Search food"
            defaultValue="chicken"
          />
          <Input label="WEIGHT" variant="compact" defaultValue="26" keyboardType="decimal-pad" />
          <Input label="NAME" value="" onChangeText={() => undefined} error="Name is required" />
          <Text variant="label" muted>
            SETS
          </Text>
          <Stepper
            value={sets}
            onChange={setSets}
            min={1}
            max={10}
            decreaseLabel="Fewer sets"
            increaseLabel="More sets"
          />
          <Text variant="label" muted>
            REST
          </Text>
          <Stepper
            value={rest}
            onChange={setRest}
            min={0}
            max={600}
            step={15}
            format={(s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}
            decreaseLabel="Less rest"
            increaseLabel="More rest"
          />
          <Stepper
            variant="amount"
            value={grams}
            onChange={setGrams}
            min={1}
            max={2000}
            step={10}
            unit="g"
            valueLabel="Amount in grams"
            decreaseLabel="Decrease portion"
            increaseLabel="Increase portion"
          />
        </Section>

        <Section title="DOT BARS AND CHARTS">
          <Card>
            <Text variant="label" muted>
              CALORIES LEFT
            </Text>
            <DotBar
              total={40}
              on={dotsOn(990, 2350, 40)}
              size={10}
              accessibilityLabel="Calories eaten"
            />
            <View style={{ flexDirection: 'row', gap: 14 }}>
              {[
                ['PROTEIN', 92, 160],
                ['CARBS', 118, 260],
                ['FAT', 38, 75],
              ].map(([label, v, g]) => (
                <View key={label} style={{ flex: 1, gap: 6 }}>
                  <Text variant="label" muted>
                    {String(label)}
                  </Text>
                  <DotBar
                    total={10}
                    on={dotsOn(Number(v), Number(g), 10)}
                    accessibilityLabel={String(label)}
                  />
                </View>
              ))}
            </View>
          </Card>
          <Card>
            <Text variant="label" muted>
              REST · 02:00
            </Text>
            <DotBar shape="segment" total={24} on={14} size={5} accessibilityLabel="Rest timer" />
            <Text variant="label" muted>
              EXERCISE 3/6
            </Text>
            <DotBar
              shape="segment"
              total={6}
              on={3}
              accentIndex={2}
              accessibilityLabel="Exercises done"
            />
            <Text variant="label" muted>
              WATER 5/8
            </Text>
            <DotBar total={8} on={5} size={8} off="outline" accessibilityLabel="Water" />
          </Card>
          <Card>
            <DotColumnChart
              values={weeks}
              accessibilityLabel="Strength rising steadily over 12 weeks"
            />
          </Card>
        </Section>

        <Section title="EXERCISE IMAGE">
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <ExerciseImage size={96} />
            <ExerciseImage size={52} />
            <ExerciseImage size={40} />
          </View>
        </Section>

        <Section title="SHEET AND TOAST">
          <Button label="Open sheet" variant="secondary" onPress={() => setSheet(true)} />
          <Button
            label="Show toast with undo"
            variant="secondary"
            onPress={() =>
              showToast({
                message: 'Set 2 saved · rest started',
                actionLabel: 'Undo',
                bottomOffset: barHeight,
              })
            }
          />
        </Section>
      </Screen>

      <BottomActionBar>
        <Button label="Save day" size="large" onPress={() => undefined} />
      </BottomActionBar>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Adjust a meal"
        closeLabel="Close"
        footer={<Button label="Save for today" size="large" onPress={() => setSheet(false)} />}
      >
        <Text>Ate as planned · Different amount · Log the foods · Skipped</Text>
      </Sheet>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 52,
      }}
    >
      <Text>{label}</Text>
      {children}
    </View>
  );
}
