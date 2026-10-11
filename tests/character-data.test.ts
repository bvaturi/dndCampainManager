import {describe,it,expect} from 'vitest';
import {characterSchema} from '../lib/character-schema';
import {initial,slotTable,cantripCount,domainSpells} from '../lib/rules';
import {aradInitial,bardKnown,bardCantrips} from '../lib/bard';
import {purchase,addCoins,emptyCoins,defaultRates,type Wallet} from '../lib/wallet';
import {summaryOf} from '../lib/campaign-types';
const wallet:Wallet={id:'common',name:'Common',rates:defaultRates,coins:{...emptyCoins(),gp:1}};
describe('Character migration validation',()=>{
 it('preserves level, spell choices, and balances in an imported backup',()=>{const backup={...initial,level:3,hp:26,maxHP:26,prepared:['aid','command','cure-wounds','guiding-bolt','healing-word','inflict-wounds','spiritual-weapon'],wallets:[wallet],defaultCurrencyId:'common'};expect(characterSchema.parse(backup)).toEqual(backup);});
 it('rejects a missing default currency or negative balances',()=>{expect(characterSchema.safeParse({...initial,wallets:[wallet],defaultCurrencyId:'missing'}).success).toBe(false);expect(characterSchema.safeParse({...initial,wallets:[{...wallet,coins:{...wallet.coins,gp:-1}}]}).success).toBe(false);});
 it('rejects unsupported levels, malformed abilities, and duplicate currencies',()=>{expect(characterSchema.safeParse({...initial,level:21}).success).toBe(false);expect(characterSchema.safeParse({...initial,scores:[18]}).success).toBe(false);expect(characterSchema.safeParse({...initial,wallets:[wallet,wallet]}).success).toBe(false);});
 it('accepts both class templates',()=>{expect(characterSchema.safeParse(initial).success).toBe(true);expect(characterSchema.safeParse(aradInitial).success).toBe(true);});
});
describe('Wallet operations',()=>{
 it('returns four silver when a six-silver purchase is paid with one gold',()=>{const r=purchase(wallet,6,'sp',1,'gp');expect(r.wallet.coins).toEqual({...emptyCoins(),sp:4});expect(r.change.sp).toBe(4);expect(wallet.coins.gp).toBe(1);});
 it('adds coins without overwriting existing denominations',()=>{const r=addCoins(wallet,{...emptyCoins(),sp:6,gp:2});expect(r.coins).toEqual({...emptyCoins(),sp:6,gp:3});});
 it('rejects overspending and an insufficient payment',()=>{expect(()=>purchase(wallet,6,'sp',2,'gp')).toThrow();expect(()=>purchase(wallet,2,'gp',1,'gp')).toThrow();});
});
describe('Party summaries',()=>{
 it('excludes private sheet notes, equipment, balances and spell selections',()=>{const r=summaryOf({data:{...initial,notes:'secret',equipment:'private',wallets:[wallet]},ownerUid:'player',type:'varen',revision:1,updatedAt:123,updatedBy:'player'});expect(r.name).toBe(initial.name);expect(r.ownerUid).toBe('player');expect(r).not.toHaveProperty('notes');expect(r).not.toHaveProperty('wallets');expect(r).not.toHaveProperty('prepared');expect(r).not.toHaveProperty('data');});
});
describe('2014 level-three guidance',()=>{
 it('uses three cleric cantrips, four first-level slots and two second-level slots',()=>{expect(cantripCount(3)).toBe(3);expect(slotTable[3]).toEqual([4,2]);expect(domainSpells(3)).toEqual(['fog-cloud','thunderwave','gust-of-wind','shatter']);});
 it('uses two bard cantrips and six known spells',()=>{expect(bardCantrips(3)).toBe(2);expect(bardKnown[3]).toBe(6);});
});

describe('Character portraits',()=>{
 it('preserves uploaded portraits and HTTPS images in backups and summaries',()=>{for(const image of ['https://example.com/portrait.jpg','data:image/jpeg;base64,AAAA']){const c=characterSchema.parse({...initial,image});expect(c.image).toBe(image);expect(summaryOf({data:c,ownerUid:'player',type:'varen',revision:1,updatedAt:1,updatedBy:'player'}).image).toBe(image);}});
 it('rejects script URLs, SVG data, credentials and oversized images',()=>{for(const image of ['javascript:alert(1)','data:image/svg+xml;base64,AAAA','https://user:secret@example.com/image.png','data:image/jpeg;base64,'+'A'.repeat(180000)])expect(characterSchema.safeParse({...initial,image}).success).toBe(false);});
});
