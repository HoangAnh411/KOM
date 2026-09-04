import { useState } from "react";
import type { FactionId } from "@kingdoms/shared";
import { factions } from "@kingdoms/shared";
import * as api from "../api.js";
import { useGame } from "../state.js";

function PasswordLogin() {
  const { setSession, addNotice } = useGame();
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [faction, setFaction] = useState<FactionId>("meridian"); const [registering, setRegistering] = useState(false);
  return <form className="login-card" onSubmit={event => {
    event.preventDefault();
    void (registering ? api.register(username, password, faction) : api.passwordLogin(username, password))
      .then(setSession)
      .catch(reason => addNotice(reason instanceof Error ? reason.message : "Đăng nhập thất bại"));
  }}><h1>Kingdoms of Meridian</h1><p>{registering ? "Tạo tài khoản của bạn" : "Đăng nhập vào vương quốc của bạn"}</p><input required minLength={3} maxLength={32} value={username} onChange={event => setUsername(event.target.value)} placeholder="Tên đăng nhập" /><input required minLength={12} maxLength={128} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Mật khẩu" />{registering && <select value={faction} onChange={event => setFaction(event.target.value as FactionId)} aria-label="Phe">{Object.entries(factions).map(([id, item]) => <option value={id} key={id}>{item.name}</option>)}</select>}<button type="submit">{registering ? "Đăng ký" : "Đăng nhập"}</button><button type="button" onClick={() => setRegistering(value => !value)}>{registering ? "Chuyển sang đăng nhập" : "Tạo tài khoản"}</button></form>;
}

function DevLogin() {
  const { setSession, addNotice } = useGame();
  const [name, setName] = useState("Lan"); const [faction, setFaction] = useState<FactionId>("meridian");
  return <form className="login-card" onSubmit={event => {
    event.preventDefault();
    void api.login(name, faction)
      .then(next => { sessionStorage.setItem("kingdoms-session", JSON.stringify({ token: next.token, player: next.player })); setSession(next); })
      .catch(reason => addNotice(reason instanceof Error ? reason.message : "Đăng nhập thất bại"));
  }}><h1>Kingdoms of Meridian</h1><p>Chiến thắng bằng chiến lược, kinh tế và ngoại giao.</p><input value={name} onChange={event => setName(event.target.value)} placeholder="Tên người chơi" /><select value={faction} onChange={event => setFaction(event.target.value as FactionId)} aria-label="Phe">{Object.entries(factions).map(([id, item]) => <option value={id} key={id}>{item.name}</option>)}</select><button type="submit">Vào kingdom</button></form>;
}

export function AuthScreen() {
  return import.meta.env.VITE_AUTH_MODE === "password" ? <PasswordLogin /> : <DevLogin />;
}