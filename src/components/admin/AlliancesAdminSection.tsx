import { useCallback, useEffect, useState } from "react";

type Alliance = {
  alliance_id: string; name: string; tag: string; leader_pilot_id: string; leader_name: string;
  level: number; war_wins: number; war_losses: number; member_count: number; in_war: number; has_war_history: number;
};
type Member = { alliance_id: string; pilot_id: string; role: string; callsign: string; email: string|null; joined_at: number };
type War = {
  war_id: string; status: string; attacker_name: string; attacker_tag: string;
  defender_name: string; defender_tag: string; winner_alliance_id: string|null;
  created_at: number; started_at: number|null; ended_at: number|null;
  attacker_hordes_survived: number; defender_hordes_survived: number; member_count: number;
};
type Log = { id:string; action:string; reason:string; admin_email:string; created_at:number; target_pilot_id:string|null };
type Payload = { alliances:Alliance[]; members:Member[]; wars:War[]; logs:Log[]; error?:string };
const inputClass="h-10 rounded border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-cyan-400/40";
const dateLabel=(n:number)=>new Date(n).toLocaleString("es-CO");

export function AlliancesAdminSection() {
  const [data,setData]=useState<Payload|null>(null);
  const [selected,setSelected]=useState("");
  const [reason,setReason]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [filter,setFilter]=useState("");

  const load=useCallback(async (allianceId=selected)=>{
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/admin/alliances"+(allianceId?"?alliance_id="+encodeURIComponent(allianceId):""),{credentials:"same-origin",cache:"no-store"});
      const payload=(await response.json()) as Payload;
      if(!response.ok) throw new Error(payload.error||"No se pudo cargar la información.");
      setData(payload);
      if(allianceId && !payload.alliances.some(a=>a.alliance_id===allianceId)) setSelected("");
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo cargar la información.");}
    finally{setLoading(false);}
  },[selected]);

  useEffect(()=>{void load("");},[]);

  const send=async(body:Record<string,unknown>)=>{
    const response=await fetch("/api/admin/alliances",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const payload=(await response.json()) as {error?:string;status?:string};
    if(!response.ok) throw new Error(payload.error||"No se pudo completar la operación.");
    return payload;
  };
  const act=async(body:Record<string,unknown>,confirmation:string)=>{
    if(!reason.trim()||reason.trim().length<5){setError("Escribe el motivo de la operación (mínimo 5 caracteres).");return;}
    if(!window.confirm(confirmation))return;
    setBusy(true);setError("");setNotice("");
    try{await send({...body,reason:reason.trim()});setNotice("Operación realizada y registrada.");await load(selected);}
    catch(cause){setError(cause instanceof Error?cause.message:"No se pudo completar la operación.");}
    finally{setBusy(false);}
  };
  const alliance=data?.alliances.find(a=>a.alliance_id===selected);
  const filtered=(data?.alliances??[]).filter(a=>(a.name+" "+a.tag+" "+a.leader_name).toLowerCase().includes(filter.toLowerCase()));

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        ["Alianzas registradas",data?.alliances.length??0],
        ["Guerras pendientes o activas",(data?.wars??[]).filter(w=>["DECLARED","PREPARING","ACTIVE"].includes(w.status)).length],
        ["Guerras completadas",(data?.wars??[]).filter(w=>w.status==="COMPLETED").length],
      ].map(([label,value])=><div key={label} className="rounded border border-white/10 bg-white/[0.03] p-3"><p className="text-xs uppercase tracking-wider text-white/55">{label}</p><p className="mt-2 font-arcade text-lg text-cyan-200">{loading?"…":value}</p></div>)}
    </div>
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-wider text-cyan-200">Alianzas y miembros</h3>
      <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Buscar por nombre, tag o líder" className={inputClass+" w-full"}/>
      <div className="overflow-x-auto rounded border border-white/10">
        <table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-white/[0.03] text-white/55"><tr>{["Alianza","Líder","Miembros","Nivel","Victorias/Derrotas","Estado","Acciones"].map(x=><th key={x} className="px-3 py-2 font-normal">{x}</th>)}</tr></thead>
          <tbody>{filtered.map(a=><tr key={a.alliance_id} className="border-t border-white/5 text-white/75">
            <td className="px-3 py-3"><strong>[{a.tag}] {a.name}</strong><p className="text-white/40">{a.alliance_id}</p></td><td className="px-3 py-3">{a.leader_name}</td><td className="px-3 py-3">{a.member_count}</td><td className="px-3 py-3">{a.level}</td><td className="px-3 py-3">{a.war_wins}/{a.war_losses}</td><td className="px-3 py-3">{a.in_war?"En guerra":"Libre"}</td>
            <td className="px-3 py-3"><button type="button" onClick={()=>{setSelected(a.alliance_id);void load(a.alliance_id);}} className="text-cyan-200">Ver miembros</button></td>
          </tr>)}</tbody>
        </table>
        {!loading&&!filtered.length?<p className="p-4 text-center text-xs text-white/45">No hay alianzas para mostrar.</p>:null}
      </div>
    </section>
    {alliance?<section className="space-y-3 rounded border border-white/10 bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs uppercase tracking-wider text-cyan-200">Miembros de [{alliance.tag}] {alliance.name}</h3><button type="button" onClick={()=>setSelected("")} className="text-xs text-white/55">Cerrar detalle</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-white/50"><tr>{["Piloto","Correo","Rol","Ingreso","Acciones"].map(x=><th key={x} className="px-2 py-2 font-normal">{x}</th>)}</tr></thead><tbody>
        {(data?.members??[]).map(m=><tr key={m.pilot_id} className="border-t border-white/5 text-white/75"><td className="px-2 py-2">{m.callsign}<p className="text-white/40">{m.pilot_id}</p></td><td className="px-2 py-2">{m.email??"—"}</td><td className="px-2 py-2">{m.role}</td><td className="px-2 py-2">{dateLabel(m.joined_at)}</td><td className="px-2 py-2"><div className="flex flex-wrap gap-2">
          {m.role!=="lider"?<><button type="button" disabled={busy} onClick={()=>void act({action:"set-role",allianceId:alliance.alliance_id,pilotId:m.pilot_id,role:m.role==="teniente"?"miembro":"teniente"},"¿Cambiar el rol de este miembro?")} className="text-cyan-200">{m.role==="teniente"?"Hacer miembro":"Hacer teniente"}</button><button type="button" disabled={busy} onClick={()=>void act({action:"transfer-leader",allianceId:alliance.alliance_id,pilotId:m.pilot_id},"¿Transferir el liderazgo a este piloto?")} className="text-amber-200">Transferir liderazgo</button><button type="button" disabled={busy} onClick={()=>void act({action:"remove-member",allianceId:alliance.alliance_id,pilotId:m.pilot_id},"¿Retirar este miembro de la alianza?")} className="text-rose-300">Retirar</button></>:<span className="text-white/40">Líder actual</span>}
        </div></td></tr>)}
      </tbody></table></div>
      <label className="block text-xs text-white/65">Motivo obligatorio para la siguiente operación<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={240} placeholder="Explica por qué realizas el cambio" className={inputClass+" mt-1 w-full"}/></label>
      <button type="button" disabled={busy||Boolean(alliance.in_war)||Boolean(alliance.has_war_history)} onClick={()=>void act({action:"dissolve",allianceId:alliance.alliance_id},"¿Disolver esta alianza? Esta acción no se puede deshacer.")} className="rounded border border-rose-400/30 px-3 py-2 text-xs text-rose-300 disabled:opacity-40">Disolver alianza</button>
      {alliance.has_war_history?<p className="text-xs text-white/45">Esta alianza conserva un historial de guerras y no se puede eliminar.</p>:alliance.in_war?<p className="text-xs text-white/45">No se puede disolver mientras tenga una guerra pendiente o activa.</p>:null}
    </section>:null}
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-wider text-cyan-200">Guerras e historial</h3>
      <div className="overflow-x-auto rounded border border-white/10"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-white/[0.03] text-white/55"><tr>{["Alianzas","Estado","Participantes","Hordas sobrevividas","Ganador","Fecha","Acciones"].map(x=><th key={x} className="px-3 py-2 font-normal">{x}</th>)}</tr></thead><tbody>
        {(data?.wars??[]).map(w=><tr key={w.war_id} className="border-t border-white/5 text-white/70"><td className="px-3 py-3">[{w.attacker_tag}] {w.attacker_name}<p className="text-white/40">vs [{w.defender_tag}] {w.defender_name}</p><p className="text-white/35">{w.war_id}</p></td><td className="px-3 py-3">{w.status}</td><td className="px-3 py-3">{w.member_count}</td><td className="px-3 py-3">{w.attacker_hordes_survived} / {w.defender_hordes_survived}</td><td className="px-3 py-3">{w.winner_alliance_id??"—"}</td><td className="px-3 py-3">{dateLabel(w.created_at)}</td><td className="px-3 py-3"><div className="flex gap-2">{w.status==="DECLARED"?<button type="button" disabled={busy} onClick={()=>void act({action:"reject-war",warId:w.war_id},"¿Rechazar esta declaración de guerra?")} className="text-amber-200">Rechazar</button>:null}{["DECLARED","PREPARING"].includes(w.status)?<button type="button" disabled={busy} onClick={()=>void act({action:"cancel-war",warId:w.war_id},"¿Cancelar esta guerra pendiente?")} className="text-rose-300">Cancelar</button>:null}</div></td></tr>)}
      </tbody></table>{!loading&&!data?.wars.length?<p className="p-4 text-center text-xs text-white/45">No hay guerras registradas.</p>:null}</div>
    </section>
    <section className="space-y-2"><h3 className="text-xs uppercase tracking-wider text-cyan-200">Auditoría de alianzas</h3><div className="overflow-hidden rounded border border-white/10">{(data?.logs??[]).map(l=><div key={l.id} className="flex flex-wrap justify-between gap-2 border-t border-white/5 px-3 py-2 text-xs text-white/65"><span>{l.action} · {l.reason}</span><span>{l.admin_email}</span><span>{dateLabel(l.created_at)}</span></div>)}{!loading&&!data?.logs.length?<p className="p-4 text-center text-xs text-white/45">Sin operaciones registradas.</p>:null}</div></section>
    {error?<p role="alert" className="text-sm text-rose-300">{error}</p>:null}{notice?<p role="status" className="text-sm text-emerald-300">{notice}</p>:null}
    <div className="flex justify-end"><button type="button" onClick={()=>void load(selected)} className="rounded border border-white/15 px-3 py-2 text-xs text-white/70">Actualizar datos</button></div>
  </div>;
}
