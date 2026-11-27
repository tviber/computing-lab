import { Button } from "@ui-sdk/solid/button";
import { createSignal, Match, Show, Switch } from "solid-js";
import { describeApiError } from "../../shared/api/client";
import { isStaffRole, ROLE_LABELS, useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Redirect } from "../../shared/ui/AppLink";
import "./profile.css";

export function ProfilePage() {
  const auth = useAuth();
  const [currentPassword, setCurrentPassword] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [confirmation, setConfirmation] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  return (
    <Switch>
      <Match when={auth.status === "loading"}>
        <p class="home-loading" role="status">
          正在载入…
        </p>
      </Match>
      <Match when={auth.status === "anonymous"}>
        <Redirect replace to="/login" />
      </Match>
      <Match when={auth.session}>
        {(session) => {
          const minLength = () => (isStaffRole(session().user.role) ? 8 : 4);
          const onSubmit = async (event: SubmitEvent) => {
            event.preventDefault();
            setError(null);
            setSuccess(null);
            if (newPassword() !== confirmation()) {
              setError("两次输入的新密码不一致。");
              return;
            }
            if (newPassword().length < minLength() || newPassword().length > 128) {
              setError(`新密码至少 ${minLength()} 位，最多 128 位。`);
              return;
            }
            setBusy(true);
            try {
              await auth.changePassword({
                currentPassword: currentPassword(),
                newPassword: newPassword(),
              });
              setCurrentPassword("");
              setNewPassword("");
              setConfirmation("");
              setSuccess("密码已更新，下次登录请使用新密码。");
            } catch (caught) {
              setError(describeApiError(caught));
            } finally {
              setBusy(false);
            }
          };

          return (
            <AppPageLayout class="profile-page">
              <main aria-labelledby="profile-title" class="page-content profile-main">
                <section class="profile-intro">
                  <p class="eyebrow">账户 / PROFILE</p>
                  <h1 id="profile-title">个人资料</h1>
                  <p>查看你的账户信息，或更新用于登录计算实验室的密码。</p>
                </section>

                <div class="profile-grid">
                  <section aria-labelledby="identity-title" class="profile-card">
                    <div class="profile-card-heading">
                      <div>
                        <p class="eyebrow">ACCOUNT</p>
                        <h2 id="identity-title">账户信息</h2>
                      </div>
                    </div>
                    <dl class="profile-details">
                      <div>
                        <dt>姓名</dt>
                        <dd>{session().user.name}</dd>
                      </div>
                      <div>
                        <dt>学号</dt>
                        <dd>{session().user.studentNo}</dd>
                      </div>
                      <div>
                        <dt>角色</dt>
                        <dd>{ROLE_LABELS[session().user.role]}</dd>
                      </div>
                      <div>
                        <dt>所在班级</dt>
                        <dd>
                          {session()
                            .memberships.map((membership) => membership.className)
                            .join("、") || "—"}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section aria-labelledby="password-title" class="profile-card">
                    <div class="profile-card-heading">
                      <div>
                        <p class="eyebrow">SECURITY</p>
                        <h2 id="password-title">修改密码</h2>
                      </div>
                    </div>
                    <form class="profile-form" onSubmit={(event) => void onSubmit(event)}>
                      <label>
                        当前密码
                        <input
                          autocomplete="current-password"
                          name="currentPassword"
                          onInput={(event) => setCurrentPassword(event.currentTarget.value)}
                          required
                          type="password"
                          value={currentPassword()}
                        />
                      </label>
                      <label>
                        新密码
                        <input
                          autocomplete="new-password"
                          name="newPassword"
                          onInput={(event) => setNewPassword(event.currentTarget.value)}
                          required
                          type="password"
                          value={newPassword()}
                        />
                      </label>
                      <label>
                        确认新密码
                        <input
                          autocomplete="new-password"
                          name="confirmation"
                          onInput={(event) => setConfirmation(event.currentTarget.value)}
                          required
                          type="password"
                          value={confirmation()}
                        />
                      </label>
                      <p class="profile-form-note">
                        密码长度为 {minLength()}～128 位，不能与当前密码相同。
                      </p>
                      <Show when={error()}>
                        <p class="auth-error" role="alert">
                          {error()}
                        </p>
                      </Show>
                      <Show when={success()}>
                        <p class="profile-success" role="status">
                          {success()}
                        </p>
                      </Show>
                      <Button class="button button-primary" disabled={busy()} type="submit">
                        {busy() ? "保存中…" : "更新密码"}
                      </Button>
                    </form>
                  </section>
                </div>
              </main>
            </AppPageLayout>
          );
        }}
      </Match>
    </Switch>
  );
}
