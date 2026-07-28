import { createClient } from "@supabase/supabase-js";
const sb = createClient("https://mcfsxksusaxzyvcslvnk.supabase.co","sb_publishable_any7wERvyFmaxX_No9_j3A_Er2ER9en");
for(const id of ["PAT-012","PAT-008","PAT-010","PAT-011","PAT-009","PAT-007"]){
const {data}=await sb.from("flat_view_all_results").select("test_name,result_value,flag").eq("patient_id",id);
console.log("\n##",id,data?.filter(r=>["high","low","abnormal"].includes((r.flag??"").toLowerCase())).map(r=>`${r.test_name}:${r.flag}`).join(", "));}
