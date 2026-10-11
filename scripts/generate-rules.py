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
optionaltext={'className':100,'species':100,'subclass':100,'features':20000,'image':180000,'persona':1000,'falseIdentity':5000,'scheme':1000,'backstory':15000,'defaultCurrencyId':100}
for k,n in optionaltext.items():checks.append(f"(!('{k}' in c) || text(c.{k},{n}))")
checks.append("(!('image' in c) || image(c.image))")
checks.extend([f"(!('expertise' in c) || (c.expertise is list && c.expertise.size()<=4 && c.expertise.toSet().hasOnly({quoted(skills)})))","(!('inspiration' in c) || number(c.inspiration,0,20))","(!('college' in c) || c.college in ['','lore','valor'])","(!('secrets' in c) || spellList(c.secrets,6))","(!('loreSecrets' in c) || spellList(c.loreSecrets,2))","!('wallets' in c)"])
checks.extend(["(!('rulesEdition' in c) || c.rulesEdition in ['2014','2024','custom'])","(!('slotMax' in c) || (c.slotMax is list && c.slotMax.size()==9 && c.slotMax.toSet().hasOnly("+str(list(range(21)))+")))","(!('spellAbility' in c) || number(c.spellAbility,0,5))"])
required=list(texts)+list(nums)+['scores','spent','reaction','proficient','saveProf','prepared','cantrips','log']
allowed=required+list(optionaltext)+['expertise','inspiration','college','secrets','loreSecrets','rulesEdition','slotMax','spellAbility']
prefix='''rules_version = '2';
service cloud.firestore {
 match /databases/{database}/documents {
  function signed() { return request.auth != null && request.auth.token.email_verified == true && request.auth.token.firebase.sign_in_provider == 'google.com'; }
  function text(v,n) { return v is string && v.size()<=n; }
  function webLink(v) { return text(v,2048) && v.matches('https?://[^\\\\s/?#@]+([/?#][^\\\\s]*)?'); }
  function image(v) { return text(v,180000) && (v=='' || (v.size()<=2048 && v.matches('https://[^\\\\s/?#@]+([/?#][^\\\\s]*)?')) || v.matches('data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}')); }
  function number(v,a,b) { return v is int && v>=a && v<=b; }
  function keys(v,required,allowed) { return v is map && v.keys().hasAll(required) && v.keys().hasOnly(allowed); }
  function adminIdentity() { return request.auth.token.email.lower()=='ADMIN_EMAIL_PLACEHOLDER'; }
  function admin() { return signed() && adminIdentity(); }
  function campaignPath(id) { return /databases/$(database)/documents/campaigns/$(id); }
  function member(id) { return signed() && exists(campaignPath(id)) && (adminIdentity() || request.auth.uid in get(campaignPath(id)).data.memberIds); }
  function dm(id) { return member(id) && (adminIdentity() || request.auth.uid in get(campaignPath(id)).data.dmIds); }
  function rates(v) { return keys(v,['cp','sp','ep','gp','pp'],['cp','sp','ep','gp','pp']) && v.cp==1 && number(v.sp,2,1000000) && number(v.ep,v.sp+1,1000000) && number(v.gp,v.ep+1,1000000) && number(v.pp,v.gp+1,1000000); }
  function coins(v) { return keys(v,['cp','sp','ep','gp','pp'],['cp','sp','ep','gp','pp']) && number(v.cp,0,100000000) && number(v.sp,0,100000000) && number(v.ep,0,100000000) && number(v.gp,0,100000000) && number(v.pp,0,100000000); }
  function index(v) { return text(v,2019) && v.matches('([A-Za-z0-9_-]{1,100}(/[A-Za-z0-9_-]{1,100}){0,19})?'); }
  function customIndex(v) { return text(v,6059) && v.matches('([A-Za-z0-9_-]{1,100}(/[A-Za-z0-9_-]{1,100}){0,59})?'); }
  function indexed(v,key) { return key is string && key.matches('[A-Za-z0-9_-]{1,100}') && v.matches('(.*/)?'+key+'(/.*)?'); }
  function currency(v) { return keys(v,['id','name','rates'],['id','name','rates']) && text(v.id,100) && v.id.size()>0 && text(v.name,100) && v.name.size()>0 && rates(v.rates); }
  function wallet(v) { return keys(v,['id','name','rates','coins'],['id','name','rates','coins']) && text(v.id,100) && v.id.size()>0 && text(v.name,100) && v.name.size()>0 && rates(v.rates) && coins(v.coins); }
'''
body='// Data contract: bounded campaigns, public members, private sheets and DM notes.\n// Platform admin is the verified Google account '+'barakv01@gmail.com'+'. Only admin creates campaigns or assigns DMs.\n// DM invites may grant player access only; admin DM invitations grant exactly the invited account.\n// Subcollections require an existing campaign and membership, ownership or assigned DM access.\n'+prefix.replace('ADMIN_EMAIL_PLACEHOLDER',json.loads(Path('lib/platform-admin.json').read_text())['email'])+'\n'+each('logList',30,'text(VALUE,500)')+'\n'
spellFields={'prepared','cantrips','secrets','loreSecrets','log'}
coreFields={'className','species','subclass','rulesEdition','image','name','player','level','hp','maxHP','tempHP','scores','ac','speed','xp','spent','channel','wrath','stone','reaction','hitDiceSpent','concentration','deathSuccess','deathFailure','defaultCurrencyId'}
import re
coreChecks=[x for x in checks if set(re.findall(r'c\.([A-Za-z]+)',x)).issubset(coreFields)]
detailChecks=[x for x in checks if not set(re.findall(r'c\.([A-Za-z]+)',x)).issubset(coreFields) and "wallets" not in x and not (set(re.findall(r'c\.([A-Za-z]+)',x)) & spellFields)]
body+='function customSpell(v) { return keys(v,["id","name","level","prepared","description","concentration"],["id","name","level","prepared","description","concentration"]) && text(v.id,100) && v.id.size()>0 && text(v.name,100) && v.name.size()>0 && number(v.level,0,9) && v.prepared is bool && text(v.description,2000) && v.concentration is bool; }\n'+'\n'
body+=f'function knownSpells(v,n) {{ return keys(v,["ids"],["ids"]) && v.ids is list && v.ids.size()<=n && v.ids.toSet().hasOnly({quoted(ids)}); }}\n'
body+=f'function core(c) {{ return keys(c,{quoted([x for x in required if x in coreFields])},{quoted([x for x in allowed if x in coreFields])}) && '+' && '.join(coreChecks)+'; }\n'
body+=f'function detail(c) {{ return keys(c,{quoted([x for x in required if x not in coreFields and x not in spellFields])},{quoted([x for x in allowed if x not in coreFields and x not in spellFields])}) && '+' && '.join(detailChecks)+'; }\n'
body+="function emailList(v) { return v is list && v.size()<=50 && v.toSet()==v.join(',').split(',').toSet() && v.join(',').size()<=12749 && v.join(',').matches('[^@, ]{1,64}@[^@, ]{1,189}(,[^@, ]{1,64}@[^@, ]{1,189}){0,49}') && v.join(',').matches('[^@, ]+@[^@, ]+[.][^@, ]+(,[^@, ]+@[^@, ]+[.][^@, ]+){0,49}'); }\n"
body+='''
  function combatPath(id) { return /databases/$(database)/documents/campaigns/$(id)/combat/current; }
  function combatIndex(v) { return text(v,4039) && v.matches('([A-Za-z0-9_-]{1,100}(/[A-Za-z0-9_-]{1,100}){0,39})?'); }
  function validCombat(v) { return keys(v,['entryIndex','activeId','round','revision','updatedBy','updatedAt']) && combatIndex(v.entryIndex) && text(v.activeId,100) && (v.activeId=='' || indexed(v.entryIndex,v.activeId)) && number(v.round,1,9999) && number(v.revision,1,100000000) && v.updatedBy==request.auth.uid && v.updatedAt==request.time; }
  function validEntry(v,key) { return keys(v,['id','name','initiative','order','conditions']) && v.id==key && text(v.name,100) && v.name.size()>0 && number(v.initiative,-30,100) && number(v.order,0,1000) && text(v.conditions,200); }
  function boundContact(id,uid,v) { let m=get(/databases/$(database)/documents/campaigns/$(id)/members/$(uid)).data; return m.inviteId!='' && v.email==get(/databases/$(database)/documents/campaigns/$(id)/invitations/$(m.inviteId)).data.email && v.name==m.name; }
  function contact(id,uid,v) { return keys(v,['email','name']) && text(v.email,254) && v.email==v.email.lower() && v.email.matches('[^@ ]+@[^@ ]+[.][^@ ]+') && text(v.name,100) && uid in get(campaignPath(id)).data.memberIds && ((uid==request.auth.uid && v.email==request.auth.token.email.lower() && v.name==request.auth.token.name) || (admin() && boundContact(id,uid,v))); }
  function validDraft(v,key) { return keys(v,['id','title','description','location','start','end','timeZone','attendees','organizerUid']) && key.matches('[a-f0-9]{32}') && v.id==key && text(v.title,150) && v.title.size()>0 && text(v.description,2000) && text(v.location,300) && text(v.start,16) && v.start.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}') && text(v.end,16) && v.end.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}') && v.end>v.start && text(v.timeZone,100) && v.timeZone.size()>0 && emailList(v.attendees) && v.attendees.size()>0 && v.attendees.toSet().size()==v.attendees.size() && v.organizerUid==request.auth.uid; }
  function validSession(id,key,v) { let d=get(/databases/$(database)/documents/campaigns/$(id)/sessionDrafts/$(key)).data; return keys(v,['title','description','location','timeZone','startAt','endAt','calendarUrl','organizerUid']) && v.organizerUid==request.auth.uid && v.organizerUid==d.organizerUid && v.title==d.title && v.description==d.description && v.location==d.location && v.timeZone==d.timeZone && v.startAt is timestamp && v.endAt is timestamp && v.endAt>v.startAt && text(v.calendarUrl,2048) && v.calendarUrl.matches('https://(www[.]google[.]com/calendar/|calendar[.]google[.]com/)[^ ]+'); }
'''
body+='''
  function validCampaign(c) { return keys(c,['name','description','ruleset','createdBy','memberIds','dmIds','currencyIndex','createdAt','updatedAt'],['name','description','ruleset','createdBy','memberIds','dmIds','currencyIndex','createdAt','updatedAt']) && text(c.name,100) && c.name.size()>0 && text(c.description,2000) && c.ruleset=='2014' && text(c.createdBy,128) && c.memberIds is list && c.memberIds.size()<=50 && c.memberIds.toSet().size()==c.memberIds.size() && c.dmIds is list && c.dmIds.size()<=20 && c.dmIds.toSet().size()==c.dmIds.size() && c.dmIds.toSet().hasOnly(c.memberIds) && c.createdBy in c.memberIds && index(c.currencyIndex) && c.currencyIndex.size()>0 && c.createdAt is timestamp && c.updatedAt==request.time; }
  function invitation(id,i) { let v=get(/databases/$(database)/documents/campaigns/$(id)/invitations/$(i)).data; let c=get(campaignPath(id)).data; return i is string && i.size()>0 && i.size()<=100 && v.email==request.auth.token.email.lower() && v.expiresAt>request.time && (v.createdBy==c.createdBy || (v.createdBy in c.dmIds && v.get('role','player')=='player')); }
  function joining(id,c) { let before=get(campaignPath(id)).data; let m=getAfter(/databases/$(database)/documents/campaigns/$(id)/members/$(request.auth.uid)).data; let v=get(/databases/$(database)/documents/campaigns/$(id)/invitations/$(m.inviteId)).data; return !(request.auth.uid in before.memberIds) && c.diff(before).affectedKeys().hasOnly(['memberIds','dmIds','updatedAt']) && c.memberIds.toSet()==before.memberIds.toSet().union([request.auth.uid].toSet()) && invitation(id,m.inviteId) && c.dmIds.toSet()==(v.get('role','player')=='dm'?before.dmIds.toSet().union([request.auth.uid].toSet()):before.dmIds.toSet()); }
  function validMember(m) { return keys(m,['name','joinedAt','inviteId'],['name','joinedAt','inviteId']) && text(m.name,100) && m.name==request.auth.token.name && m.joinedAt==request.time && text(m.inviteId,100); }
  function validRecord(r) { return keys(r,['ownerUid','type','data','revision','updatedBy','updatedAt','walletIndex'],['ownerUid','type','data','revision','updatedBy','updatedAt','walletIndex','pendingOwnerEmail','customSpellIndex']) && text(r.ownerUid,128) && (r.get('pendingOwnerEmail','')=='' || (text(r.pendingOwnerEmail,254) && r.pendingOwnerEmail==r.pendingOwnerEmail.lower() && r.pendingOwnerEmail.matches('[^@ ]+@[^@ ]+\\.[^@ ]+'))) && r.type in ['varen','arad','custom'] && core(r.data) && (r.type!='custom' || (text(r.data.get('className',''),100) && r.data.get('className','').size()>0)) && number(r.revision,1,100000000) && customIndex(r.get('customSpellIndex','')) && index(r.walletIndex) && (!('defaultCurrencyId' in r.data) || indexed(r.walletIndex,r.data.defaultCurrencyId)) && r.updatedBy==request.auth.uid && r.updatedAt==request.time; }
  function editCharacter(id,r) { return member(id) && (r.ownerUid==request.auth.uid || adminIdentity() || request.auth.uid in get(campaignPath(id)).data.dmIds); }
  function matchingSummary(id,key,r) { let s=getAfter(/databases/$(database)/documents/campaigns/$(id)/summaries/$(key)).data; return s=={'image':r.data.get('image',''),'ownerUid':r.ownerUid,'name':r.data.name,'player':r.data.player,'className':(r.type=='custom'?((r.data.get('species','')==''?'':r.data.species+' · ')+r.data.className):(r.type=='arad'?'Changeling · Bard':'Goliath · Tempest cleric')),'level':r.data.level,'hp':r.data.hp,'maxHP':r.data.maxHP,'ac':r.data.ac,'concentration':r.data.concentration,'updatedAt':r.updatedAt}; }
  function validNote(n) { return keys(n,['title','text','kind','authorUid','authorName','createdAt','updatedAt','url'],['title','text','kind','authorUid','authorName','createdAt','updatedAt','url']) && text(n.title,150) && text(n.text,20000) && n.kind in ['note','quest','session','loot','link'] && (!('url' in n) || n.url=='' || webLink(n.url)) && (n.kind!='link' || webLink(n.url)) && text(n.authorUid,128) && text(n.authorName,100) && n.createdAt is timestamp && n.updatedAt==request.time; }
  // Shared attachments are immutable bounded byte chunks. Archive changes are reversible.
  function filePath(id,key) { return /databases/$(database)/documents/campaigns/$(id)/files/$(key); }
  function validFile(f) { return keys(f,['name','title','contentType','size','chunkCount','sha256','authorUid','authorName','createdAt','updatedAt','archived']) && text(f.name,150) && f.name.size()>0 && text(f.title,150) && f.title.size()>0 && f.contentType in ['application/pdf','image/png','image/jpeg','image/webp'] && number(f.size,1,8388608) && number(f.chunkCount,1,32) && (f.chunkCount-1)*262144<f.size && f.size<=f.chunkCount*262144 && text(f.sha256,64) && f.sha256.matches('[a-f0-9]{64}') && text(f.authorUid,128) && text(f.authorName,100) && f.createdAt is timestamp && f.updatedAt==request.time && f.archived is bool; }
  match /campaigns/{id} {
   allow read: if signed() && (admin() || request.auth.uid in resource.data.memberIds);
   allow create: if admin() && validCampaign(request.resource.data) && request.resource.data.createdBy==request.auth.uid && request.resource.data.memberIds==[request.auth.uid] && request.resource.data.dmIds==[] && request.resource.data.createdAt==request.time && getAfter(/databases/$(database)/documents/campaigns/$(id)/members/$(request.auth.uid)).data.inviteId=='';
   allow update: if signed() && validCampaign(request.resource.data) && request.resource.data.createdBy==resource.data.createdBy && request.resource.data.createdAt==resource.data.createdAt && (
    (admin() && request.resource.data.memberIds.toSet().hasOnly(resource.data.memberIds)) ||
    (dm(id) && request.resource.data.dmIds==resource.data.dmIds && request.resource.data.memberIds.toSet().hasOnly(resource.data.memberIds)) ||
    joining(id,request.resource.data)
   );
   match /contacts/{uid} {
    allow get: if member(id) && (dm(id) || uid==request.auth.uid);
    allow list: if dm(id);
    allow create,update: if member(id) && contact(id,uid,request.resource.data);
   }
   match /combat/{key} {
    allow read: if key=='current' && member(id);
    allow create: if key=='current' && dm(id) && validCombat(request.resource.data) && request.resource.data.revision==1;
    allow update: if key=='current' && dm(id) && validCombat(request.resource.data) && request.resource.data.revision==resource.data.revision+1;
    match /entries/{entryId} {
     allow read: if key=='current' && member(id);
     allow create,update: if key=='current' && dm(id) && validEntry(request.resource.data,entryId) && indexed(getAfter(combatPath(id)).data.entryIndex,entryId) && getAfter(combatPath(id)).data.updatedAt==request.time;
     allow delete: if key=='current' && dm(id) && !indexed(getAfter(combatPath(id)).data.entryIndex,entryId) && getAfter(combatPath(id)).data.updatedAt==request.time;
    }
   }
   match /sessionDrafts/{key} {
    allow read: if dm(id);
    allow create: if dm(id) && validDraft(request.resource.data,key);
    allow delete: if dm(id) && resource.data.organizerUid==request.auth.uid && existsAfter(/databases/$(database)/documents/campaigns/$(id)/sessions/$(key));
   }
   match /sessions/{key} {
    allow read: if member(id);
    allow create: if dm(id) && validSession(id,key,request.resource.data);
   }
   match /currencies/{key} {
    allow read: if member(id);
    allow create,update: if signed() && (admin() || request.auth.uid in getAfter(campaignPath(id)).data.dmIds) && currency(request.resource.data) && request.resource.data.id==key && indexed(getAfter(campaignPath(id)).data.currencyIndex,key) && getAfter(campaignPath(id)).data.updatedAt==request.time;
    allow delete: if dm(id) && !(indexed(getAfter(campaignPath(id)).data.currencyIndex,key)) && getAfter(campaignPath(id)).data.updatedAt==request.time;
   }
   match /members/{uid} {
    allow read: if member(id);
    allow create: if signed() && uid==request.auth.uid && validMember(request.resource.data) && uid in getAfter(campaignPath(id)).data.memberIds && ((getAfter(campaignPath(id)).data.createdBy==uid && request.resource.data.inviteId=='') || invitation(id,request.resource.data.inviteId));
    allow delete: if dm(id) && (admin() || !(uid in get(campaignPath(id)).data.dmIds)) && uid!=get(campaignPath(id)).data.createdBy && !(uid in getAfter(campaignPath(id)).data.memberIds);
   }
   match /invitations/{key} {
    allow read: if signed() && ((admin() || (dm(id) && (resource.data.createdBy==request.auth.uid || resource.data.role=='player'))) || (resource.data.email==request.auth.token.email.lower() && resource.data.expiresAt>request.time));
    allow create: if dm(id) && keys(request.resource.data,['email','campaignName','createdBy','createdAt','expiresAt','role'],['email','campaignName','createdBy','createdAt','expiresAt','role']) && request.resource.data.get('role','player') in ['player','dm'] && (request.resource.data.get('role','player')=='player' || admin()) && text(request.resource.data.email,254) && request.resource.data.email.matches('[^@ ]+@[^@ ]+\\.[^@ ]+') && request.resource.data.email==request.resource.data.email.lower() && request.resource.data.campaignName==get(campaignPath(id)).data.name && request.resource.data.createdBy==request.auth.uid && request.resource.data.createdAt==request.time && request.resource.data.expiresAt is timestamp && request.resource.data.expiresAt>request.time && request.resource.data.expiresAt<=request.time+duration.value(7,'d');
    allow delete: if admin() || (dm(id) && resource.data.get('role','player')=='player');
   }
   function pendingOwner(id,r) { return member(id) && r.get('pendingOwnerEmail','')==request.auth.token.email.lower(); }
   function ownershipClaim(id,old,r) { return pendingOwner(id,old) && r.ownerUid==request.auth.uid && r.get('pendingOwnerEmail','')=='' && r.diff(old).affectedKeys().hasOnly(['ownerUid','pendingOwnerEmail','revision','updatedBy','updatedAt']); }
   match /characters/{key} {
    allow read: if editCharacter(id,resource.data) || pendingOwner(id,resource.data);
    allow create: if validRecord(request.resource.data) && request.resource.data.revision==1 && ((member(id) && request.resource.data.ownerUid==request.auth.uid && request.resource.data.get('pendingOwnerEmail','')=='') || (dm(id) && request.resource.data.ownerUid in get(campaignPath(id)).data.memberIds)) && matchingSummary(id,key,request.resource.data);
    allow update: if validRecord(request.resource.data) && request.resource.data.type==resource.data.type && request.resource.data.revision==resource.data.revision+1 && matchingSummary(id,key,request.resource.data) && ((editCharacter(id,resource.data) && (request.resource.data.get('pendingOwnerEmail','')==resource.data.get('pendingOwnerEmail','') || dm(id)) && (request.resource.data.ownerUid==resource.data.ownerUid || (dm(id) && request.resource.data.ownerUid in get(campaignPath(id)).data.memberIds))) || ownershipClaim(id,resource.data,request.resource.data));
    match /customSpells/{spellId} {
     allow read: if editCharacter(id,get(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data);
     allow create,update: if editCharacter(id,getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data) && customSpell(request.resource.data) && request.resource.data.id==spellId && indexed(getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.get('customSpellIndex',''),spellId) && getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.updatedAt==request.time;
     allow delete: if editCharacter(id,getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data) && !indexed(getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.get('customSpellIndex',''),spellId) && getAfter(/databases/$(database)/documents/campaigns/$(id)/characters/$(key)).data.updatedAt==request.time;
    }
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
   match /files/{key} {
    allow read: if member(id);
    allow create: if member(id) && validFile(request.resource.data) && request.resource.data.authorUid==request.auth.uid && request.resource.data.authorName==request.auth.token.name && request.resource.data.createdAt==request.time && request.resource.data.archived==false && getAfter(/databases/$(database)/documents/campaigns/$(id)/files/$(key)/chunks/0).data.index==0;
    allow update: if member(id) && (resource.data.authorUid==request.auth.uid || dm(id)) && validFile(request.resource.data) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['archived','updatedAt']);
    match /chunks/{chunkId} {
     allow read: if member(id) && exists(filePath(id,key)) && (!get(filePath(id,key)).data.archived || get(filePath(id,key)).data.authorUid==request.auth.uid || dm(id));
     allow create: if member(id) && getAfter(filePath(id,key)).data.authorUid==request.auth.uid && getAfter(filePath(id,key)).data.createdAt==request.time && keys(request.resource.data,['index','data']) && number(request.resource.data.index,0,getAfter(filePath(id,key)).data.chunkCount-1) && chunkId==string(request.resource.data.index) && request.resource.data.data is bytes && request.resource.data.data.size()==(request.resource.data.index==getAfter(filePath(id,key)).data.chunkCount-1?getAfter(filePath(id,key)).data.size-request.resource.data.index*262144:262144);
    }
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
