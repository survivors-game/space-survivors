export type WarOutcome = "WIN" | "LOSS" | "DRAW";
export type WarWinner = "attacker" | "defender" | "draw";
export function allianceLevelForWins(wins:number):number { if(wins>=50)return 5;if(wins>=30)return 4;if(wins>=15)return 3;if(wins>=5)return 2;return 1; }
export function warReward(outcome:WarOutcome):{obsidian:number;credits:number} { if(outcome==="WIN")return {obsidian:5,credits:200};if(outcome==="LOSS")return {obsidian:0,credits:50};return {obsidian:0,credits:100}; }
export function resolveWarWinner(ah:number,dh:number,aa:number,da:number):WarWinner { if(aa===0&&da>0)return "defender";if(da===0&&aa>0)return "attacker";if(ah>dh)return "attacker";if(dh>ah)return "defender";if(aa>da)return "attacker";if(da>aa)return "defender";return "draw"; }
export function canDeclareAgainstLevel(a:number,d:number):boolean { return d>=a&&d<=a+1; }
export function hasMinimumMembers(a:number,d:number):boolean { return a>=3&&d>=3; }
export function canStartWar(a:number,d:number):boolean { return a>=3&&d>=3; }
export function isLossCooldownActive(lastWinner:string|null|undefined,allianceId:string,endedAt:number|undefined,now:number):boolean {
 return lastWinner!==null&&lastWinner!==undefined&&lastWinner!==allianceId&&endedAt!==undefined&&now-endedAt<12*60*60*1000;
}
export function hasExpired(now:number,startedAt:number,duration:number):boolean { return now>=startedAt+duration; }
