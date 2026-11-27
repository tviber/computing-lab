import { useNavigate } from "@solidjs/router";
import { Button } from "@ui-sdk/solid/button";
import { createEffect, createSignal, Show } from "solid-js";
import { useAuth } from "../../shared/auth";
import { describeApiError } from "../../shared/api/client";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./auth.css";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [studentNo, setStudentNo] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  createEffect(
    () => auth.status,
    (status) => {
      if (status === "authenticated") navigate("/");
    },
  );

  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.login({ studentNo: studentNo(), password: password() });
      navigate("/");
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppPageLayout class="auth-page" topbarProps={{ showAccount: false }}>
      <main aria-labelledby="auth-title" class="auth-card">
        <p class="eyebrow">校内信息技术实验</p>
        <h1 id="auth-title">登录</h1>

        <form class="auth-form" onSubmit={(event) => void onSubmit(event)}>
          <label>
            学号
            <input
              autocomplete="username"
              name="studentNo"
              onInput={(e) => setStudentNo(e.currentTarget.value)}
              required
              value={studentNo()}
            />
          </label>

          <label>
            密码
            <input
              autocomplete="current-password"
              name="password"
              onInput={(e) => setPassword(e.currentTarget.value)}
              required
              type="password"
              value={password()}
            />
          </label>

          <Show when={error()}>
            <p class="auth-error" role="alert">
              {error()}
            </p>
          </Show>

          <Button class="button button-primary" disabled={busy()} type="submit">
            {busy() ? "提交中…" : "登录"}
          </Button>
        </form>

        <p class="auth-note">账号由管理员统一开通，请使用下发的学号和初始密码登录。</p>
      </main>
    </AppPageLayout>
  );
}
