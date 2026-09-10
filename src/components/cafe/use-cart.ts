import { useMemo, useReducer } from "react";

/** Shared client cart (المنيو التفاعلي). Server recomputes all prices on submit. */
export type CartLine = {
  key: string;
  itemId: string;
  name: string;
  variantId: string | null;
  flavor: string | null;
  unitPrice: number;
  qty: number;
};
type Cart = Record<string, CartLine>;
type Action =
  | { type: "add"; line: Omit<CartLine, "qty"> }
  | { type: "inc"; key: string }
  | { type: "dec"; key: string }
  /** سلة مُستعادة من الهاتف — تحلّ محلّ الحالية كلّها */
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "clear" };

function reducer(state: Cart, action: Action): Cart {
  switch (action.type) {
    case "add": {
      const ex = state[action.line.key];
      return { ...state, [action.line.key]: { ...action.line, qty: (ex?.qty ?? 0) + 1 } };
    }
    case "inc": {
      const l = state[action.key];
      return l ? { ...state, [action.key]: { ...l, qty: l.qty + 1 } } : state;
    }
    case "dec": {
      const l = state[action.key];
      if (!l) return state;
      if (l.qty <= 1) {
        const n = { ...state };
        delete n[action.key];
        return n;
      }
      return { ...state, [action.key]: { ...l, qty: l.qty - 1 } };
    }
    case "hydrate":
      return Object.fromEntries(action.lines.map((l) => [l.key, l]));
    case "clear":
      return {};
  }
}

export function useCart() {
  const [cart, dispatch] = useReducer(reducer, {});
  const lines = useMemo(() => Object.values(cart), [cart]);
  const total = useMemo(() => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0), [lines]);
  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);
  return { lines, total, count, dispatch };
}
