import { createContext, useContext } from "react";

export const AppContext = createContext({
  openStock: () => {},
  openFund: () => {},
  openCrypto: () => {},
  openBoard: () => {},
  navigate: () => {},
  refreshKey: 0,
  bumpRefresh: () => {},
  user: null,
  setUser: () => {},
  openAuth: () => {}
});

export function useAppNav() {
  return useContext(AppContext);
}