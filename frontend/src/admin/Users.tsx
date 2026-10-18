import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Role } from "../api";
import { api, errorText, fmtDateTime, postJson } from "../api";
import { Badge, Banner, Card, Field, Modal, PlusIcon, Select, Spinner, inputCls, redBtn, secondaryBtn, smallBtn } from "../Ui";
import type { Notice } from "../Ui";

type UserRow = {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  quotes: number;
};

// ---------------------------------------------------------------------------
// Admin: staff and admin accounts
// ---------------------------------------------------------------------------
export default function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api<{ users: UserRow[] }>("/api/admin/users")
      .then((d) => setUsers(d.users))
      .catch((err) => setNotice({ type: "error", text: errorText(err) }));
  }, [version]);

  const saved = (text: string) => {
    setAdding(false);
    setEditing(null);
    setNotice({ type: "success", text });
    setVersion((v) => v + 1);
  };

  const active = users.filter((u) => u.is_active).length;

  return (
    <Card
      eyebrow="Admin"
      title="Users"
      description={`${active} active account${active === 1 ? "" : "s"}. Each person signs in with their own username, so the history shows who submitted each quote.`}
      actions={
        <button type="button" className={redBtn} onClick={() => setAdding(true)}>
          <PlusIcon className="h-4 w-4" />
          Add user
        </button>
      }
    >
      <Banner notice={notice} />

      <div className="overflow-x-auto rounded-xl border border-blue-50">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-brand-ice text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Last sign-in</th>
              <th className="px-4 py-3 text-right font-semibold">Quotes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-t border-blue-50 ${u.is_active ? "" : "text-slate-400"}`}>
                <td className="px-4 py-3">
                  <span className={`block font-semibold ${u.is_active ? "text-slate-800" : ""}`}>{u.full_name}</span>
                  <span className="block text-xs text-slate-400">@{u.username}</span>
                </td>
                <td className="px-4 py-3">{u.role === "admin" ? <Badge tone="red">Admin</Badge> : <Badge tone="blue">Staff</Badge>}</td>
                <td className="px-4 py-3">{u.is_active ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{u.last_login_at ? fmtDateTime(u.last_login_at) : "Never"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{u.quotes}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className={smallBtn} onClick={() => setEditing(u)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && <AddUser onClose={() => setAdding(false)} onSaved={saved} />}
      {editing && <EditUser user={editing} onClose={() => setEditing(null)} onSaved={saved} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
function AddUser({ onClose, onSaved }: { onClose: () => void; onSaved: (text: string) => void }) {
  const [form, setForm] = useState({ full_name: "", username: "", password: "", role: "staff" as Role });
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await postJson("/api/admin/users", form);
      onSaved(`Account created for ${form.full_name}. Share the username and password with them.`);
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      setBusy(false);
    }
  };

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Banner notice={notice} />
        <Field label="Full name" hint="Shown in the history and on printed quotations">
          <input required maxLength={100} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Username" hint="Letters, numbers, dots, dashes or underscores">
          <input
            required
            minLength={3}
            maxLength={50}
            pattern="[A-Za-z0-9._\-]+"
            autoCapitalize="none"
            spellCheck={false}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Temporary password" hint="At least 8 characters. They can change it after signing in.">
          <input required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="staff">Staff - compare rates and submit quotes</option>
            <option value="admin">Admin - everything, including the dashboard and settings</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className={`${secondaryBtn} h-12`} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={redBtn}>
            {busy && <Spinner />}
            Create account
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function EditUser({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: (text: string) => void }) {
  const [fullName, setFullName] = useState(user.full_name);
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await postJson(
        `/api/admin/users/${user.id}`,
        { full_name: fullName, role, is_active: isActive, ...(password ? { password } : {}) },
        "PATCH",
      );
      onSaved(`${fullName}'s account was updated${password ? " and the password reset" : ""}.`);
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit @${user.username}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Banner notice={notice} />
        <Field label="Full name">
          <input required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <label className="flex items-start gap-3 rounded-xl border border-blue-100 px-4 py-3">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="mt-1 h-4 w-4 accent-[#0b3c91]" />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Account active</span>
            <span className="block text-xs text-slate-500">Turn off to block sign-in straight away. Their past quotes are kept.</span>
          </span>
        </label>
        <Field label="Reset password (optional)" hint="Leave empty to keep the current password">
          <input minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className={`${secondaryBtn} h-12`} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={redBtn}>
            {busy && <Spinner />}
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
