import { createClient } from "@supabase/supabase-js";
const sb = createClient("https://mcfsxksusaxzyvcslvnk.supabase.co","sb_publishable_any7wERvyFmaxX_No9_j3A_Er2ER9en");
const {data:pats}=await sb.from("patients").select("patient_id,first_name,last_name,gender,sex,notes").order("patient_id");
console.log(JSON.stringify(pats,null,1).slice(0,4000));
for(const id of ["PAT-013","PAT-006","PAT-015"]){
 const {data}=await sb.from("flat_view_all_results").select("test_name,result_value,unit,flag,optimal_low,optimal_high,range_low,range_high").eq("patient_id",id);
 console.log("\n##",id, data?.length);
 console.log(data?.map(r=>`${r.test_name}=${r.result_value}${r.unit??""} flag=${r.flag} opt[${r.optimal_low},${r.optimal_high}] ref[${r.range_low},${r.range_high}]`).join("\n"));
}
