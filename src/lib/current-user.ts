/** Id of the signed-in user (or of the account-less local user), set by the session store. */
let current: string | null = null;

export const getCurrentUserId = (): string | null => current;
export const setCurrentUserId = (id: string | null) => {
  current = id;
};
