import {useEffect,useState,useRef} from 'react';
import {Compass,LogIn,LogOut,Plus,Users,ArrowLeft,Shield,BookOpen} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useLanguage,LanguageSwitch} from './language';
import type {Gateway,Profile} from '@/lib/gateway';
import type {Campaign} from '@/lib/campaign-types';
import CampaignView from './campaign-view';

export default function CampaignApp({gateway}:{gateway:Gateway|null}){
 const {t,localize}=useLanguage();
 const [user,setUser]=useState<Profile|null>(null),[authReady,setAuthReady]=useState(!gateway),[campaigns,setCampaigns]=useState<Campaign[]>([]),[loaded,setLoaded]=useState(false);
 const [active,setActive]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[creating,setCreating]=useState(false),[name,setName]=useState(''),[description,setDescription]=useState('');
 const canLeave=useRef<()=>Promise<boolean>>(async()=>true);
 const params=new URLSearchParams(location.search),inviteCampaign=params.get('campaign')||'',inviteId=params.get('invite')||'';
 useEffect(()=>{if(!gateway)return;return gateway.watchUser(u=>{setUser(u);setAuthReady(true);setCampaigns([]);setLoaded(false);setActive('');});},[gateway]);
 useEffect(()=>{if(!gateway||!user)return;return gateway.watchCampaigns(user,cs=>{setCampaigns(cs);setLoaded(true);},e=>{setError(e.message);setLoaded(true);});},[gateway,user]);
 async function act(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function leave(){if(!await canLeave.current())return;setActive('');}
 const selected=campaigns.find(c=>c.id===active);
 return localize(<div className="campaign-app">
  <div className="campaign-topbar"><a className="campaign-brand" href="/" onClick={e=>{e.preventDefault();void leave();}}><Compass size={25}/><span>STORMKEEP<small>Campaign manager</small></span></a><div className="campaign-account"><LanguageSwitch/>{user&&<><span className="account-name" dir="auto">{user.displayName||user.email}</span><Button variant="ghost" disabled={busy} onClick={()=>void act(async()=>{if(await canLeave.current())await gateway!.signOut();})}><LogOut size={16}/>Sign out</Button></>}</div></div>
  {error&&<div className="campaign-message error" role="alert">{error}<button aria-label={t('Dismiss notification')} onClick={()=>setError('')}>×</button></div>}
  {!authReady?<main className="campaign-loading" role="status">Connecting to your table…</main>:!user?<main className="campaign-landing">
   <div className="landing-copy"><p className="eyebrow">ONE TABLE · MANY STORIES</p><h1>Your campaign.<br/><span>Your people.</span></h1><p className="landing-description">A home for your characters, a shared journal for your party, and a clear view for every DM.</p>
   <div className="landing-tags"><span><Users size={16}/>Multiple campaigns</span><span><Shield size={16}/>Private character sheets</span><span><BookOpen size={16}/>Shared party journal</span></div>
   <Button size="lg" disabled={busy||!gateway} onClick={()=>void act(()=>gateway!.signIn())}><LogIn size={18}/>Continue with Google</Button>
   {!gateway?<p className="setup-message" role="status">Firebase connection is being set up. Google sign-in will be available once the project is connected.</p>:<p className="muted">Sign in to create a campaign or accept an invitation.</p>}
   {inviteId&&<p className="gold">You have a campaign invitation. Sign in with the invited Google account to join.</p>}</div>
   <div className="landing-art" aria-hidden="true"><div className="compass-ring ring-one"/><div className="compass-ring ring-two"/><Compass size={150}/><span>THE NEXT CHAPTER<br/>STARTS AT YOUR TABLE</span></div>
  </main>:active&&selected&&gateway?<>
   <div className="campaign-breadcrumb"><Button variant="ghost" onClick={()=>void leave()}><ArrowLeft size={16}/>All campaigns</Button><select aria-label="Switch campaign" value={active} onChange={e=>{const id=e.target.value;void act(async()=>{if(await canLeave.current())setActive(id);});}}>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
   <CampaignView key={active} gateway={gateway} campaignId={active} user={user} registerLeave={fn=>{canLeave.current=fn;}} onExit={()=>setActive('')}/>
  </>:<main className="campaign-lobby">
   <div className="lobby-title"><div><p className="eyebrow">WELCOME BACK</p><h1>Your campaigns</h1><p>One account. Every adventure.</p></div><Button onClick={()=>setCreating(!creating)}><Plus size={16}/>New campaign</Button></div>
   {inviteId&&gateway&&<section className="panel invite-banner"><h2>Join your party</h2><p>This invitation is linked to your Google email address.</p><Button disabled={busy} onClick={()=>void act(async()=>{await gateway.joinCampaign(user,inviteCampaign,inviteId);history.replaceState({},'',location.pathname);setActive(inviteCampaign);})}>Accept invitation</Button></section>}
   {creating&&<form className="panel create-campaign" onSubmit={e=>{e.preventDefault();void act(async()=>{const id=await gateway!.createCampaign(user,name.trim(),description.trim());setCreating(false);setName('');setDescription('');setActive(id);});}}><h2>A new adventure</h2><label className="field">Campaign name<Input required value={name} maxLength={100} onChange={e=>setName(e.target.value)} placeholder="Nicko’s campaign"/></label><label className="field">Description<textarea value={description} maxLength={2000} onChange={e=>setDescription(e.target.value)} placeholder="Where does your story begin?"/></label><p className="small muted">You become this campaign’s DM. Invite players and add other DMs from its console. Character tools currently use 2014 rules.</p><div className="button-row"><Button disabled={busy||!name.trim()} type="submit">Create campaign</Button><Button type="button" variant="ghost" onClick={()=>setCreating(false)}>Cancel</Button></div></form>}
   {!loaded?<p role="status">Loading campaigns…</p>:campaigns.length===0?<section className="campaign-empty"><Compass size={44}/><h2>Your table awaits</h2><p>Create a campaign to DM, or open an invitation from your DM.</p></section>:<div className="campaign-cards">{campaigns.map(c=><button className="campaign-card" key={c.id} onClick={()=>{setActive(c.id);setError('');}}><div className="card-top"><Compass size={27}/><span className="badge">{c.dmIds.includes(user.uid)?'DM':'Player'}</span></div><h2 dir="auto">{c.name}</h2><p dir="auto">{c.description||t('Your next adventure starts here.')}</p><div className="card-bottom"><span><Users size={15}/> {c.memberIds.length} {t('members')}</span><span>2014 · D&D 5e</span></div></button>)}</div>}
  </main>}
  <footer className="campaign-footer"><span>Stormkeep · Built for your table</span><span>Characters · Party · DM console</span></footer>
 </div>);
}
