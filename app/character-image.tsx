import {useEffect,useRef,useState} from 'react';
import {ImagePlus,UserRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {characterImage,isWebLink,validImage} from '@/lib/media';
import {useLanguage} from './language';
export function CharacterImage({image,name,size='small'}:{image?:string;name:string;size?:'small'|'large'}) {
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[image]);
 return <span className={`character-portrait ${size}`} data-localize="false">{image&&validImage(image)&&!failed?<img src={image} alt={`${name} portrait`} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<UserRound aria-hidden="true"/>}</span>;
}
export function CharacterImageEditor({image,name,disabled,onChange}:{image?:string;name:string;disabled:boolean;onChange:(value:string)=>void}) {
 const {localize,t}=useLanguage();const input=useRef<HTMLInputElement>(null);const [url,setURL]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>setURL(image?.startsWith('https://')?image:''),[image]);
 return localize(<div className="portrait-editor"><CharacterImage image={image} name={name} size="large"/><div><h3>Character image</h3><p className="small muted">Upload a picture or paste a direct HTTPS image URL. Your party can see your portrait.</p><div className="button-row"><Button type="button" variant="outline" disabled={disabled||busy} onClick={()=>input.current?.click()}><ImagePlus size={16}/>{busy?'Processing image…':'Upload character image'}</Button>{image&&<Button type="button" variant="ghost" disabled={disabled||busy} onClick={()=>{onChange('');setError('');}}>Remove image</Button>}</div><input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label={t('Choose character image')} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');void characterImage(file).then(onChange).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}/><div className="invite-form"><label className="field">Image URL<Input type="url" dir="ltr" maxLength={2048} value={url} disabled={disabled||busy} onChange={e=>setURL(e.target.value)} placeholder="https://example.com/character.jpg"/></label><Button type="button" variant="outline" disabled={disabled||busy||!url.trim()} onClick={()=>{const value=url.trim();if(!isWebLink(value,true)){setError('Enter a valid HTTPS image URL.');return;}setError('');onChange(value);}}>Use image URL</Button></div>{error&&<p role="alert" className="error">{t(error)}</p>}</div></div>);
}
