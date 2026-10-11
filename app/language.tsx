'use client';
import {createContext,useContext,useEffect,useState,ReactNode,isValidElement,cloneElement,ReactElement} from 'react';
import he from '@/lib/he.json';
type Language='en'|'he';
const Context=createContext<{language:Language;setLanguage:(l:Language)=>void}>({language:'he',setLanguage:()=>{}});
const words=he as Record<string,string>;
export function translate(text:string,language:Language):string{
 if(language==='en')return text;
 const key=text.trim();if(words[key])return text.replace(key,words[key]);
 if(key.startsWith('After a qualifying 8-hour rest,'))return `לאחר מנוחה ארוכה של 8 שעות, מתחדשות כל נקודות הפגיעה ויחידות הלחש, וכן ${key.includes('Bardic Inspiration')?'השראה פייטנית':'זעם הסערה, תיעול אלוהות וסיבולת האבן'}. מתחדשת מחצית מקוביות הפגיעה (בעיגול מטה, לפחות אחת). ניתן ליהנות מכך פעם ב־24 שעות בלבד, ונדרשת לפחות נקודת פגיעה אחת בתחילת המנוחה.`;
 if(key.startsWith('After at least 1 hour,'))return `אחרי מנוחה של שעה לפחות, ${key.includes('does not recharge')?'השראה פייטנית עדיין אינה מתחדשת. שיר מנוחה מוסיף ריפוי כשמנצלים קוביות פגיעה':key.includes('Bardic Inspiration')?'השראה פייטנית מתחדשת':'תיעול אלוהות וסיבולת האבן מתחדשים'}. אפשר לנצל קוביות פגיעה ק8 לריפוי; יש להזין את סכום הגלגולים.`;
 const patterns:[RegExp,(...s:string[])=>string][]=[
 [/^(\d+) feet$/,(_,n)=>`${n} רגל`],[/^Up to (\d+) minute(?:s)?$/,(_,n)=>`עד ${n} דקות`],
 [/^You only have (\d+) (\w+) in this currency\.$/,(_,n,k)=>`יש לך רק ${n} ${k} בסוג המטבע הזה.`],
 [/^Purchase recorded in (.+)\. Paid (\d+) (\w+); received (.+) change\. Click Save to confirm\.$/,(_,n,a,k,c)=>`הרכישה נרשמה ב־${n}. שולמו ${a} ${k}; העודף: ${c}. יש ללחוץ על שמירה לאישור.`],
 [/^Level (\d+)$/i,(_,n)=>`דרגה ${n}`],[/^Apply (cleric|bard) level (\d+)$/,(_,c,n)=>`החלת דרגה ${n} ל${c==='cleric'?'כוהן':'פייטן'}`],
 [/^Level (\d+) slot (\d+): (spent|available)$/,(_,n,s,v)=>`יחידת לחש בדרגה ${n}, מספר ${s}: ${v==='spent'?'נוצלה':'זמינה'}`],
 [/^Level (\d+) · (\d+) available$/,(_,n,v)=>`דרגה ${n} · ${v} זמינות`],
 [/^(.*) saved at level (\d+)\.$/,(_,n,l)=>`${n} נשמר בדרגה ${l}.`],
 [/^(.*) score$/,(_,n)=>`${words[n]||n} — ערך`],[/^(.*) saving throw proficiency$/,(_,n)=>`שליטה בהצלת ${words[n]||n}`],[/^(.*) proficiency$/,(_,n)=>`שליטה ב${words[n]||n}`],[/^(.*) Expertise$/,(_,n)=>`מומחיות ב${words[n]||n}`],
 [/^(Know|Prepare) (.+)$/,(_,v,n)=>`${v==='Know'?'לימוד':'הכנה'} ${n}`],
 [/^(Copper|Silver|Electrum|Gold|Platinum) \((cp|sp|ep|gp|pp)\) balance$/,(_,n,k)=>`יתרת ${words[n]||n} (${k})`],
 [/^(Copper|Silver|Electrum|Gold|Platinum) \((cp|sp|ep|gp|pp)\)$/,(_,n,k)=>`${words[n]||n} (${k})`],
 [/^1 (sp|ep|gp|pp) equals copper$/,(_,k)=>`מטבע ${k} אחד שווה נחושת`],
 [/^Hit Dice to spend \((\d+) available\)$/,(_,n)=>`קוביות פגיעה לשימוש (${n} זמינות)`],
 [/^Welcome to level (\d+)\. Review newly available spells and (.+)\.$/,(_,n)=>`הגעת לדרגה ${n}. יש לבדוק לחשים חדשים ואת בחירות הלחשים שלך.`],
 [/^Unlocks at (cleric|bard) level (\d+)\.$/,(_,c,n)=>`זמין בדרגה ${n} של ${c==='cleric'?'כוהן':'פייטן'}.`],
 [/^Unlock (\d+)(?:nd|rd|th)-level spells\.$/,(_,n)=>`גישה ללחשים בדרגה ${n}.`],
 [/^Magical Secrets · (.+)$/,(_,n)=>`סודות קסומים · ${n}`],[/^Additional Lore secrets · (.+)$/,(_,n)=>`סודות נוספים של ידע · ${n}`],
 [/^· (\d+) domain spells always prepared$/,(_,n)=>` · ${n} לחשי תחום מוכנים תמיד`],[/^· (\d+) additional Lore secrets$/,(_,n)=>` · ${n} סודות ידע נוספים`],
 [/^(\d+) spell levels · (\d+) cantrips$/,(_,n,c)=>`${n} דרגות לחש · ${c} לחשונים`],
 [/^\s*(\d+) × level (\d+)\s*$/,(_,n,l)=>`${n} × דרגת לחש ${l}`],
 ];for(const [p,f] of patterns){if(p.test(key))return text.replace(key,key.replace(p,f));}
 return text;
}
export function useLanguage(){const ctx=useContext(Context);const t=(s:string)=>translate(s,ctx.language);
 function localize(node:ReactNode):ReactNode{if(typeof node==='string')return t(node);if(Array.isArray(node))return node.map(localize);if(!isValidElement(node))return node;const element=node as ReactElement<Record<string,unknown>>,props=element.props;if(props['data-localize']==='false')return node;const next:Record<string,unknown>={};for(const k of ['aria-label','placeholder','label','title'])if(typeof props[k]==='string')next[k]=t(props[k] as string);if(Array.isArray(props.options))next.options=(props.options as [string,string][]).map(([v,n])=>[v,t(n)]);if(props.children!==undefined)next.children=localize(props.children as ReactNode);if(typeof element.type==='string'&&(element.type==='input'||element.type==='textarea'))next.dir=props.type==='number'?'ltr':'auto';return cloneElement(element,next);}
 return {...ctx,t,localize,dir:ctx.language==='he'?'rtl' as const:'ltr' as const};
}
export function LanguageProvider({children}:{children:ReactNode}){const [language,setLanguage]=useState<Language>('he');useEffect(()=>{const saved=localStorage.getItem('stormkeep-language');if(saved==='en'||saved==='he')setLanguage(saved);},[]);useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='he'?'rtl':'ltr';},[language]);function choose(l:Language){setLanguage(l);localStorage.setItem('stormkeep-language',l);}return <Context.Provider value={{language,setLanguage:choose}}>{children}</Context.Provider>;}
export function LanguageSwitch(){const {language,setLanguage}=useLanguage();return <nav className="language-switch" aria-label="Language / שפה"><button type="button" lang="he" aria-pressed={language==='he'} onClick={()=>setLanguage('he')}>עברית</button><button type="button" lang="en" aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button></nav>;}
