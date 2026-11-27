/**
 * Account/class creation and CSV import panels for the admin page. Each form
 * is self-contained: it owns its field state and calls `onCreated`/`onImported`
 * so the parent refetches.
 */

import { Button } from "@ui-sdk/solid/button";
import { createSignal, For, Show } from "solid-js";
import { api, describeApiError, API_ERROR_MESSAGES } from "../../shared/api/client";
import type { AccountRole } from "../../shared/auth";
import { Disclosure } from "../../shared/ui/Disclosure";
import type { AdminClass, ImportSummary } from "./AdminTypes";

function rowErrorText(code: string | undefined): string {
  return code ? (API_ERROR_MESSAGES[code] ?? code) : "";
}

export function CreateAccountForm(props: { classes: AdminClass[]; onCreated: () => void }) {
  const [studentNo, setStudentNo] = createSignal("");
  const [name, setName] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [role, setRole] = createSignal<AccountRole>("user");
  const [classId, setClassId] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.post("/api/admin/users", {
        studentNo: studentNo(),
        name: name(),
        password: password(),
        role: role(),
        classId: classId() || undefined,
      });
      setStudentNo("");
      setName("");
      setPassword("");
      setRole("user");
      setClassId("");
      setSuccess("账号已创建。");
      props.onCreated();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      aria-labelledby="create-account-title"
      class="profile-form admin-create-account-form"
      onSubmit={(event) => void onSubmit(event)}
    >
      <label>
        学号
        <input
          autocomplete="off"
          name="studentNo"
          onInput={(e) => setStudentNo(e.currentTarget.value)}
          required
          value={studentNo()}
        />
      </label>
      <label>
        姓名
        <input
          autocomplete="off"
          name="name"
          onInput={(e) => setName(e.currentTarget.value)}
          required
          value={name()}
        />
      </label>
      <label>
        初始密码
        <input
          autocomplete="off"
          name="password"
          onInput={(e) => setPassword(e.currentTarget.value)}
          required
          value={password()}
        />
      </label>
      <label class="field-select field-select-native">
        <span>角色</span>
        <select
          name="role"
          onChange={(e) => setRole(e.currentTarget.value as AccountRole)}
          value={role()}
        >
          <option value="user">学生</option>
          <option value="teacher">教师</option>
          <option value="admin">管理员</option>
        </select>
      </label>
      <label class="field-select field-select-native admin-class-field">
        <span>分配班级（可选）</span>
        <select
          name="classId"
          onChange={(e) => setClassId(e.currentTarget.value)}
          value={classId()}
        >
          <option value="">不分配</option>
          <For each={props.classes}>
            {(klass) => <option value={klass.id}>{klass.name}</option>}
          </For>
        </select>
      </label>
      <Show when={error()}>
        {(msg) => (
          <p class="auth-error" role="alert">
            {msg()}
          </p>
        )}
      </Show>
      <Show when={success()}>
        {(msg) => (
          <p class="profile-success" role="status">
            {msg()}
          </p>
        )}
      </Show>
      <Button class="button button-primary" disabled={busy()} type="submit">
        {busy() ? "创建中…" : "创建账号"}
      </Button>
    </form>
  );
}

