import { useEffect, useState } from "react";

type VipPlayer = { pilot_id: string; callsign: string; email: string | null; vip_until: number | null };
type VipLog = { id: string; pilot_id: string; callsign: string; email: string | null; action: string; days: number; before_until: number | null; after_until: number | null; reason: string; admin_email: string; created_at: number };
type VipPayload = { players?: VipPlayer[]; logs?: VipLog[]; stats?: { active: number; expiring_soon: number }; error?: string };
const fieldClass = "h-10 w-full rounded border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-cyan-400/40";

export function VipAdminSection() {
  const [search,setSearch]=useState("");
  const [players,setPlayers]=useState<VipPlayer[]>([]);
  const [logs,setLogs]=useState<VipLog[]>([]);
  const [stats,setStats]=useState({active:0,expiring_soon:0});
  const [recipient,setRecipient]=useState("");
  const [days,setDays]=useState("30");
  const [reason,setReason]=useState("");
  const [action,setAction]=useState<"grant"|"renew"|"revoke">("grant");
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const load=async(query=search)=>{
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/admin/vip?search="+encodeURIComponent(query.trim()),{credentials:"same-origin"});
      const data=await response.json() as VipPayload;
      if(!response.ok)throw new Error(data.error||"No se pudo cargar la sección VIP.");
      setPlayers(data.players??[]);setLogs(data.logs??[]);setStats(data.stats??{active:0,expiring_soon:0});
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo cargar la sección VIP.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load("");},[]);

  const submit=async(target=recipient.trim(),selectedAction=action)=>{
    const amount=Number(days);
    if(!target||reason.trim().length<5||(selectedAction!=="revoke"&&(!Number.isSafeInteger(amount)||amount<1||amount>3650))){setError("Completa el jugador, la duración y el motivo.");return;}
    const verb=selectedAction==="revoke"?"retirar el VIP":selectedAction==="renew"?"renovar el VIP":"asignar VIP";
    if(!window.confirm("¿Confirmas "+verb+" "+(selectedAction==="revoke"?"a ":"por "+amount+" días a ")+target+"?"))return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/admin/vip",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({operationId:crypto.randomUUID(),action:selectedAction,recipient:target,days:amount,reason:reason.trim()})});
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"No se pudo actualizar el VIP.");
      setNotice(selectedAction==="revoke"?"VIP retirado correctamente.":"VIP actualizado correctamente.");
      setRecipient("");setReason("");await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo actualizar el VIP.");}
    finally{setBusy(false);}
  };
  const date=(value:number|null)=>value?new Date(value).toLocaleString("es-CO"):"Sin VIP";
  const active=(value:number|null)=>value!==null&&value>Date.now();
  return <section className="space-y-5">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase text-white/55">VIP activos</p><p className="mt-2 text-2xl font-bold text-cyan-200">{stats.active}</p></div>
      <div className="rounded border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase text-white/55">Vencen en 7 días</p><p className="mt-2 text-2xl font-bold text-amber-200">{stats.expiring_soon}</p></div>
    </div>
    <form className="space-y-3 rounded border border-white/10 bg-white/[0.03] p-4" onSubmit={e=>{e.preventDefault();void submit();}}>
      <h3 className="text-xs uppercase tracking-wider text-cyan-200">Gestión manual de VIP</h3>
      <label className="block text-xs text-white/65">Jugador (ID, correo o nombre)<input required value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="plt_xxxx · correo · nombre" className={"mt-1 "+fieldClass}/></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs text-white/65">Operación<select value={action} onChange={e=>setAction(e.target.value as typeof action)} className={"mt-1 "+fieldClass}><option value="grant">Asignar VIP</option><option value="renew">Renovar VIP</option><option value="revoke">Retirar VIP</option></select></label>
        {action!=="revoke"?<label className="block text-xs text-white/65">Duración<select value={days} onChange={e=>setDays(e.target.value)} className={"mt-1 "+fieldClass}><option value="7">7 días</option><option value="30">30 días</option><option value="90">90 días</option><option value="180">180 días</option><option value="365">365 días</option></select></label>:null}
      </div>
      <label className="block text-xs text-white/65">Motivo obligatorio<textarea required minLength={5} maxLength={240} rows={2} value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-cyan-400/40"/></label>
      <button disabled={busy||!recipient.trim()||reason.trim().length<5} className="rounded bg-amber-400 px-4 py-2 text-sm font-bold text-black disabled:opacity-40">{busy?"Procesando...":action==="revoke"?"Retirar VIP":action==="renew"?"Renovar VIP":"Asignar VIP"}</button>
      {error?<p role="alert" className="text-sm text-rose-300">{error}</p>:null}{notice?<p role="status" className="text-sm text-emerald-300">{notice}</p>:null}
    </form>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-xs uppercase tracking-wider text-white/70">Jugadores y vencimientos</h3><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void load();}} placeholder="Buscar jugador" className="ml-auto h-9 min-w-0 rounded border border-white/10 bg-black/40 px-3 text-xs text-white"/><button type="button" onClick={()=>void load()} className="rounded border border-white/15 px-3 py-2 text-xs text-white/70">Buscar</button></div>
      <div className="overflow-x-auto rounded border border-white/10"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-white/[0.03] text-white/55"><tr>{["Jugador","Correo","Estado","Vencimiento","Acción"].map(x=><th key={x} className="px-3 py-2 font-normal">{x}</th>)}</tr></thead><tbody>
        {players.map(p=><tr key={p.pilot_id} className="border-t border-white/5 text-white/70"><td className="px-3 py-2">{p.callsign}<br/><span className="text-white/35">{p.pilot_id}</span></td><td className="px-3 py-2">{p.email??"—"}</td><td className="px-3 py-2">{active(p.vip_until)?"VIP activo":"Sin VIP"}</td><td className="px-3 py-2">{date(p.vip_until)}</td><td className="px-3 py-2"><button type="button" disabled={busy||!active(p.vip_until)} onClick={()=>{setAction("revoke");setRecipient(p.pilot_id);setReason("Retiro administrativo de VIP");}} className="text-rose-300 disabled:opacity-30">Retirar VIP</button></td></tr>)}
      </tbody></table>{loading?<p className="p-4 text-center text-xs text-white/40">Cargando...</p>:!players.length?<p className="p-4 text-center text-xs text-white/40">No hay jugadores para mostrar.</p>:null}</div>
    </div>
    <div className="space-y-3"><h3 className="text-xs uppercase tracking-wider text-white/70">Historial VIP</h3><div className="overflow-x-auto rounded border border-white/10"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-white/[0.03] text-white/55"><tr>{["Fecha","Jugador","Operación","Días","Vencimiento anterior","Nuevo vencimiento","Motivo","Admin"].map(x=><th key={x} className="px-3 py-2 font-normal">{x}</th>)}</tr></thead><tbody>
      {logs.map(log=><tr key={log.id} className="border-t border-white/5 text-white/70"><td className="px-3 py-2">{new Date(log.created_at).toLocaleString("es-CO")}</td><td className="px-3 py-2">{log.callsign}<br/><span className="text-white/35">{log.email??log.pilot_id}</span></td><td className="px-3 py-2">{log.action}</td><td className="px-3 py-2">{log.days}</td><td className="px-3 py-2">{date(log.before_until)}</td><td className="px-3 py-2">{date(log.after_until)}</td><td className="max-w-[180px] whitespace-normal px-3 py-2">{log.reason}</td><td className="px-3 py-2">{log.admin_email}</td></tr>)}
    </tbody></table>{!logs.length?<p className="p-4 text-center text-xs text-white/40">Todavía no hay operaciones registradas.</p>:null}</div></div>
    <p className="text-xs text-white/40">La compra de VIP con OBS permanece deshabilitada.</p>
  </section>;
}
