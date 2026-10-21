import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { CalendarSheet } from './CalendarSheet';
import { DayStrip } from './DayStrip';
import { MonthGrid } from './MonthGrid';
import { PageHeader } from './PageHeader';

const week = [
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
  '2026-10-16',
  '2026-10-17',
  '2026-10-18',
];

describe('DayStrip (DECISIONS 123)', () => {
  it('a tap selects that day; the selected day is checked, days to come cannot be picked', async () => {
    const onSelect = jest.fn();
    await renderUI(
      <DayStrip days={week} selected="2026-10-16" today="2026-10-16" onSelect={onSelect} />,
    );
    expect(screen.getByRole('radio', { name: 'Friday 16, today' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Wednesday 14' }));
    expect(onSelect).toHaveBeenCalledWith('2026-10-14');
    const future = screen.getByRole('radio', { name: 'Saturday 17, not yet' });
    expect(future).toBeDisabled();
    await fireEvent.press(future);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reads each mark aloud and shows the same bar shapes everywhere', async () => {
    await renderUI(
      <DayStrip
        days={week}
        selected="2026-10-18"
        today="2026-10-18"
        onSelect={jest.fn()}
        marks={{ '2026-10-12': 'onTarget', '2026-10-13': 'off', '2026-10-18': 'logged' }}
      />,
    );
    expect(screen.getByLabelText('Monday 12, on target')).toBeTruthy();
    expect(screen.getByLabelText('Tuesday 13, off target')).toBeTruthy();
    expect(
      screen.getByTestId('day-mark-2026-10-13-off', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('away from today shows "Back to today", which selects today', async () => {
    const onSelect = jest.fn();
    await renderUI(
      <DayStrip days={week} selected="2026-10-14" today="2026-10-18" onSelect={onSelect} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Back to today' }));
    expect(onSelect).toHaveBeenCalledWith('2026-10-18');
  });

  it('holding a day shows what the marks mean', async () => {
    await renderUI(
      <DayStrip
        days={week}
        selected="2026-10-18"
        today="2026-10-18"
        onSelect={jest.fn()}
        marks={{}}
      />,
    );
    expect(screen.queryByText('Nothing logged')).toBeNull();
    await fireEvent(screen.getByRole('radio', { name: 'Monday 12' }), 'longPress');
    expect(screen.getByText('Nothing logged')).toBeTruthy();
  });
});

describe('MonthGrid and CalendarSheet (DECISIONS 123)', () => {
  it('selection is announced (and drawn with the 2px border), future days are disabled', async () => {
    const onSelect = jest.fn();
    await renderUI(
      <MonthGrid
        cells={[null, '2026-10-01', '2026-10-02', '2026-10-03']}
        weekStart="mon"
        today="2026-10-02"
        selected="2026-10-01"
        onSelect={onSelect}
        describe={(d) => [d === '2026-10-01' ? 'trained' : null]}
      />,
    );
    const first = screen.getByLabelText('Thursday 1, trained');
    expect(first).toBeSelected();
    expect(first).toHaveStyle({ borderWidth: 2 });
    expect(screen.getByLabelText('Saturday 3')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Friday 2, today'));
    expect(onSelect).toHaveBeenCalledWith('2026-10-02');
  });

  it('picks a day and closes; browses earlier months; "Go to today" from the past', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await renderUI(
      <CalendarSheet
        visible
        onClose={onClose}
        selected="2026-10-14"
        today="2026-10-18"
        weekStart="mon"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('September 2026')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Tuesday 8'));
    expect(onSelect).toHaveBeenCalledWith('2026-09-08');
    expect(onClose).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Go to today' }));
    expect(onSelect).toHaveBeenLastCalledWith('2026-10-18');
  });
});

describe('PageHeader', () => {
  it('has the title as a header and the calendar button at the right end', async () => {
    const onCalendar = jest.fn();
    await renderUI(<PageHeader title="Diet" overline="Sun 18 Oct" onCalendar={onCalendar} />);
    expect(screen.getByRole('header', { name: 'Diet' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open the calendar' }));
    expect(onCalendar).toHaveBeenCalled();
  });
});
