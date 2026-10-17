import {beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({getDoc:vi.fn(),commit:vi.fn(),update:vi.fn(),set:vi.fn(),auth:{currentUser:{uid:'new-player'}}}));
vi.mock('firebase/app',()=>({initializeApp:()=>({})}));
vi.mock('firebase/auth',async importOriginal=>({...await importOriginal<typeof import('firebase/auth')>(),getAuth:()=>mock.auth}));
vi.mock('firebase/firestore',async importOriginal=>({...await importOriginal<typeof import('firebase/firestore')>(),getFirestore:()=>({}),doc:(_db:unknown,...parts:string[])=>parts.join('/'),getDoc:mock.getDoc,writeBatch:()=>({update:mock.update,set:mock.set,commit:mock.commit})}));
import {FirebaseGateway} from '../lib/firebase-gateway';
const user={uid:'new-player',email:'player@example.test',displayName:'New player',emailVerified:true};
const invitation=(change={})=>({exists:()=>true,data:()=>({email:user.email,expiresAt:Date.now()+3600000,role:'player',...change})});
const denied=Object.assign(new Error('Missing or insufficient permissions'),{code:'permission-denied'});
beforeEach(()=>{vi.clearAllMocks();mock.commit.mockReset().mockResolvedValue(undefined);mock.getDoc.mockReset();});
describe('invitation acceptance',()=>{
 it('accepts the matching Google account with an atomic membership write',async()=>{mock.getDoc.mockResolvedValue(invitation());await new FirebaseGateway().joinCampaign(user,'campaign','invite');expect(mock.commit).toHaveBeenCalledOnce();expect(mock.set).toHaveBeenCalledWith('campaigns/campaign/members/new-player',expect.objectContaining({name:'New player',inviteId:'invite'}));expect(mock.update.mock.calls[0][1].dmIds).toBeUndefined();});
 it('explains an inaccessible invitation without exposing the invited address',async()=>{mock.getDoc.mockRejectedValue(denied);await expect(new FirebaseGateway().joinCampaign(user,'campaign','invite')).rejects.toThrow('Check the email shown below');expect(mock.commit).not.toHaveBeenCalled();});
 it('rejects an expired or mismatched invitation before writing',async()=>{for(const change of [{email:'different@example.test'},{expiresAt:Date.now()-1}]){mock.getDoc.mockResolvedValue(invitation(change));await expect(new FirebaseGateway().joinCampaign(user,'campaign','invite')).rejects.toThrow('expired or belongs to another');}expect(mock.commit).not.toHaveBeenCalled();});
 it('opens an already joined campaign without rewriting its member record',async()=>{mock.getDoc.mockResolvedValueOnce(invitation());mock.commit.mockRejectedValueOnce(denied);mock.getDoc.mockResolvedValueOnce({exists:()=>true,data:()=>({memberIds:[user.uid]})});await expect(new FirebaseGateway().joinCampaign(user,'campaign','invite')).resolves.toBeUndefined();expect(mock.commit).toHaveBeenCalledOnce();});
 it('does not treat another member as proof of existing membership',async()=>{mock.getDoc.mockResolvedValueOnce(invitation());mock.commit.mockRejectedValueOnce(denied);mock.getDoc.mockResolvedValueOnce({exists:()=>true,data:()=>({memberIds:['other-user']})});await expect(new FirebaseGateway().joinCampaign(user,'campaign','invite')).rejects.toThrow('Check the email shown below');});
 it('rejects incomplete links and unverified accounts before accessing data',async()=>{await expect(new FirebaseGateway().joinCampaign(user,'campaign','')).rejects.toThrow('incomplete');await expect(new FirebaseGateway().joinCampaign({...user,emailVerified:false},'campaign','invite')).rejects.toThrow('verified Google');expect(mock.getDoc).not.toHaveBeenCalled();});
});
