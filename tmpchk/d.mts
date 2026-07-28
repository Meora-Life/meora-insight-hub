import { createClient } from "@supabase/supabase-js";
const sb = createClient("https://mcfsxksusaxzyvcslvnk.supabase.co","sb_publishable_any7wERvyFmaxX_No9_j3A_Er2ER9en");
const r1=await sb.from("patients").select("*").order("patient_id");
console.log(r1.error);
console.log(JSON.stringify(r1.data,null,1).slice(0,5000));
for(const id of ["PAT-013","PAT-006"]){
 const {data,error}=await sb.from("flat_view_all_results").select("test_name,result_value,unit,flag,optimal_low,optimal_high").eq("patient_id",id);
 console.log("\n##",id,error, data?.length);
 console.log(data?.map(r=>`${r.test_name}=${r.result_value} flag=${r.flag} opt[${r.optimal_low},${r.optimal_high}]`).join("\n"));
}
