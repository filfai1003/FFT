import { createContext, useContext, useState, type ReactNode, type RefObject } from 'react';
import type { TextInput } from 'react-native';

type InputRef = RefObject<TextInput | null>;
type Chain = {
  /** Adds an input to the chain (in the order the fields appear); returns the way to remove it. */
  register: (ref: InputRef) => () => void;
  /** Enter on a field: focus the next one, or close the keyboard on the last. */
  next: (ref: InputRef) => void;
};

const ChainContext = createContext<Chain | null>(null);

export const useFieldChain = () => useContext(ChainContext);

/** The text fields inside move on to each other with Enter ("next"), like a form. */
export function FieldChain({ children }: { children: ReactNode }) {
  const [chain] = useState<Chain>(() => {
    const fields: InputRef[] = [];
    return {
      register: (ref) => {
        fields.push(ref);
        return () => {
          const i = fields.indexOf(ref);
          if (i >= 0) fields.splice(i, 1);
        };
      },
      next: (ref) => {
        const target = fields[fields.indexOf(ref) + 1]?.current;
        if (target) target.focus();
        else ref.current?.blur();
      },
    };
  });
  return <ChainContext.Provider value={chain}>{children}</ChainContext.Provider>;
}
