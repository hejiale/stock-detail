import { createContext, useContext } from "react";

export const AppContext = createContext({
  openStock: () => {},
  openFund: () => {},
  openCrypto: () => {},
  openBoard: () => {},
  navigate: () => {},
  refreshKey: 0,
  bumpRefresh: () => {}
});

export function useAppNav() {
  return useContext(AppContext);
}