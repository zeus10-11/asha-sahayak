// Deterministic demo agents. No remote LLM or clinical validation is implied.
export const RULE_VERSION = '0.1.0-unreviewed';
export const RULES = [
 {id:'PREG-BP',title:'Raised blood pressure in pregnancy',source:'https://www.nhm.gov.in/images/pdf/guidelines/nrhm-guidelines/stg/pregnancy-care.pdf',detail:'Systolic ≥140 OR diastolic ≥90 mmHg in pregnancy prompts clinical assessment.'},
 {id:'PREG-DANGER',title:'Pregnancy danger signs',source:'https://www.nhm.gov.in/images/pdf/guidelines/nrhm-guidelines/stg/pregnancy-care.pdf',detail:'Reported bleeding, severe headache, blurred vision, convulsions or reduced fetal movement prompt urgent contact.'},
 {id:'CHILD-MUAC',title:'Child nutrition screening',source:'https://www.who.int/tools/elena/interventions/sam-identification',detail:'MUAC <11.5 cm for children aged 6–59 months prompts referral for full assessment.'},
 {id:'TB-COUGH',title:'Persistent cough screening',source:'https://tbcindia.mohfw.gov.in/faqs/',detail:'Cough lasting ≥14 days prompts a TB screening referral; this is not a diagnosis.'},
 {id:'ADULT-BP',title:'Adult blood pressure screening',source:'https://www.who.int/news-room/fact-sheets/detail/hypertension',detail:'An elevated reading requires clinical review and repeat measurement. A single reading does not diagnose hypertension.'}
];
export const today = () => new Date().toLocaleDateString('en-CA');
export function dateKey(date = new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function addDays(n,base=new Date()){const d=new Date(base);d.setDate(d.getDate()+n);return dateKey(d);}
export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function number(text, pattern){const m=text.match(pattern);return m?Number(m[1]):null;}
export function extract(transcript, beneficiary){
 const text=transcript.replace(/[०-९]/g,c=>String(c.charCodeAt(0)-0x966)).toLowerCase();
 const bp=text.match(/(?:\bbp\b|blood pressure|बीपी|ब्लड प्रेशर)\s*(?:is|was|है|था|:)?\s*(\d{2,3})\s*(?:\/|over|by|पर|बाय)\s*(\d{2,3})/i);
 const symptoms=[];
 // Negations are deliberately conservative; worker reviews every proposed field.
 const patterns={headache:/headache|सिर\s*(?:में\s*)?दर्द/,severe_headache:/severe headache|तेज सिर दर्द/,swelling:/swelling|सूजन/,bleeding:/bleeding|रक्तस्राव/,blurred_vision:/blurred vision|धुंधला/,convulsions:/convulsions|seizure|दौरे/,reduced_fetal_movement:/reduced fetal movement|baby.*not moving|बच्चे की हलचल कम/,poor_feeding:/poor feeding|not feeding|दूध नहीं/,fever:/fever|बुखार/};
 for(const [key,re] of Object.entries(patterns)){const match=text.match(re);if(match){const before=text.slice(Math.max(0,match.index-24),match.index);const after=text.slice(match.index+match[0].length,match.index+match[0].length+15);if(!/(?:no|denies|without|not)\s+(?:any\s+)?$/.test(before)&&!/^\s*(?:नहीं|नही)/.test(after))symptoms.push(key);}}
 let cough_days=null;const cough=text.match(/(?:cough|खांसी|खाँसी)[^.।]{0,22}?(\d+)\s*(days?|weeks?|दिन|हफ्ते|सप्ताह)/)||text.match(/(\d+)\s*(days?|weeks?|दिन|हफ्ते|सप्ताह)[^.।]{0,22}?(?:cough|खांसी|खाँसी)/);if(cough)cough_days=Number(cough[1])*(/week|हफ्ते|सप्ताह/.test(cough[2])?7:1);
 const record={beneficiary_id:beneficiary.id,category:beneficiary.category,age_months:beneficiary.age_months??null,bp_systolic:bp?Number(bp[1]):null,bp_diastolic:bp?Number(bp[2]):null,muac_cm:number(text,/(?:muac|एमयूएसी)\s*(?:is|was|:)?\s*(\d+(?:\.\d+)?)/),gestation_months:number(text,/(\d+)\s*(?:months? pregnant|महीने की गर्भवती|माह की गर्भवती)/),cough_days,symptoms,notes:transcript.trim(),method:'deterministic-demo',confidence:{identity:'worker-selected',measurements:bp?'requires-confirmation':'not-detected',symptoms:'requires-confirmation'}};
 return {record,question:(beneficiary.category==='pregnant'||beneficiary.category==='ncd')&&!bp?'Was blood pressure measured? Enter the reading, or confirm it was not measured.':'Please confirm the beneficiary, measurements and symptoms before saving.'};
}
export function validate(record){
 const errors=[];const range=(field,min,max,label)=>{if(record[field]!==null&&record[field]!==''&&record[field]!==undefined&&(!Number.isFinite(Number(record[field]))||Number(record[field])<min||Number(record[field])>max))errors.push(`${label} must be between ${min} and ${max}.`);};
 range('bp_systolic',50,300,'Systolic BP');range('bp_diastolic',30,200,'Diastolic BP');range('muac_cm',5,40,'MUAC');range('gestation_months',1,10,'Gestation');range('cough_days',0,365,'Cough duration');
 if((record.bp_systolic==null)!==(record.bp_diastolic==null))errors.push('Enter both blood pressure values, or leave both blank.');
 if(record.bp_systolic!=null&&record.bp_diastolic!=null&&record.bp_systolic<=record.bp_diastolic)errors.push('Systolic BP must be greater than diastolic BP.');
 if(!record.beneficiary_id)errors.push('Select a beneficiary.');return errors;
}
export function triage(r){
 const flags=[];const add=(rule_id,severity,reason,action)=>flags.push({id:uid(),rule_id,rule_version:RULE_VERSION,severity,reason,action,status:'open'});
 const high=r.bp_systolic>=140||r.bp_diastolic>=90;
 const symptoms=r.symptoms||[];
 if(r.category==='pregnant'&&high)add('PREG-BP','urgent',`Blood pressure ${r.bp_systolic}/${r.bp_diastolic} mmHg is elevated during pregnancy.`,'Contact the ANM or PHC for assessment today.');
 if(r.category==='pregnant'&&symptoms.some(s=>['severe_headache','bleeding','blurred_vision','convulsions','reduced_fetal_movement'].includes(s)))add('PREG-DANGER','urgent',`Reported pregnancy danger sign: ${symptoms.filter(s=>['severe_headache','bleeding','blurred_vision','convulsions','reduced_fetal_movement'].includes(s)).map(s=>s.replaceAll('_',' ')).join(', ')}.`,'Contact the ANM or PHC immediately; follow the local emergency protocol.');
 if(['child','infant'].includes(r.category)&&r.age_months>=6&&r.age_months<=59&&r.muac_cm!=null&&r.muac_cm<11.5)add('CHILD-MUAC','urgent',`MUAC ${r.muac_cm} cm is below the screening threshold for age ${r.age_months} months.`,'Contact the ANM or PHC for a full nutrition assessment.');
 if(r.cough_days>=14)add('TB-COUGH','watch',`Cough reported for ${r.cough_days} days.`,'Arrange assessment at the PHC for TB screening.');
 if(r.category!=='pregnant'&&!['child','infant'].includes(r.category)&&high)add('ADULT-BP',r.bp_systolic>=180||r.bp_diastolic>=120?'urgent':'watch',`Elevated blood pressure reading: ${r.bp_systolic}/${r.bp_diastolic} mmHg.` ,r.bp_systolic>=180||r.bp_diastolic>=120?'Contact the ANM or PHC immediately for assessment.':'Arrange repeat measurement and clinical review with the ANM or PHC.');
 return flags;
}
export function guardian(flags){for(const f of flags){if(!RULES.some(r=>r.id===f.rule_id)||!f.reason||!f.action||/diagnosed|prescribe|\d+\s*mg\b/i.test(f.action))throw new Error('Guardian blocked an unsupported clinical output.');}return flags;}
export function plan(record,flags){if(!flags.length)return [];const urgent=flags.some(f=>f.severity==='urgent');return [{id:uid(),beneficiary_id:record.beneficiary_id,type:urgent?'Confirm PHC assessment':'Arrange clinical review',due_date:addDays(urgent?0:1),status:'pending',source:'Care Planner',rule_version:RULE_VERSION},...(urgent?[{id:uid(),beneficiary_id:record.beneficiary_id,type:'Follow-up after referral',due_date:addDays(1),status:'pending',source:'Care Planner',rule_version:RULE_VERSION}]:[])];}
export function draftReferral(beneficiary,record,flags){return `REFERRAL DRAFT · For ANM / PHC\nBeneficiary: ${beneficiary.name} (${beneficiary.code})\nCategory: ${beneficiary.category}\nDate: ${dateKey()}\n${record.bp_systolic?`BP: ${record.bp_systolic}/${record.bp_diastolic} mmHg\n`:''}${record.muac_cm?`MUAC: ${record.muac_cm} cm\n`:''}Reported symptoms: ${(record.symptoms||[]).join(', ').replaceAll('_',' ')||'None recorded'}\nReason for referral: ${flags.map(f=>f.reason).join(' ')}\nRequested action: ${flags.map(f=>f.action).join(' ')}\nAdvice already given: ${record.advice||'Not recorded; confirm with the health worker.'}\nDecision support only. Clinical assessment required.`;}
