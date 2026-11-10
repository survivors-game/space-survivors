import { useEffect, useState, type FormEvent } from "react";

type Settings = {
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  maintenanceMessage: string;
  eventsEnabled: boolean;
  rewardsEnabled: boolean;
  chatEnabled: boolean;
};
type Log = {
  setting_key: string;
  old_value: string;
  new_value: string;
  reason: string;
  admin_email: string;
  created_at: number;
};
type Payload = { settings?: Settings; logs?: Log[]; error?: string };
const panel = "rounded border border-white/10 bg-white/[0.03] p-4";
const input = "mt-1 w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50";
const labels: Record<string,string> = {
  maintenance_mode: "Modo mantenimiento",
  registration_enabled: "Registro de nuevos jugadores",
  events_enabled: "Gestión de eventos y temporadas",
  rewards_enabled: "Entrega administrativa de recompensas",
};
const dateLabel = (value:number) => new Date(value).toLocaleString("es-CO");

export function ConfigAdminSection() {
  const [settings,setSettings] = useState<Settings>({
    maintenanceMode:false, registrationEnabled:true,
    maintenanceMessage:"Estamos realizando tareas de mantenimiento. Vuelve pronto.",
    eventsEnabled:true, rewardsEnabled:true, chatEnabled:true,
  });
  const [savedChatEnabled,setSavedChatEnabled] = useState(true);
  const [logs,setLogs] = useState<Log[]>([]);
  const [reason,setReason] = useState("");
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [response,chatResponse] = await Promise.all([
        fetch("/api/admin/config",{credentials:"same-origin"}),
        fetch("/api/admin/chat",{credentials:"same-origin"}),
      ]);
      const data = await response.json() as Payload;
      const chatData = await chatResponse.json() as {chatEnabled?:boolean;error?:string};
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la configuración.");
      if (!chatResponse.ok) throw new Error(chatData.error || "No se pudo consultar el estado del chat.");
      if (data.settings) setSettings({...data.settings,chatEnabled:chatData.chatEnabled !== false});
      setSavedChatEnabled(chatData.chatEnabled !== false);
      setLogs(data.logs ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la configuración.");
    } finally { setLoading(false); }
  };
  useEffect(()=>{void load();},[]);

  const save = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reason.trim().length < 5) { setError("Escribe el motivo del cambio."); return; }
    if (settings.maintenanceMode && settings.maintenanceMessage.trim().length < 5) {
      setError("Escribe el mensaje que verán los jugadores durante el mantenimiento."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/config",{
        method:"POST",credentials:"same-origin",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({settings,reason:reason.trim()}),
      });
      const data = await response.json() as {error?:string;changed?:number};
      if (!response.ok) throw new Error(data.error || "No se pudieron guardar los ajustes.");
      if (settings.chatEnabled !== savedChatEnabled) {
        const chatResponse = await fetch("/api/admin/chat",{
          method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
          body:JSON.stringify({action:"set-chat-enabled",enabled:settings.chatEnabled,reason:reason.trim()}),
        });
        const chatData = await chatResponse.json() as {error?:string};
        if (!chatResponse.ok) throw new Error(chatData.error || "La configuración general se guardó, pero no se pudo cambiar el chat.");
      }
      setNotice(data.changed || settings.chatEnabled !== savedChatEnabled ? "Configuración guardada. Cambios aplicados en el servidor." : "No había cambios nuevos para guardar.");
      setReason("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron guardar los ajustes.");
    } finally { setBusy(false); }
  };

  const toggle = (key:keyof Pick<Settings,"maintenanceMode"|"registrationEnabled"|"eventsEnabled"|"rewardsEnabled"|"chatEnabled">,value:boolean) => {
    setSettings(current=>({...current,[key]:value}));
  };
  const status = (value:string) => value === "true" ? "Activado" : value === "false" ? "Desactivado" : value;

  return <section className="space-y-5">
    <form onSubmit={save} className="space-y-4 rounded border border-white/10 bg-white/[0.03] p-4">
      <div>
        <h2 className="text-xs uppercase tracking-wider text-cyan-200">Controles generales del juego</h2>
        <p className="mt-1 text-xs text-white/45">Estos controles se aplican desde el servidor. Cada modificación queda registrada.</p>
      </div>
      {([
        ["maintenanceMode","Modo mantenimiento","Bloquea el acceso de jugadores y mantiene disponible el acceso administrativo."],
        ["registrationEnabled","Registro de nuevos jugadores","Impide crear cuentas nuevas cuando está desactivado. Las cuentas existentes pueden entrar."],
        ["chatEnabled","Chat global","Permite o suspende el chat de todos los jugadores."],
        ["eventsEnabled","Eventos y temporadas","Permite o bloquea la creación y gestión administrativa de eventos."],
        ["rewardsEnabled","Entrega de recompensas","Permite o bloquea las entregas manuales de CR, OBS, naves, objetos y VIP."],
      ] as const).map(([key,label,help])=><label key={key} className="flex items-start justify-between gap-4 rounded border border-white/10 p-3">
        <span><span className="block text-sm text-white/85">{label}</span><span className="mt-1 block text-xs text-white/45">{help}</span></span>
        <input type="checkbox" checked={settings[key]} onChange={e=>toggle(key,e.target.checked)} className="mt-1 size-4 shrink-0 accent-cyan-300"/>
      </label>)}
      <label className="block text-xs text-white/70">Mensaje para los jugadores durante el mantenimiento
        <textarea rows={3} maxLength={500} value={settings.maintenanceMessage} onChange={e=>setSettings(current=>({...current,maintenanceMessage:e.target.value}))} className={input}/>
      </label>
      <label className="block text-xs text-white/70">Motivo del cambio (obligatorio)
        <textarea rows={2} minLength={5} maxLength={240} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej. Activar mantenimiento para actualizar el juego." className={input}/>
      </label>
      <button disabled={busy||loading||reason.trim().length<5} className="w-full rounded bg-cyan-300 py-2.5 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-40">{busy?"Guardando...":"Guardar configuración"}</button>
      {error?<p role="alert" className="text-sm text-rose-300">{error}</p>:null}
      {notice?<p role="status" className="text-sm text-emerald-300">{notice}</p>:null}
    </form>
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h3 className="text-xs uppercase tracking-wider text-white/70">Historial de configuración</h3><button type="button" onClick={()=>void load()} disabled={loading} className="rounded border border-white/15 px-3 py-2 text-xs text-white/70">{loading?"Cargando...":"Actualizar"}</button></div>
      <div className="overflow-x-auto rounded border border-white/10">
        <table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-white/[0.03] text-white/55"><tr>{["Fecha","Ajuste","Valor anterior","Valor nuevo","Motivo","Administrador"].map(label=><th key={label} className="px-3 py-3 font-normal">{label}</th>)}</tr></thead>
          <tbody>{logs.map((log,index)=><tr key={log.setting_key+log.created_at+index} className="border-t border-white/5 text-white/70"><td className="whitespace-nowrap px-3 py-2">{dateLabel(log.created_at)}</td><td className="px-3 py-2">{labels[log.setting_key] ?? log.setting_key}</td><td className="px-3 py-2">{log.setting_key.endsWith("_mode")||log.setting_key.endsWith("_enabled")?status(log.old_value):log.old_value||"—"}</td><td className="px-3 py-2">{log.setting_key.endsWith("_mode")||log.setting_key.endsWith("_enabled")?status(log.new_value):log.new_value}</td><td className="max-w-[220px] whitespace-normal px-3 py-2">{log.reason}</td><td className="px-3 py-2">{log.admin_email}</td></tr>)}</tbody>
        </table>
        {!logs.length?<p className="p-4 text-center text-xs text-white/40">Todavía no hay cambios registrados.</p>:null}
      </div>
    </section>
  </section>;
}
