import { t as translate } from 'i18next';
import type { Translate } from '@/i18n';
import { isCoachPrompt, isWidgetToken } from './links';

const t = translate as unknown as Translate;

/**
 * The question a Coach widget chip sends, or null when nothing may be sent: an unknown chip, a
 * link that did not come from the widgets (no secret), no AI coach consent (DECISIONS 66: the chat
 * then shows the consent first and sends nothing), or no AI to answer (no key, no Premium).
 */
export async function widgetQuestion(args: {
  prompt: string | undefined;
  token: string | undefined;
  consented: boolean;
  ready: boolean;
}): Promise<string | null> {
  if (!isCoachPrompt(args.prompt) || !args.consented || !args.ready) return null;
  if (!(await isWidgetToken(args.token))) return null;
  return t(`widgets.coach.prompt.${args.prompt}`);
}
