/**
 * Account/class creation and CSV import panels for the admin page. Each form
 * is self-contained: it owns its field state and calls `onCreated`/`onImported`
 * so the parent refetches.
 */

import { useState, type FormEvent } from "react";
import { api, describeApiError, API_ERROR_MESSAGES } from "../../shared/api/client";
import type { AccountRole } from "../../shared/auth";
import type { AdminClass, ImportSummary } from "./AdminTypes";

function rowErrorText(code: string | undefined): string {
  return code ? (API_ERROR_MESSAGES[code] ?? code) : "";
}

export function CreateAccountForm({
  classes,
  onCreated,
}: {
  classes: AdminClass[];
  onCreated: () => void;
}) {
  const [studentNo, setStudentNo] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AccountRole>("user");
  const [classId, setClassId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.post("/api/admin/users", {
        studentNo,
        name,
        password,
        role,
        classId: classId || undefined,
      });
      setStudentNo("");
      setName("");
      setPassword("");
      setRole("user");
      setClassId("");
      setSuccess("账号已创建。");
      onCreated();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      aria-labelledby="create-account-title"
      className="profile-form admin-create-account-form"
      onSubmit={onSubmit}
    >
      <label>
        学号
        <input
          autoComplete="off"
          name="studentNo"
          onChange={(e) => setStudentNo(e.target.value)}
          required
          value={studentNo}
        />
      </label>
      <label>
        姓名
        <input
          autoComplete="off"
          name="name"
          onChange={(e) => setName(e.target.value)}
          required
          value={name}
        />
      </label>
      <label>
        初始密码
        <input
          autoComplete="off"
          name="password"
          onChange={(e) => setPassword(e.target.value)}
          required
          value={password}
        />
      </label>
      <label className="field-select field-select-native">
        <span>角色</span>
        <select name="role" onChange={(e) => setRole(e.target.value as AccountRole)} value={role}>
          <option value="user">学生</option>
          <option value="teacher">教师</option>
          <option value="admin">管理员</option>
        </select>
      </label>
      <label className="field-select field-select-native admin-class-field">
        <span>分配班级（可选）</span>
        <select name="classId" onChange={(e) => setClassId(e.target.value)} value={classId}>
          <option value="">不分配</option>
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.name}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="profile-success" role="status">
          {success}
        </p>
      ) : null}
      <button className="button button-primary" disabled={busy} type="submit">
        {busy ? "创建中…" : "创建账号"}
      </button>
    </form>
  );
}

export function ImportPanel({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState("");

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

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSummary(null);
    const trimmed = text.trim();
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
      onImported();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form aria-labelledby="import-title" className="admin-import-form" onSubmit={onSubmit}>
      <div className="admin-import-editor">
        <div className="admin-import-toolbar">
          <label htmlFor="admin-import-text">账号名单</label>
          <label className="admin-file-picker button button-secondary">
            选择 CSV 文件
            <input
              className="sr-only"
              accept=".csv,text/csv,text/plain"
              disabled={reading || busy}
              name="importFile"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onFile(file);
              }}
              type="file"
            />
          </label>
        </div>
        <textarea
          id="admin-import-text"
          aria-describedby="admin-import-hint"
          className="admin-import-text"
          name="importText"
          readOnly={reading || busy}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            setSummary(null);
            setError(null);
            setFileName("");
          }}
          placeholder={"20260101,张三,pass123\n20260102,李四,pass456,学生,CLASS26"}
          rows={5}
          value={text}
        />
      </div>
      <p id="admin-import-hint">粘贴 CSV 或 JSON 数组，也可选择 CSV 文件后在上方核对。</p>
      <details className="admin-import-guide">
        <summary>查看名单格式</summary>
        <p>
          CSV
          每行一个账号，依次填写学号、姓名、密码。后两列可选，分别是角色和班级邀请码。角色可填学生、教师或管理员，留空默认为学生。
        </p>
        <p>JSON 示例</p>
        <code>{'[{"studentNo":"20260101","name":"张三","password":"pass123"}]'}</code>
      </details>
      <div className="admin-import-actions">
        <button
          className="button button-primary"
          disabled={busy || reading || !text.trim()}
          type="submit"
        >
          {busy ? "导入中…" : "开始导入"}
        </button>
        <span role="status">
          {reading ? "正在读取文件…" : fileName ? `已读取 ${fileName}` : ""}
        </span>
      </div>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {summary ? (
        <section className="admin-import-result" aria-label="导入结果">
          <h3>导入结果</h3>
          <p role="status">
            新建 {summary.created} 个，已存在 {summary.exists} 个，失败 {summary.failed} 个。
          </p>
          {summary.rows.some((row) => row.status !== "created") ? (
            <table aria-label="未创建的账号" className="admin-import-table">
              <thead>
                <tr>
                  <th scope="col">行</th>
                  <th scope="col">学号</th>
                  <th scope="col">结果</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows
                  .filter((row) => row.status !== "created")
                  .map((row) => (
                    <tr key={row.line}>
                      <td>{row.line}</td>
                      <td>{row.studentNo || "—"}</td>
                      <td>{row.status === "exists" ? "已存在，跳过" : rowErrorText(row.error)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}

export function CreateClassForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/admin/classes", {
        name,
        inviteCode: inviteCode || undefined,
      });
      setName("");
      setInviteCode("");
      onCreated();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-class-form" onSubmit={onSubmit}>
      <label>
        班级名称
        <input name="className" onChange={(e) => setName(e.target.value)} required value={name} />
      </label>
      <label>
        邀请码（可选）
        <input
          name="inviteCode"
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="留空自动生成"
          value={inviteCode}
        />
      </label>
      <button className="button button-secondary" disabled={busy} type="submit">
        {busy ? "创建中…" : "新建班级"}
      </button>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
