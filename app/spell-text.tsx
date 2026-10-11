'use client';
import translations from '@/lib/spells-he.json';
import {useLanguage} from './language';
type SpellText={id:string;name:string;description:string;higher:string};
const hebrew=translations as Record<string,{name:string;summary:string;higher?:string;material?:string}>;
export function spellLabel(spell:{id:string;name:string},language:string){return language==='he'&&hebrew[spell.id]?`${hebrew[spell.id].name} · ${spell.name}`:spell.name;}
export function matchesSpell(spell:{id:string;name:string},query:string){const q=query.trim().normalize('NFKC').toLocaleLowerCase();return `${spell.name} ${hebrew[spell.id]?.name||''}`.normalize('NFKC').toLocaleLowerCase().includes(q);}
export function SpellName({spell}:{spell:{id:string;name:string}}){const {language}=useLanguage();return language==='he'&&hebrew[spell.id]?<span className="bilingual-spell"><span lang="he">{hebrew[spell.id].name}</span><bdi className="english-spell" lang="en">{spell.name}</bdi></span>:<bdi lang="en">{spell.name}</bdi>;}
function Original({spell}:{spell:SpellText}){return <div className="spell-description original-spell" dir="ltr" lang="en" data-localize="false">{spell.description.split('\n\n').map((p,i)=><p key={i}>{p}</p>)}{spell.higher&&<><h3>At higher levels</h3><p>{spell.higher}</p></>}</div>;}
export function SpellExplanation({spell}:{spell:SpellText}){const {language}=useLanguage();const entry=hebrew[spell.id];return language==='he'&&entry?<><div className="spell-description hebrew-spell" lang="he" dir="rtl"><h3>הסבר קצר בעברית</h3><p>{entry.summary}</p>{entry.higher&&<><h3>הטלה ביחידה גבוהה יותר</h3><p>{entry.higher}</p></>}</div><details className="spell-original"><summary>הנוסח המלא באנגלית</summary><Original spell={spell}/></details></>:<Original spell={spell}/>;}

export function spellMaterial(spell:{id:string;material:string},language:string){return language==='he'?hebrew[spell.id]?.material||spell.material:spell.material;}
