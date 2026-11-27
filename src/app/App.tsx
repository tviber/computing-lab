import { LayoutHost } from "../shared/layout/host";
import { AccountMenu } from "../shared/auth";
import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createMemo, Loading } from "solid-js";
import { AuthProvider, type AuthState } from "../shared/auth";
import { router as AppRouter } from "./router";

const previewAuth: AuthState = { status: "anonymous", session: null };

function AppAuthShell(props: { children?: JSX.Element }) {
  const location = useLocation();
  // Dev previews fire no auth request from the outer provider either.
  // Isolation itself lives in the shell's PreviewAuthBoundary — this only
  // skips the fetch; the provider's mount-time state can no longer leak
  // into preview content. Leaving the route resumes normal refresh.
  const preview = createMemo(
    () => import.meta.env.DEV && location.pathname.includes("/__dev/labs/"),
  );
  return (
    <AuthProvider initialState={preview() ? previewAuth : undefined}>
      <Loading
        fallback={
          <p class="home-loading" role="status">
            正在载入…
          </p>
        }
      >
        <LayoutHost account={() => <AccountMenu />}>{props.children}</LayoutHost>
      </Loading>
    </AuthProvider>
  );
}

export default function App() {
  return <AppRouter>{(props) => <AppAuthShell>{props.children}</AppAuthShell>}</AppRouter>;
}
