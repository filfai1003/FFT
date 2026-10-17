/**
 * The widget task runs in the app's JavaScript when the app is open (Android reuses it): after a
 * quick action the open screens must show the change at once. WidgetBridge registers the app's
 * query client here while it is mounted; with the app closed there is nothing to refresh.
 */
type Refreshable = { invalidateQueries: () => Promise<unknown> };

let client: Refreshable | null = null;

export function setAppQueryClient(next: Refreshable | null) {
  client = next;
}

/** Re-reads every query of the open app (no-op when the app is not running). */
export async function refreshApp() {
  try {
    await client?.invalidateQueries();
  } catch {
    // The screens refresh on their own next time.
  }
}
