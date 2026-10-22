import test from 'node:test';
import assert from 'node:assert/strict';
import {extract,validate,triage,guardian,plan,draftReferral} from '../dist/engine.js';
const b={id:'demo',name:'Demo Person',code:'DEMO',category:'pregnant'};
const base={beneficiary_id:'demo',category:'pregnant',bp_systolic:null,bp_diastolic:null,symptoms:[]};
const cases=[
 ['pregnancy at systolic threshold',{...base,bp_systolic:140,bp_diastolic:80},'PREG-BP'],
 ['pregnancy at diastolic threshold',{...base,bp_systolic:120,bp_diastolic:90},'PREG-BP'],
 ['pregnancy just below threshold',{...base,bp_systolic:139,bp_diastolic:89},null],
 ['pregnancy bleeding',{...base,symptoms:['bleeding']},'PREG-DANGER'],
 ['pregnancy convulsions',{...base,symptoms:['convulsions']},'PREG-DANGER'],
 ['pregnancy severe headache',{...base,symptoms:['severe_headache']},'PREG-DANGER'],
 ['pregnancy vision change',{...base,symptoms:['blurred_vision']},'PREG-DANGER'],
 ['pregnancy reduced movement',{...base,symptoms:['reduced_fetal_movement']},'PREG-DANGER'],
 ['pregnancy missing measurements',base,null],
 ['child MUAC low',{...base,category:'child',age_months:28,muac_cm:11.2},'CHILD-MUAC'],
 ['MUAC at threshold',{...base,category:'child',age_months:28,muac_cm:11.5},null],
 ['MUAC above threshold',{...base,category:'child',age_months:28,muac_cm:12},null],
 ['MUAC lower age boundary',{...base,category:'child',age_months:6,muac_cm:11},'CHILD-MUAC'],
 ['MUAC upper age boundary',{...base,category:'child',age_months:59,muac_cm:11},'CHILD-MUAC'],
 ['MUAC infant excluded',{...base,category:'infant',age_months:5,muac_cm:11},null],
 ['MUAC older child excluded',{...base,category:'child',age_months:60,muac_cm:11},null],
 ['MUAC absent',{...base,category:'child',age_months:28,muac_cm:null},null],
 ['MUAC unknown age',{...base,category:'child',age_months:null,muac_cm:11},null],
 ['cough two weeks',{...base,category:'tb',cough_days:14},'TB-COUGH'],
 ['cough below threshold',{...base,category:'tb',cough_days:13},null],
 ['cough prolonged',{...base,category:'ncd',cough_days:30},'TB-COUGH'],
 ['adult high systolic',{...base,category:'ncd',bp_systolic:140,bp_diastolic:80},'ADULT-BP'],
 ['adult high diastolic',{...base,category:'ncd',bp_systolic:120,bp_diastolic:90},'ADULT-BP'],
 ['adult normal',{...base,category:'ncd',bp_systolic:120,bp_diastolic:80},null],
 ['adult very high',{...base,category:'ncd',bp_systolic:180,bp_diastolic:120},'ADULT-BP'],
 ['do not apply adult BP rule to child',{...base,category:'child',bp_systolic:150,bp_diastolic:90},null],
 ['pregnancy no symptoms',{...base,bp_systolic:110,bp_diastolic:70},null],
 ['child missing age',{...base,category:'child',muac_cm:10},null],
 ['pregnancy headache alone',{...base,symptoms:['headache']},null],
 ['healthy adult no measurements',{...base,category:'ncd'},null]
];
for(const [name,input,expected] of cases)test(name,()=>{const flags=guardian(triage(input));if(expected)assert.ok(flags.some(f=>f.rule_id===expected));else assert.equal(flags.length,0);});
test('English extraction',()=>{const {record:r}=extract('7 months pregnant. BP 150 by 100. Headache and swelling.',b);assert.equal(r.bp_systolic,150);assert.equal(r.bp_diastolic,100);assert.equal(r.gestation_months,7);assert.deepEqual(r.symptoms,['headache','swelling']);});
test('Hindi extraction and Devanagari numerals',()=>{const {record:r}=extract('७ महीने की गर्भवती। बीपी १५० बाय १००। सिर दर्द और सूजन।',b);assert.equal(r.bp_systolic,150);assert.equal(r.gestation_months,7);assert.ok(r.symptoms.includes('headache'));});
test('missing BP triggers clarification',()=>assert.match(extract('Routine visit',b).question,/blood pressure/));
test('English negative symptom',()=>assert.deepEqual(extract('No bleeding. Denies headache.',b).record.symptoms,[]));
test('Hindi negative symptom',()=>assert.deepEqual(extract('रक्तस्राव नहीं।',b).record.symptoms,[]));
test('cough duration in weeks',()=>assert.equal(extract('Cough for 3 weeks',b).record.cough_days,21));
test('duration before cough',()=>assert.equal(extract('14 days of cough',b).record.cough_days,14));
test('invalid BP rejected',()=>assert.ok(validate({...base,bp_systolic:100,bp_diastolic:150}).length));
test('partial BP rejected',()=>assert.ok(validate({...base,bp_systolic:150}).length));
test('invalid MUAC rejected',()=>assert.ok(validate({...base,muac_cm:0}).length));
test('nonfinite measurement rejected',()=>assert.ok(validate({...base,cough_days:NaN}).length));
test('missing values not invented',()=>assert.deepEqual(validate(base),[]));
test('Guardian blocks unknown rule',()=>assert.throws(()=>guardian([{rule_id:'invented',reason:'test',action:'test'}])));
test('Guardian blocks dosing',()=>assert.throws(()=>guardian([{rule_id:'PREG-BP',reason:'test',action:'Give 10 mg'}])));
test('urgent workflow creates immediate review and follow-up',()=>{const r={...base,bp_systolic:150,bp_diastolic:100},flags=triage(r);assert.equal(plan(r,flags).length,2);assert.match(draftReferral(b,r,flags),/REFERRAL DRAFT/);assert.match(draftReferral(b,r,flags),/Not recorded/);});
test('normal visit does not invent schedule',()=>assert.deepEqual(plan(base,[]),[]));
