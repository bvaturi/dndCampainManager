"""Generate bounded list validators; Firestore rules have no loops."""
import json
from pathlib import Path
spells=json.loads(Path('lib/spells.json').read_text())
ids=sorted(set(s['id'] for s in spells+json.loads(Path('lib/bard-spells.json').read_text())))
skills=['Acrobatics','Animal Handling','Arcana','Athletics','Deception','History','Insight','Intimidation','Investigation','Medicine','Nature','Perception','Performance','Persuasion','Religion','Sleight of Hand','Stealth','Survival']
def quoted(x):return json.dumps(x,ensure_ascii=False)
def each(name,limit,check):
    groups=[]
    for start in range(0,limit,5):
        group=' && '.join(f'(v.size() <= {i} || {check.replace("VALUE",f"v[{i}]")})' for i in range(start,min(start+5,limit)))
        groups.append(f'(v.size() <= {start} || ({group}))')
    return f'function {name}(v) {{ return v is list && v.size() <= {limit} && '+ ' && '.join(groups)+'; }'
checks=[]
texts={'name':100,'player':100,'alignment':100,'background':100,'concentration':100,'equipment':10000,'notes':20000,'languages':1000,'coins':1000}
nums={'level':(1,20),'hp':(0,1000000),'maxHP':(1,1000000),'tempHP':(0,1000000),'ac':(0,50),'speed':(0,500),'xp':(0,100000000),'channel':(0,20),'wrath':(0,20),'stone':(0,1),'hitDiceSpent':(0,20),'deathSuccess':(0,3),'deathFailure':(0,3)}
for k,n in texts.items():checks.append(f'text(c.{k},{n})')
for k,(a,b) in nums.items():checks.append(f'(c.{k} is int && c.{k}>={a} && c.{k}<={b})')
checks.extend(['c.reaction is bool',f'c.scores is list && c.scores.size()==6 && c.scores.toSet().hasOnly({list(range(1,31))})'])
checks.extend([f'c.spent is list && c.spent.size()==9 && c.spent.toSet().hasOnly({list(range(21))})'])
checks.extend([f'c.proficient is list && c.proficient.size()<=18 && c.proficient.toSet().hasOnly({quoted(skills)})','c.saveProf is list && c.saveProf.size()<=6 && c.saveProf.toSet().hasOnly([0,1,2,3,4,5])','spellList(c.prepared,100)','spellList(c.cantrips,7)','logList(c.log)'])
optionaltext={'persona':1000,'falseIdentity':5000,'scheme':1000,'backstory':15000,'defaultCurrencyId':100}
for k,n in optionaltext.items():checks.append(f"(!('{k}' in c) || text(c.{k},{n}))")
checks.extend([f"(!('expertise' in c) || (c.expertise is list && c.expertise.size()<=4 && c.expertise.toSet().hasOnly({quoted(skills)})))","(!('inspiration' in c) || number(c.inspiration,0,20))","(!('college' in c) || c.college in ['','lore','valor'])","(!('secrets' in c) || spellList(c.secrets,6))","(!('loreSecrets' in c) || spellList(c.loreSecrets,2))","!('wallets' in c)"])
required=list(texts)+list(nums)+['scores','spent','reaction','proficient','saveProf','prepared','cantrips','log']
allowed=required+list(optionaltext)+['expertise','inspiration','college','secrets','loreSecrets']
prefix='''rules_version = '2';
service cloud.firestore {
 match /databases/{database}/documents {
  function signed() { return request.auth != null && request.auth.token.email_verified == true && request.auth.token.firebase.sign_in_provider == 'google.com'; }
  function text(v,n) { return v is string && v.size()<=n; }
  function number(v,a,b) { return v is int && v>=a && v<=b; }
  function keys(v,required,allowed) { return v is map && v.keys().hasAll(required) && v.keys().hasOnly(allowed); }
  function campaignPath(id) { return /databases/$(database)/documents/campaigns/$(id); }
  function member(id) { return signed() && request.auth.uid in get(campaignPath(id)).data.memberIds; }
  function dm(id) { return member(id) && request.auth.uid in get(campaignPath(id)).data.dmIds; }
  function rates(v) { return keys(v,['cp','sp','ep','gp','pp'],['cp','sp','ep','gp','pp']) && v.cp==1 && number(v.sp,2,1000000) && number(v.ep,v.sp+1,1000000) && number(v.gp,v.ep+1,1000000) && number(v.pp,v.gp+1,1000000); }
  function coins(v) { return keys(v,['cp','sp','ep','gp','pp'],['cp','sp','ep','gp','pp']) && number(v.cp,0,100000000) && number(v.sp,0,100000000) && number(v.ep,0,100000000) && number(v.gp,0,100000000) && number(v.pp,0,100000000); }
  function index(v) { return text(v,2019) && v.matches('([A-Za-z0-9_-]{1,100}(/[A-Za-z0-9_-]{1,100}){0,19})?'); }
  function indexed(v,key) { return key is string && key.matches('[A-Za-z0-9_-]{1,100}') && v.matches('(.*/)?'+key+'(/.*)?'); }
  function currency(v) { return keys(v,['id','name','rates'],['id','name','rates']) && text(v.id,100) && v.id.size()>0 && text(v.name,100) && v.name.size()>0 && rates(v.rates); }
  function wallet(v) { return keys(v,['id','name','rates','coins'],['id','name','rates','coins']) && text(v.id,100) && v.id.size()>0 && text(v.name,100) && v.name.size()>0 && rates(v.rates) && coins(v.coins); }
'''
body=prefix+'\n'+each('logList',30,'text(VALUE,500)')+'\n'
spellFields={'prepared','cantrips','secrets','loreSecrets','log'}
coreFields={'name','player','level','hp','maxHP','tempHP','scores','ac','speed','xp','spent','channel','wrath','stone','reaction','hitDiceSpent','concentration','deathSuccess','deathFailure','defaultCurrencyId'}
import re
coreChecks=[x for x in checks if set(re.findall(r'c\.([A-Za-z]+)',x)).issubset(coreFields)]
detailChecks=[x for x in checks if not set(re.findall(r'c\.([A-Za-z]+)',x)).issubset(coreFields) and "wallets" not in x and not (set(re.findall(r'c\.([A-Za-z]+)',x)) & spellFields)]
body+=f'function knownSpells(v,n) {{ return keys(v,["ids"],["ids"]) && v.ids is list && v.ids.size()<=n && v.ids.toSet().hasOnly({quoted(ids)}); }}\n'
body+=f'function core(c) {{ return keys(c,{quoted([x for x in allowed if x in coreFields])},{quoted([x for x in allowed if x in coreFields])}) && '+' && '.join(coreChecks)+'; }\n'
body+=f'function detail(c) {{ return keys(c,{quoted([x for x in allowed if x not in coreFields and x not in spellFields])},{quoted([x for x in allowed if x not in coreFields and x not in spellFields])}) && '+' && '.join(detailChecks)+'; }\n'
body+='''
  function validCampaign(c) { return keys(c,['name','description','ruleset','createdBy','memberIds','dmIds','currencyIndex','createdAt','updatedAt'],['name','description','ruleset','createdBy','memberIds','dmIds','currencyIndex','createdAt','updatedAt']) && text(c.name,100) && c.name.size()>0 && text(c.description,2000) && c.ruleset=='2014' && text(c.createdBy,128) && c.memberIds is list && c.memberIds.size()<=50 && c.memberIds.toSet().size()==c.memberIds.size() && c.dmIds is list && c.dmIds.size()<=20 && c.dmIds.toSet().size()==c.dmIds.size() && c.dmIds.toSet().hasOnly(c.memberIds) && c.createdBy in c.dmIds && index(c.currencyIndex) && c.currencyIndex.size()>0 && c.createdAt is timestamp && c.updatedAt==request.time; }
  function invitation(id,i) { return i is string && i.size()>0 && i.size()<=100 && get(/databases/$(database)/documents/campaigns/$(id)/invitations/$(i)).data.email==request.auth.token.email.lower() && get(/databases/$(database)/documents/campaigns/$(id)/invitations/$(i)).data.expiresAt>request.time && get(/databases/$(database)/documents/campaigns/$(id)/invitations/$(i)).data.createdBy in get(campaignPath(id)).data.dmIds; }
  function validMember(m) { return keys(m,['name','joinedAt','inviteId'],['name','joinedAt','inviteId']) && text(m.name,100) && m.name==request.auth.token.name && m.joinedAt==request.time && text(m.inviteId,100); }
  function validRecord(r) { return keys(r,['ownerUid','type','data','revision','updatedBy','updatedAt','walletIndex'],['ownerUid','type','data','revision','updatedBy','updatedAt','walletIndex']) && text(r.ownerUid,128) && r.type in ['varen','arad'] && core(r.data) && number(r.revision,1,100000000) && index(r.walletIndex) && (!('defaultCurrencyId' in r.data) || indexed(r.walletIndex,r.data.defaultCurrencyId)) && r.updatedBy==request.auth.uid && r.updatedAt==request.time; }
  function editCharacter(id,r) { return member(id) && (r.ownerUid==request.auth.uid || dm(id)); }
  function matchingSummary(id,key,r) { let s=getAfter(/databases/$(database)/documents/campaigns/$(id)/summaries/$(key)).data; return s=={'ownerUid':r.ownerUid,'name':r.data.name,'player':r.data.player,'className':(r.type=='arad'?'Changeling · Bard':'Goliath · Tempest cleric'),'level':r.data.level,'hp':r.data.hp,'maxHP':r.data.maxHP,'ac':r.data.ac,'concentration':r.data.concentration,'updatedAt':r.updatedAt}; }
  function validNote(n) { return keys(n,['title','text','kind','authorUid','authorName','createdAt','updatedAt'],['title','text','kind','authorUid','authorName','createdAt','updatedAt']) && text(n.title,150) && text(n.text,20000) && n.kind in ['note','quest','session','loot'] && text(n.authorUid,128) && text(n.authorName,100) && n.createdAt is timestamp && n.updatedAt==request.time; }
  match /campaigns/{id} {
   allow read: if signed() && request.auth.uid in resource.data.memberIds;
   allow create: if signed() && validCampaign(request.resource.data) && request.resource.data.createdBy==request.auth.uid && request.resource.data.memberIds==[request.auth.uid] && request.resource.data.dmIds==[request.auth.uid] && request.resource.data.createdAt==request.time && getAfter(/databases/$(database)/documents/campaigns/$(id)/members/$(request.auth.uid)).data.inviteId=='';
   allow update: if signed() && validCampaign(request.resource.data) && request.resource.data.createdBy==resource.data.createdBy && request.resource.data.createdAt==resource.data.createdAt && (
    (dm(id) && request.resource.data.memberIds.toSet().hasOnly(resource.data.memberIds)) ||
    (!(request.auth.uid in resource.data.memberIds) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberIds','updatedAt']) && request.resource.data.memberIds.toSet()==resource.data.memberIds.toSet().union([request.auth.uid].toSet()) && invitation(id,getAfter(/databases/$(database)/documents/campaigns/$(id)/members/$(request.auth.uid)).data.inviteId))
   );
   match /currencies/{key} {
    allow read: if member(id);
    allow create,update: if signed() && request.auth.uid in getAfter(campaignPath(id)).data.dmIds && currency(request.resource.data) && request.resource.data.id==key && indexed(getAfter(campaignPath(id)).data.currencyIndex,key) && getAfter(campaignPath(id)).data.updatedAt==request.time;
    allow delete: if dm(id) && !(indexed(getAfter(campaignPath(id)).data.currencyIndex,key)) && getAfter(campaignPath(id)).data.updatedAt==request.time;
   }
   match /members/{uid} {
    allow read: if member(id);
    allow create: if signed() && uid==request.auth.uid && validMember(request.resource.data) && uid in getAfter(campaignPath(id)).data.memberIds && ((getAfter(campaignPath(id)).data.createdBy==uid && request.resource.data.inviteId=='') || invitation(id,request.resource.data.inviteId));
    allow delete: if dm(id) && uid!=get(campaignPath(id)).data.createdBy && !(uid in getAfter(campaignPath(id)).data.memberIds);
   }
   match /invitations/{key} {
    allow read: if signed() && ((dm(id) && resource.data.createdBy==request.auth.uid) || (resource.data.email==request.auth.token.email.lower() && resource.data.expiresAt>request.time));
    allow create: if dm(id) && keys(request.resource.data,['email','campaignName','createdBy','createdAt','expiresAt'],['email','campaignName','createdBy','createdAt','expiresAt']) && text(request.resource.data.email,254) && request.resource.data.email.matches('[^@ ]+@[^@ ]+\\.[^@ ]+') && request.resource.data.email==request.resource.data.email.lower() && request.resource.data.campaignName==get(campaignPath(id)).data.name && request.resource.data.createdBy==request.auth.uid && request.resource.data.createdAt==request.time && request.resource.data.expiresAt is timestamp && request.resource.data.expiresAt>request.time && request.resource.data.expiresAt<=request.time+duration.value(7,'d');
    allow delete: if dm(id);
   }
   match /characters/{key} {
    allow read: if editCharacter(id,resource.data);
    allow create: if member(id) && validRecord(request.resource.data) && request.resource.data.ownerUid in get(campaignPath(id)).data.memberIds && (request.resource.data.ownerUid==request.auth.uid || dm(id)) && request.resource.data.revision==1 && matchingSummary(id,key,request.resource.data);
    allow update: if editCharacter(id,resource.data) && validRecord(request.resource.data) && request.resource.data.type==resource.data.type && (request.resource.data.ownerUid==resource.data.ownerUid || (dm(id) && request.resource.data.ownerUid in get(campaignPath(id)).data.memberIds)) && request.resource.data.revision==resource.data.revision+1 && matchingSummary(id,key,request.resource.data);
    match /spells/{listId} {
     allow read: if editCharacter(id,get(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data);
     allow create,update: if listId in ['prepared','cantrips','secrets','loreSecrets'] && editCharacter(id,getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data) && knownSpells(request.resource.data,listId=='prepared'?100:(listId=='cantrips'?7:(listId=='secrets'?6:2))) && getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.updatedAt==request.time;
    }
    match /history/{historyId} {
     allow read: if editCharacter(id,get(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data);
     allow create,update: if historyId=='actions' && editCharacter(id,getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data) && keys(request.resource.data,['entries'],['entries']) && logList(request.resource.data.entries) && getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.updatedAt==request.time;
    }
    match /details/{detailId} {
     allow read: if editCharacter(id,get(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data);
     allow create,update: if detailId=='state' && editCharacter(id,getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data) && detail(request.resource.data) && getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.updatedAt==request.time;
    }
    match /wallets/{walletId} {
     allow read: if editCharacter(id,get(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data);
     allow create,update: if editCharacter(id,getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data) && wallet(request.resource.data) && request.resource.data.id==walletId && indexed(getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.walletIndex,walletId) && getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.updatedAt==request.time;
     allow delete: if editCharacter(id,getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data) && !(indexed(getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.walletIndex,walletId)) && getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.updatedAt==request.time;
    }
   }
   match /summaries/{key} {
    allow read: if member(id);
    allow create,update: if editCharacter(id,getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data) && getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.updatedAt==request.time && matchingSummary(id,key,getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data);
   }
   match /notes/{key} {
    allow read: if member(id);
    allow create: if member(id) && validNote(request.resource.data) && request.resource.data.authorUid==request.auth.uid && request.resource.data.authorName==request.auth.token.name && request.resource.data.createdAt==request.time;
    allow update: if member(id) && (resource.data.authorUid==request.auth.uid || dm(id)) && validNote(request.resource.data) && request.resource.data.authorUid==resource.data.authorUid && request.resource.data.authorName==resource.data.authorName && request.resource.data.createdAt==resource.data.createdAt;
    allow delete: if member(id) && (resource.data.authorUid==request.auth.uid || dm(id));
   }
   match /dmNotes/{key} {
    allow read: if dm(id);
    allow create: if dm(id) && validNote(request.resource.data) && request.resource.data.authorUid==request.auth.uid && request.resource.data.authorName==request.auth.token.name && request.resource.data.createdAt==request.time;
    allow update: if dm(id) && validNote(request.resource.data) && request.resource.data.authorUid==resource.data.authorUid && request.resource.data.authorName==resource.data.authorName && request.resource.data.createdAt==resource.data.createdAt;
    allow delete: if dm(id);
   }
  }
 }
}
'''
# Firestore string regex literals need a double backslash.
body=body.replace("+\\.[", "+\\\\.[")
import re
body=re.sub(r'keys\(([^,()]+),(\[[^\]]*\]),(\[[^\]]*\])\)',r'keys(\1,\3)',body)
body=body.replace('function keys(v,required,allowed)', 'function keys(v,allowed)').replace('v.keys().hasAll(required) && ', '')
Path('firestore.rules').write_text(body)
