import { createContext, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";

const AccountSlot = createContext<() => JSX.Element>(() => null);
export function LayoutHost(props: { account: () => JSX.Element; children?: JSX.Element }) {
  return <AccountSlot value={props.account}>{props.children}</AccountSlot>;
}
export function HostAccount() {
  const account = useContext(AccountSlot);
  return <>{account()}</>;
}
