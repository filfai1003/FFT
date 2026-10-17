import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Meal } from '@/domain/diet';
import { newId } from '@/lib/uuid';

/**
 * Where the widgets open the app (deep links of the "fft" scheme, routes of Expo Router). A link
 * that makes the app SEND something (a coach question) carries a secret only the widgets know:
 * any other app can open fft:// links, and must not be able to make the coach send the user's data.
 */

/** The quick questions of the Coach widget (the text is `widgets.coach.prompt.<key>`). */
export const COACH_PROMPTS = ['eat', 'workout', 'week'] as const;
export type CoachPrompt = (typeof COACH_PROMPTS)[number];

export const isCoachPrompt = (v: unknown): v is CoachPrompt =>
  typeof v === 'string' && (COACH_PROMPTS as readonly string[]).includes(v);

const TOKEN_KEY = 'fft.widgets.token';

/** The widgets' secret (made once per device). */
export async function widgetToken(): Promise<string> {
  const saved = await AsyncStorage.getItem(TOKEN_KEY);
  if (saved) return saved;
  const token = newId().replace(/-/g, '');
  await AsyncStorage.setItem(TOKEN_KEY, token);
  return token;
}

/** True when a link came from one of the widgets. */
export async function isWidgetToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    return (await AsyncStorage.getItem(TOKEN_KEY)) === token;
  } catch {
    return false;
  }
}

const q = encodeURIComponent;

export const widgetLinks = {
  home: 'fft://',
  diet: 'fft://diet',
  /** Fixed meals: the meal's "Different" sheet. */
  adjustMeal: (mealId: string) => `fft://diet?adjust=${q(mealId)}`,
  /** Count foods: the food search for a meal of today. */
  logFood: (meal: Meal) => `fft://food-search?meal=${meal}`,
  train: 'fft://train',
  /** Starts (or resumes) the workout of a plan day. */
  startWorkout: (dayId: string) => `fft://start-workout?day=${q(dayId)}`,
  session: (sessionId: string) => `fft://session/${q(sessionId)}`,
  body: 'fft://progress/body',
  /** The check-in (first weight). */
  checkIn: 'fft://check-in',
  /** The coach chat, sending a quick question (only with the widgets' secret). */
  ask: (prompt: CoachPrompt, token: string) => `fft://ask?prompt=${prompt}&t=${q(token)}`,
  /** The coach chat with the keyboard up. */
  askTyping: 'fft://ask?focus=1',
};
