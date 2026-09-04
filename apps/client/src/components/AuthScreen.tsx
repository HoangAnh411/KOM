import { useState } from "react";
import type { FactionId } from "@kingdoms/shared";
import { factions } from "@kingdoms/shared";
import * as api from "../api.js";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";

/** Both forms are one field per row: a `<label>` naming the control, then the
 *  control. They used to be a single line of JSX each, with the field name living
 *  only in `placeholder` — which is text that disappears the moment the player
 *  types into it, so there was no way to check what a filled-in box was for, and a
 *  screen reader announcing the second `<input>` had nothing but "edit text,
 *  Mật khẩu" from a hint the UA is not required to expose at all. The placeholders
 *  stay: they are the example, not the name. */
function FactionField({ value, onChange }: { value: FactionId; onChange: (id: FactionId) => void }) {
  return <label className="login-field">
    <span>Phe</span>
    <select value={value} onChange={event => onChange(event.target.value as FactionId)}>
      {Object.entries(factions).map(([id, item]) => <option value={id} key={id}>{item.name}</option>)}
    </select>
  </label>;
}

function PasswordLogin() {
  const { setSession, addNotice } = useGame();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [faction, setFaction] = useState<FactionId>("meridian");
  const [registering, setRegistering] = useState(false);
  return <form className="login-card" onSubmit={event => {
    event.preventDefault();
    void (registering ? api.register(username, password, faction) : api.passwordLogin(username, password))
      .then(setSession)
      .catch(reason => addNotice(reason instanceof Error ? reason.message : "Đăng nhập thất bại"));
  }}>
    <h1>Kingdoms of Meridian</h1>
    <p>{registering ? "Tạo tài khoản của bạn" : "Đăng nhập vào vương quốc của bạn"}</p>
    <label className="login-field">
      <span>Tên đăng nhập</span>
      <input required minLength={3} maxLength={32} value={username} onChange={event => setUsername(event.target.value)} placeholder="Tên đăng nhập" />
    </label>
    <label className="login-field">
      <span>Mật khẩu</span>
      <input required minLength={12} maxLength={128} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Mật khẩu" />
    </label>
    {registering && <FactionField value={faction} onChange={setFaction} />}
    <Button type="submit" variant="primary">{registering ? "Đăng ký" : "Đăng nhập"}</Button>
    {/* Ghost, because the two buttons are not the same offer: one submits what was
        typed, the other swaps the form. Two identical buttons made the second read
        as an alternative way to sign in. */}
    <Button variant="ghost" onClick={() => setRegistering(value => !value)}>
      {registering ? "Chuyển sang đăng nhập" : "Tạo tài khoản"}
    </Button>
  </form>;
}

function DevLogin() {
  const { setSession, addNotice } = useGame();
  const [name, setName] = useState("Lan");
  const [faction, setFaction] = useState<FactionId>("meridian");
  return <form className="login-card" onSubmit={event => {
    event.preventDefault();
    void api.login(name, faction)
      .then(next => { sessionStorage.setItem("kingdoms-session", JSON.stringify({ token: next.token, player: next.player })); setSession(next); })
      .catch(reason => addNotice(reason instanceof Error ? reason.message : "Đăng nhập thất bại"));
  }}>
    <h1>Kingdoms of Meridian</h1>
    <p>Chiến thắng bằng chiến lược, kinh tế và ngoại giao.</p>
    <label className="login-field">
      <span>Tên người chơi</span>
      <input value={name} onChange={event => setName(event.target.value)} placeholder="Tên người chơi" />
    </label>
    <FactionField value={faction} onChange={setFaction} />
    <Button type="submit" variant="primary">Vào kingdom</Button>
  </form>;
}

export function AuthScreen() {
  return import.meta.env.VITE_AUTH_MODE === "password" ? <PasswordLogin /> : <DevLogin />;
}