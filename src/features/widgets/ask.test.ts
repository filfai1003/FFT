import '@/i18n';
import { widgetQuestion } from './ask';
import { widgetLinks, widgetToken } from './links';

describe('Coach widget questions', () => {
  it('a chip from the widget sends its question once the consent is given and an AI is set up', async () => {
    const token = await widgetToken();
    expect(await widgetToken()).toBe(token);
    expect(await widgetQuestion({ prompt: 'eat', token, consented: true, ready: true })).toBe(
      'What should I eat now?',
    );
    expect(widgetLinks.ask('week', token)).toBe(`fft://ask?prompt=week&t=${token}`);
  });

  it('without the AI coach consent nothing is sent (the chat shows the consent)', async () => {
    const token = await widgetToken();
    expect(
      await widgetQuestion({ prompt: 'eat', token, consented: false, ready: true }),
    ).toBeNull();
  });

  it('a link from elsewhere (no or wrong secret), an unknown chip or no AI: nothing is sent', async () => {
    const token = await widgetToken();
    expect(
      await widgetQuestion({ prompt: 'eat', token: undefined, consented: true, ready: true }),
    ).toBeNull();
    expect(
      await widgetQuestion({ prompt: 'eat', token: 'guess', consented: true, ready: true }),
    ).toBeNull();
    expect(
      await widgetQuestion({ prompt: 'send my data', token, consented: true, ready: true }),
    ).toBeNull();
    expect(
      await widgetQuestion({ prompt: 'eat', token, consented: true, ready: false }),
    ).toBeNull();
  });

  it('deep link targets', () => {
    expect(widgetLinks.startWorkout('d1')).toBe('fft://start-workout?day=d1');
    expect(widgetLinks.logFood('dinner')).toBe('fft://food-search?meal=dinner');
    expect(widgetLinks.adjustMeal('m1')).toBe('fft://diet?adjust=m1');
    expect(widgetLinks.session('s1')).toBe('fft://session/s1');
    expect(widgetLinks.askTyping).toBe('fft://ask?focus=1');
  });
});
