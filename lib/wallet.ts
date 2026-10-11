export const coinNames=['cp','sp','ep','gp','pp'] as const;
export type Coin=typeof coinNames[number];
export type Coins=Record<Coin,number>;
export type Wallet={id:string;name:string;coins:Coins;rates:Coins};
export const defaultRates:Coins={cp:1,sp:10,ep:50,gp:100,pp:1000};
export const emptyCoins=():Coins=>({cp:0,sp:0,ep:0,gp:0,pp:0});
export const maxCoins=100000000;
export function validRates(r:Coins){return coinNames.every((k,i)=>Number.isSafeInteger(r[k])&&r[k]>=1&&r[k]<=1000000&&(i===0?r[k]===1:r[k]>r[coinNames[i-1]]));}
export function legacyWallet(text:string):Wallet{const coins=emptyCoins();for(const match of text.split('(')[0].matchAll(/(\d+)\s*(cp|sp|ep|gp|pp)\b/gi)){const coin=match[2].toLowerCase() as Coin;coins[coin]=Math.min(maxCoins,Number(match[1]));}return {id:'common',name:'Common currency',coins,rates:{...defaultRates}};}
export function totalValue(w:Wallet){return coinNames.reduce((sum,k)=>sum+w.coins[k]*w.rates[k],0);}
export function coinSummary(coins:Coins){return [...coinNames].reverse().filter(k=>coins[k]>0).map(k=>`${coins[k]} ${k}`).join(', ')||'0 cp';}
// Use gp/sp/cp for standard change; electrum is accepted as payment but isn't imposed as change.
export function makeChange(value:number,rates:Coins):Coins{if(!Number.isSafeInteger(value)||value<0||!validRates(rates))throw Error('Invalid change or conversion rates.');const change=emptyCoins();for(const k of ['pp','gp','sp','cp'] as Coin[]){change[k]=Math.floor(value/rates[k]);value%=rates[k];}return change;}
export function purchase(w:Wallet,cost:number,costCoin:Coin,tender:number,tenderCoin:Coin){if(!validRates(w.rates)||![cost,tender].every(n=>Number.isSafeInteger(n)&&n>0&&n<=maxCoins))throw Error('Enter positive whole coin amounts.');if(tender>w.coins[tenderCoin])throw Error(`You only have ${w.coins[tenderCoin]} ${tenderCoin} in this currency.`);const price=cost*w.rates[costCoin],paid=tender*w.rates[tenderCoin];if(paid<price)throw Error('Payment is less than the price.');const change=makeChange(paid-price,w.rates);const coins={...w.coins,[tenderCoin]:w.coins[tenderCoin]-tender};for(const k of coinNames){coins[k]+=change[k];if(coins[k]>maxCoins)throw Error('Balance is too large.');}return {wallet:{...w,coins},change,price,paid};}

export function addCoins(w:Wallet,added:Coins):Wallet{if(!coinNames.every(k=>Number.isSafeInteger(added[k])&&added[k]>=0&&added[k]<=maxCoins)||!coinNames.some(k=>added[k]>0))throw Error('Enter at least one positive whole coin amount.');const coins={...w.coins};for(const k of coinNames){coins[k]+=added[k];if(!Number.isSafeInteger(coins[k])||coins[k]>maxCoins)throw Error('Balance is too large.');}return {...w,coins};}
