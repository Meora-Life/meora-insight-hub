import { createClient } from "@supabase/supabase-js";
const sb = createClient("https://mcfsxksusaxzyvcslvnk.supabase.co","sb_publishable_any7wERvyFmaxX_No9_j3A_Er2ER9en");
const {data}=await sb.from("flat_view_all_results").select("test_name,result_value,unit,flag,optimal_low,optimal_high").eq("patient_id","PAT-015");
console.log(data?.map(r=>`${r.test_name}=${r.result_value} flag=${r.flag} opt[${r.optimal_low},${r.optimal_high}]`).join("\n"));
