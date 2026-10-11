import type {Character} from './rules';
import type {Coins} from './wallet';
export type CharacterType='varen'|'arad';
export interface Currency {id:string;name:string;rates:Coins;}
export interface Campaign {id:string;name:string;description:string;ruleset:'2014';createdBy:string;memberIds:string[];dmIds:string[];currencies:Currency[];createdAt:number;updatedAt:number;}
export interface Member {id:string;name:string;email:string;joinedAt:number;inviteId:string;}
export interface CharacterRecord {id:string;ownerUid:string;type:CharacterType;data:Character;revision:number;updatedAt:number;updatedBy:string;}
export interface PartySummary {image?:string;id:string;ownerUid:string;name:string;player:string;className:string;level:number;hp:number;maxHP:number;ac:number;concentration:string;updatedAt:number;}
export interface PartyNote {id:string;title:string;text:string;kind:'note'|'quest'|'session'|'loot'|'link';url?:string;authorUid:string;authorName:string;createdAt:number;updatedAt:number;}
export interface Invitation {id:string;role?:'player'|'dm';email:string;campaignName:string;createdBy:string;createdAt:number;expiresAt:number;}
export const summaryOf=(record:Omit<CharacterRecord,'id'>):Omit<PartySummary,'id'>=>({image:record.data.image||'',ownerUid:record.ownerUid,name:record.data.name,player:record.data.player,className:record.type==='arad'?'Changeling · Bard':'Goliath · Tempest cleric',level:record.data.level,hp:record.data.hp,maxHP:record.data.maxHP,ac:record.data.ac,concentration:record.data.concentration,updatedAt:record.updatedAt});
export const isDM=(campaign:Campaign,uid:string)=>campaign.dmIds.includes(uid);
