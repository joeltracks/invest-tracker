import type { Investment, InvestmentEvent, InvestmentInput } from '../types'
const DEMO_KEY='yieldwise-demo-investments-v1'
const now=new Date(), dateFrom=(months:number)=>{const d=new Date(now);d.setMonth(d.getMonth()-months);return d.toISOString().slice(0,10)}
const defaults={events:[],yieldBasis:'gross' as const,taxRate:0,status:'active' as const,statementValue:null,couponMonths:[]}
const demoSeed:Investment[]=[
 { ...defaults,id:'demo-mmf',provider:'Cedar Capital',name:'Cedar Money Market Fund',type:'MMF',principal:15000,currency:'USD',annualRate:5.2,startDate:dateFrom(5),maturityDate:null,frequency:'unknown',interestMode:'unknown',createdAt:now.toISOString(),events:[],yieldBasis:'gross',taxRate:0,status:'active',statementValue:null,couponMonths:[] },
 { ...defaults,id:'demo-bond',provider:'Northstar Treasury',name:'2028 Treasury Note',type:'Bond',principal:10000,currency:'USD',annualRate:6,startDate:dateFrom(8),maturityDate:new Date(new Date().setFullYear(now.getFullYear()+2)).toISOString().slice(0,10),frequency:'semiannual',interestMode:'paid_out',createdAt:now.toISOString(),events:[],yieldBasis:'gross',taxRate:0,status:'active',statementValue:null,couponMonths:[6,12] }
]
function normalize(raw: Investment[]): Investment[] { return raw.map(x=>({...defaults,...x,events:x.events??[],yieldBasis:x.yieldBasis??'gross',taxRate:x.taxRate??0,status:x.status??'active',statementValue:x.statementValue??null,couponMonths:x.couponMonths??[]})) }
export function loadInvestments():Investment[]{try{const raw=localStorage.getItem(DEMO_KEY);return raw?normalize(JSON.parse(raw) as Investment[]):demoSeed}catch{return demoSeed}}
function persist(items:Investment[]){localStorage.setItem(DEMO_KEY,JSON.stringify(items))}
export function saveInvestment(input:InvestmentInput,existingId?:string):Investment[]{const current=loadInvestments(),old=current.find(x=>x.id===existingId);const item:Investment={...input,events:old?.events??[],status:old?.status??'active',id:existingId??crypto.randomUUID(),createdAt:old?.createdAt??new Date().toISOString()};const next=existingId?current.map(x=>x.id===existingId?item:x):[item,...current];persist(next);return next}
export function deleteInvestment(id:string):Investment[]{const next=loadInvestments().filter(x=>x.id!==id);persist(next);return next}
export function restoreInvestment(item:Investment):Investment[]{const next=[item,...loadInvestments().filter(x=>x.id!==item.id)];persist(next);return next}
export function appendEvent(id:string,event:InvestmentEvent):Investment[]{const next=loadInvestments().map(x=>x.id===id?{...x,events:[...x.events,event]}:x);persist(next);return next}
export function setInvestmentStatus(id:string,status:Investment['status']):Investment[]{const next=loadInvestments().map(x=>x.id===id?{...x,status}:x);persist(next);return next}

