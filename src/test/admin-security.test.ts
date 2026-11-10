import { describe, expect, it } from "vitest";
import server from "@/server";

const ADMIN_EMAIL="emprendedora.onlinevee@gmail.com";
function database(){
  const queries:string[]=[];
  const db={
    prepare(query:string){
      return {
        bind(..._values:unknown[]){return this;},
        async run(){queries.push(query);return {meta:{changes:1}};},
        async first(){
          if(query.includes("FROM auth_sessions"))return {wallet_address:"google:admin-sub",expires_at:Date.now()+60_000};
          if(query.includes("FROM player_accounts")&&query.includes("google_sub"))return {google_sub:"admin-sub",email:ADMIN_EMAIL,pilot_id:"plt_admin"};
          if(query.includes("FROM admin_sessions"))return {token_hash:"valid-admin-session",google_sub:"admin-sub"};
          return null;
        },
        async all(){
          if(query.includes("FROM admin_access_logs"))return {results:[{id:"access-1",event:"login",result:"success",ip_hash:"hashed-ip",admin_email:ADMIN_EMAIL,created_at:Date.now()},{id:"access-2",event:"login",result:"failed",ip_hash:"hashed-ip",admin_email:ADMIN_EMAIL,created_at:Date.now()},{id:"access-3",event:"login",result:"blocked",ip_hash:"hashed-ip",admin_email:ADMIN_EMAIL,created_at:Date.now()}]};
          if(query.includes("FROM admin_login_attempts"))return {results:[{ip_hash:"hashed-ip",attempts:2,window_started_at:Date.now(),blocked_until:0}]};
          if(query.includes("FROM admin_server_errors"))return {results:[{id:"error-1",route:"/api/test",error_message:"Test error",created_at:Date.now()}]};
          if(query.includes("FROM admin_economy_logs"))return {results:[{id:"op-1",pilot_id:"plt_player",category:"economy",action:"OBS",reason:"Test audit",admin_email:ADMIN_EMAIL,created_at:Date.now()}]};
          return {results:[]};
        },
      };
    },
  };
  return {db,queries};
}
function request(authenticated=true,secondFactor=true){
  return new Request("https://game.example/api/admin/security",{
    headers:authenticated?{cookie:"__Host-ss_session=admin"+(secondFactor?"; __Host-ss_admin=admin-panel":"")}: {},
  });
}
describe("administrative security and audit",()=>{
  it("rejects anonymous access",async()=>{
    const mock=database();
    const response=await server.fetch(request(false),{DB:mock.db} as never);
    expect(response.status).toBe(401);
  });
  it("requires the second administrative session",async()=>{
    const mock=database();
    const response=await server.fetch(request(true,false),{DB:mock.db} as never);
    expect(response.status).toBe(403);
  });
  it("returns access, failed attempts, incidents and operation history",async()=>{
    const mock=database();
    const response=await server.fetch(request(),{DB:mock.db} as never);
    const payload=await response.json() as {access:unknown[];attempts:unknown[];errors:unknown[];operations:unknown[];summary:{failedLogins:number}};
    expect(response.status).toBe(200);
    expect(payload.access).toHaveLength(3);
    expect(payload.attempts).toHaveLength(1);
    expect(payload.errors).toHaveLength(1);
    expect(payload.operations).toHaveLength(1);
    expect(payload.summary.failedLogins).toBe(2);
  });
  it("does not return access information to a non-admin account",async()=>{
    const mock=database();
    const original=mock.db.prepare;
    mock.db.prepare=(query:string)=>{
      const statement=original(query);
      if(query.includes("FROM player_accounts")&&query.includes("google_sub")){
        return {...statement,async first(){return {google_sub:"admin-sub",email:"player@example.com",pilot_id:"plt_player"};}};
      }
      return statement;
    };
    const response=await server.fetch(request(),{DB:mock.db} as never);
    expect(response.status).toBe(403);
  });
});
