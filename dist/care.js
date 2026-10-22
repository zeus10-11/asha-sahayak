/** Transparent workflow helpers. These do not calculate clinical risk. */
export const REFERRAL_STAGES=['draft','contacted','acknowledged','assessed'];
export const REFERRAL_LABELS={draft:'Draft',contacted:'Contacted',acknowledged:'Acknowledged',assessed:'Assessment completed'};
export function buildDayPlan(state,today){
 const people=new Map(state.beneficiaries.map(b=>[b.id,b]));
 const urgent=new Set(state.flags.filter(f=>f.status==='open'&&f.severity==='urgent').map(f=>f.beneficiary_id));
 const entries=state.tasks.filter(t=>t.status==='pending'&&people.has(t.beneficiary_id)&&(t.due_date<=today||urgent.has(t.beneficiary_id))).map(t=>{
  const person=people.get(t.beneficiary_id),isUrgent=urgent.has(person.id),overdue=t.due_date<today;
  return {task:t,person,rank:isUrgent?0:overdue?1:2,reason:isUrgent?'Open urgent screening flag — review the case first':overdue?`Overdue since ${t.due_date}`:'Follow-up due today'};
 }).sort((a,b)=>a.rank-b.rank||String(a.person.ward).localeCompare(String(b.person.ward))||a.task.due_date.localeCompare(b.task.due_date)||a.task.id.localeCompare(b.task.id));
 const saved=state.settings.dayPlan;
 if(saved?.date===today&&Array.isArray(saved.order)){
  const order=new Map(saved.order.map((id,i)=>[id,i]));
  entries.sort((a,b)=>Number(a.rank!==0)-Number(b.rank!==0)||(order.get(a.task.id)??Infinity)-(order.get(b.task.id)??Infinity));
 }
 return entries;
}
export function advanceReferral(referral,note,confirmed,timestamp=new Date().toISOString()){
 const index=REFERRAL_STAGES.indexOf(referral.status||'draft');
 if(index<0||index===REFERRAL_STAGES.length-1)throw Error('No next referral stage is available.');
 if(!confirmed||String(note).trim().length<5)throw Error('Confirm the event and add a note of at least 5 characters.');
 const status=REFERRAL_STAGES[index+1];
 return {...referral,status,history:[...(referral.history||[]),{status,note:String(note).trim(),timestamp,actor:'Health worker'}]};
}
export function householdEvents(state,householdId){
 const ids=new Set(state.beneficiaries.filter(b=>b.household_id===householdId).map(b=>b.id));
 const events=[];
 for(const v of state.visits.filter(v=>ids.has(v.beneficiary_id)))events.push({kind:'Visit recorded',person:v.beneficiary_id,date:v.timestamp,text:v.transcript,action:'visit',id:v.id});
 for(const t of state.tasks.filter(t=>ids.has(t.beneficiary_id)))events.push({kind:t.status==='completed'?'Follow-up completed':'Follow-up planned',person:t.beneficiary_id,date:t.completed_at||`${t.due_date}T12:00:00`,text:t.type,action:t.status==='completed'?'person':'task',id:t.status==='completed'?t.beneficiary_id:t.id});
 for(const r of state.referrals.filter(r=>ids.has(r.beneficiary_id))){
  events.push({kind:'Referral drafted',person:r.beneficiary_id,date:r.timestamp,text:'ANM / PHC referral',action:'referral',id:r.id});
  for(const h of r.history||[])events.push({kind:REFERRAL_LABELS[h.status]||h.status,person:r.beneficiary_id,date:h.timestamp,text:h.note,action:'referral',id:r.id});
 }
 return events.sort((a,b)=>new Date(b.date)-new Date(a.date));
}
