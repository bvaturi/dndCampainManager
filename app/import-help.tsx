import {useState} from 'react';
import {Copy,Download} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {characterImportPrompt} from '@/lib/import-prompt';
import {useLanguage} from './language';
export default function ImportHelp({campaign,player,welcome}:{campaign:string;player:string;welcome:boolean}){
 const {t,localize,language}=useLanguage();const [copied,setCopied]=useState(false),[error,setError]=useState('');
 const prompt=characterImportPrompt(location.origin,campaign,player,language==='he');
 function download(){const url=URL.createObjectURL(new Blob([prompt],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='stormkeep-character-import-prompt.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return localize(<details className="panel import-help" open={welcome||undefined}><summary>Import your character with AI</summary><p>Give this prompt and your character PDF or images to your AI. Review the JSON it produces, then import it here using your invited Google account.</p><div className="button-row"><Button type="button" onClick={()=>void navigator.clipboard.writeText(prompt).then(()=>{setCopied(true);setError('');}).catch(()=>setError(t('Copy is unavailable. Download the prompt instead.')))}><Copy size={16}/>{copied?'Prompt copied':'Copy AI prompt'}</Button><Button type="button" variant="outline" onClick={download}><Download size={16}/>Download AI prompt</Button></div>{error&&<p role="status">{error}</p>}<ol><li>Copy the prompt for your new character.</li><li>Give the prompt and sheet to your AI; review the extracted values.</li><li>Add character → Import JSON backup or Paste JSON backup.</li></ol><p className="small muted">Any class or species can use a general editable sheet. Its rules and level-up choices are reviewed with your DM.</p><details><summary>Preview AI prompt</summary><textarea aria-label={t('AI import prompt')} readOnly value={prompt} rows={12} dir="auto"/></details></details>);
}
