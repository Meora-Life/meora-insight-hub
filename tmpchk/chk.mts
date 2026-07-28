import { createClient } from "@supabase/supabase-js";
import { recommendedProtocols, latestPerTest, markerDirection } from "/dev-server/src/lib/meora";
const sb = createClient("https://mcfsxksusaxzyvcslvnk.supabase.co","sb_publishable_any7wERvyFmaxX_No9_j3A_Er2ER9en");
const { data: pats } = await sb.from("patients").select("*").order("patient_id");
let rows:any[]=[]; for(let i=0;i<6;i++){const {data}=await sb.from("flat_view_all_results").select("*").range(i*1000,i*1000+999); if(!data?.length)break; rows=rows.concat(data);}
console.log("rows",rows.length);
for(const p of pats??[]){
  const rs=rows.filter(r=>r.patient_id===p.patient_id);
  const off=latestPerTest(rs).filter(r=>markerDirection(r)||(r.flag??"").toLowerCase()==="abnormal");
  console.log("\n==",p.patient_id,p.first_name,p.last_name,"| results",rs.length,"| off",off.length);
  console.log("  off:",off.map(r=>`${r.test_name}(${markerDirection(r)??r.flag})`).join(", ").slice(0,400));
  console.log("  ->",recommendedProtocols(p as any,rs as any).map(x=>x.name).join(" | "));
}