export function ImportPanel(props: { onImported: () => void }) {
  const [text, setText] = createSignal("");
  const [summary, setSummary] = createSignal<ImportSummary | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [reading, setReading] = createSignal(false);
  const [fileName, setFileName] = createSignal("");

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setSummary(null);
    setError(null);
    try {
      setText(await file.text());
      setFileName(file.name);
    } catch {
      setError("文件读取失败，请重新选择文件或粘贴名单。");
    } finally {
      setReading(false);
    }
  };

  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    setSummary(null);
    const trimmed = text().trim();
    if (!trimmed) {
      setError("请先粘贴名单或选择 CSV 文件。");
      return;
    }
    let payload: { csv: string } | { users: unknown[] };
    if (trimmed.startsWith("[")) {
      try {
        payload = { users: JSON.parse(trimmed) as unknown[] };
      } catch {
        setError("JSON 解析失败，请检查格式。");
        return;
      }
    } else {
      payload = { csv: trimmed };
    }
    setBusy(true);
    try {
      const result = await api.post<ImportSummary>("/api/admin/users/import", payload);
      setSummary(result);
      props.onImported();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      aria-labelledby="import-title"
      class="admin-import-form"
      onSubmit={(event) => void onSubmit(event)}
    >
      <div class="admin-import-editor">
        <div class="admin-import-toolbar">
          <label for="admin-import-text">账号名单</label>
          <label class="admin-file-picker button button-secondary">
            选择 CSV 文件
            <input
              accept=".csv,text/csv,text/plain"
              class="sr-only"
              disabled={reading() || busy()}
              name="importFile"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void onFile(file);
              }}
              type="file"
            />
          </label>
        </div>
        <textarea
          aria-describedby="admin-import-hint"
          class="admin-import-text"
          id="admin-import-text"
          name="importText"
          onInput={(event) => {
            setText(event.currentTarget.value);
            setSummary(null);
            setError(null);
            setFileName("");
          }}
          placeholder={"20260101,张三,pass123\n20260102,李四,pass456,学生,CLASS26"}
          readonly={reading() || busy()}
          rows={5}
          spellcheck={false}
          value={text()}
        />
      </div>
      <p id="admin-import-hint">粘贴 CSV 或 JSON 数组，也可选择 CSV 文件后在上方核对。</p>
      <Disclosure class="admin-import-guide" summary="查看名单格式">
        <p>
          CSV
          每行一个账号，依次填写学号、姓名、密码。后两列可选，分别是角色和班级邀请码。角色可填学生、教师或管理员，留空默认为学生。
        </p>
        <p>JSON 示例</p>
        <code>{'[{"studentNo":"20260101","name":"张三","password":"pass123"}]'}</code>
      </Disclosure>
      <div class="admin-import-actions">
        <Button
          class="button button-primary"
          disabled={busy() || reading() || !text().trim()}
          type="submit"
        >
          {busy() ? "导入中…" : "开始导入"}
        </Button>
        <span role="status">
          {reading() ? "正在读取文件…" : fileName() ? `已读取 ${fileName()}` : ""}
        </span>
      </div>
      <Show when={error()}>
        {(msg) => (
          <p class="auth-error" role="alert">
            {msg()}
          </p>
        )}
      </Show>
      <Show when={summary()}>
        {(result) => {
          const failedRows = () => result().rows.filter((row) => row.status !== "created");
          return (
            <section aria-label="导入结果" class="admin-import-result">
              <h3>导入结果</h3>
              <p role="status">
                新建 {result().created} 个，已存在 {result().exists} 个，失败 {result().failed} 个。
              </p>
              <Show when={failedRows().length > 0}>
                <table aria-label="未创建的账号" class="admin-import-table">
                  <thead>
                    <tr>
                      <th scope="col">行</th>
                      <th scope="col">学号</th>
                      <th scope="col">结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={failedRows()}>
                      {(row) => (
                        <tr>
                          <td>{row.line}</td>
                          <td>{row.studentNo || "—"}</td>
                          <td>
                            {row.status === "exists" ? "已存在，跳过" : rowErrorText(row.error)}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>
            </section>
          );
        }}
      </Show>
    </form>
  );
}

export function CreateClassForm(props: { onCreated: () => void }) {
  const [name, setName] = createSignal("");
  const [inviteCode, setInviteCode] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/admin/classes", {
        name: name(),
        inviteCode: inviteCode() || undefined,
      });
      setName("");
      setInviteCode("");
      props.onCreated();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="admin-class-form" onSubmit={(event) => void onSubmit(event)}>
      <label>
        班级名称
        <input
          name="className"
          onInput={(e) => setName(e.currentTarget.value)}
          required
          value={name()}
        />
      </label>
      <label>
        邀请码（可选）
        <input
          name="inviteCode"
          onInput={(e) => setInviteCode(e.currentTarget.value)}
          placeholder="留空自动生成"
          value={inviteCode()}
        />
      </label>
      <Button class="button button-secondary" disabled={busy()} type="submit">
        {busy() ? "创建中…" : "新建班级"}
      </Button>
      <Show when={error()}>
        {(msg) => (
          <p class="auth-error" role="alert">
            {msg()}
          </p>
        )}
      </Show>
    </form>
  );
}
