import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import en from '@/i18n/locales/en.json';
import { renderUI } from '@/test/render';
import { InfoButton } from './InfoButton';
import { Section } from './Section';

describe('InfoButton (DECISIONS 124)', () => {
  it('is a 44 pt button named "About <term>" that opens the explanation with an example', async () => {
    await renderUI(<InfoButton topic="e1rm" />);
    const button = screen.getByLabelText('About estimated max');
    expect(button).toHaveStyle({ width: 44, height: 44 });
    expect(screen.queryByText('Estimated max (1RM)')).toBeNull();

    await fireEvent.press(button);
    expect(screen.getByText('Estimated max (1RM)')).toBeTruthy();
    expect(screen.getByText(/one-rep max/)).toBeTruthy();
    expect(screen.getByText('For example')).toBeTruthy();
    expect(screen.getByText(/60 kg for 10 reps/)).toBeTruthy();
    expect(screen.getByText('Why it matters')).toBeTruthy();

    await fireEvent.press(screen.getByText('Got it'));
    expect(screen.queryByText('Estimated max (1RM)')).toBeNull();
  });

  it('leaves out "Why it matters" when the topic has none', async () => {
    await renderUI(<InfoButton topic="cycle" />);
    await fireEvent.press(screen.getByLabelText('About cycles and up next'));
    expect(screen.getByText('Cycle and up next')).toBeTruthy();
    expect(screen.queryByText('Why it matters')).toBeNull();
  });

  it('as a link, says "What does this mean?" (for switch rows)', async () => {
    await renderUI(<InfoButton topic="encryption" link />);
    expect(screen.getByText('What does this mean?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('About end-to-end encryption'));
    expect(screen.getByText(/cannot read it/)).toBeTruthy();
  });

  it('a Section can carry one after its heading', async () => {
    await renderUI(
      <Section title="Your plans" info="plan">
        {null}
      </Section>,
    );
    expect(screen.getByText('Your plans')).toBeTruthy();
    expect(screen.getByLabelText('About workout plans')).toBeTruthy();
  });

  it('every topic has a term, a title, a short body and an example (with numbers where it counts)', () => {
    // Choices and privacy topics are explained with a situation, not a calculation.
    const noNumbers = new Set([
      'trackingMode',
      'checkIn',
      'plans',
      'serverCopy',
      'encryption',
      'relay',
      'apiMcp',
    ]);
    for (const [topic, e] of Object.entries(en.explain)) {
      expect([topic, e.term.length > 0, e.title.length > 0]).toEqual([topic, true, true]);
      // At most 4 sentences: short enough to read in a sheet.
      const sentences = e.body.split(/[.!?](?:\s|$)/).filter((s) => s.trim().length > 1).length;
      expect([topic, sentences >= 1 && sentences <= 4]).toEqual([topic, true]);
      expect([topic, e.example.length > 0]).toEqual([topic, true]);
      if (!noNumbers.has(topic)) expect([topic, /\d/.test(e.example)]).toEqual([topic, true]);
    }
  });
});
