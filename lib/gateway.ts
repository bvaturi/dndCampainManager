import type {PartyFile} from './party-files';
import type {Campaign,CharacterRecord,CharacterType,Currency,Invitation,Member,PartyNote,PartySummary} from './campaign-types';
import type {Character} from './rules';
import type {SheetStore} from '@/app/sheet';
export interface Profile {uid:string;email:string;displayName:string;emailVerified:boolean;}
export type Watch<T>=(value:T)=>void;
export type Fail=(error:Error)=>void;
export interface Gateway {
 watchUser(next:Watch<Profile|null>):()=>void;
 signIn():Promise<void>;signOut():Promise<void>;
 watchCampaigns(user:Profile,next:Watch<Campaign[]>,fail:Fail):()=>void;
 watchCampaign(id:string,next:Watch<Campaign|null>,fail:Fail):()=>void;
 watchMembers(id:string,next:Watch<Member[]>,fail:Fail):()=>void;
 watchCharacters(id:string,user:Profile,dm:boolean,next:Watch<CharacterRecord[]>,fail:Fail):()=>void;
 watchSummaries(id:string,next:Watch<PartySummary[]>,fail:Fail):()=>void;
 watchNotes(id:string,privateNotes:boolean,next:Watch<PartyNote[]>,fail:Fail):()=>void;
 watchFiles(id:string,next:Watch<PartyFile[]>,fail:Fail):()=>void;
 uploadPartyFile(id:string,user:Profile,file:File,title:string):Promise<void>;
 downloadPartyFile(id:string,file:PartyFile):Promise<Blob>;
 archivePartyFile(id:string,file:PartyFile,archived:boolean):Promise<void>;
 watchInvitations(id:string,next:Watch<Invitation[]>,fail:Fail):()=>void;
 createCampaign(user:Profile,name:string,description:string):Promise<string>;
 joinCampaign(user:Profile,campaignId:string,inviteId:string):Promise<void>;
 updateCampaign(id:string,name:string,description:string,currencies:Currency[]):Promise<void>;
 createInvitation(id:string,email:string,role?:'player'|'dm'):Promise<Invitation>;
 revokeInvitation(id:string,inviteId:string):Promise<void>;
 setDM(id:string,uid:string,enabled:boolean):Promise<void>;
 removeMember(id:string,uid:string):Promise<void>;
 createCharacter(id:string,user:Profile,ownerUid:string,type:CharacterType,data:Character):Promise<string>;
 assignCharacter(id:string,charId:string,ownerUid:string):Promise<void>;
 sheetStore(id:string,charId:string,user:Profile,currencies:Currency[]):SheetStore;
 saveNote(id:string,privateNotes:boolean,user:Profile,note:Pick<PartyNote,'title'|'text'|'kind'|'url'>,existing?:PartyNote):Promise<void>;
 deleteNote(id:string,privateNotes:boolean,note:PartyNote):Promise<void>;
}
