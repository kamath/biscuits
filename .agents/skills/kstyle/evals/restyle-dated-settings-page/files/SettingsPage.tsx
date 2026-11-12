import { useEffect, useState } from "react";
import "./settings.css";

type Profile = { name: string; email: string };
type Prefs = { weeklyDigest: boolean; productUpdates: boolean; securityAlerts: boolean };

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setProfile);
    fetch("/api/me/prefs").then((r) => r.json()).then(setPrefs);
  }, []);

  if (!profile || !prefs) return <div>Loading...</div>;

  return (
    <div className="settings">
      <h1>Settings</h1>
      <p className="subtitle">Manage your account settings and preferences below.</p>
      <ProfileSection profile={profile} setProfile={setProfile} saving={saving} setSaving={setSaving} />
      <PrefsSection prefs={prefs} setPrefs={setPrefs} saving={saving} setSaving={setSaving} />
      <DangerZone />
    </div>
  );
}

function ProfileSection({ profile, setProfile, saving, setSaving }: any) {
  const [draft, setDraft] = useState(profile);
  async function save() {
    setSaving(true);
    await fetch("/api/me", { method: "PUT", body: JSON.stringify(draft), headers: { "content-type": "application/json" } });
    setProfile(draft);
    setSaving(false);
    alert("Saved!");
  }
  return (
    <div className="box">
      <h2>Profile</h2>
      <p className="hint">This is your personal information.</p>
      <label>Name <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Email <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
      <button onClick={save} disabled={saving}>Save profile</button>
    </div>
  );
}

function PrefsSection({ prefs, setPrefs, saving, setSaving }: any) {
  async function toggle(key: keyof Prefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setSaving(true);
    await fetch("/api/me/prefs", { method: "PUT", body: JSON.stringify(next), headers: { "content-type": "application/json" } });
    setPrefs(next);
    setSaving(false);
  }
  return (
    <div className="box">
      <h2>Notifications</h2>
      <p className="hint">Choose which emails you want to receive.</p>
      {(["weeklyDigest", "productUpdates", "securityAlerts"] as const).map((k) => (
        <label key={k} className="check">
          <input type="checkbox" checked={prefs[k]} onChange={() => toggle(k)} disabled={saving} /> {k}
        </label>
      ))}
    </div>
  );
}

function DangerZone() {
  async function del() {
    if (!confirm("Are you sure? This cannot be undone.")) return;
    await fetch("/api/me", { method: "DELETE" });
    location.href = "/goodbye";
  }
  return (
    <div className="box danger">
      <h2>Danger zone</h2>
      <p className="hint">Deleting your account is permanent.</p>
      <button className="red" onClick={del}>Delete my account</button>
    </div>
  );
}
