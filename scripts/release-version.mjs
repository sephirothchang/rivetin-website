const pattern=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-alpha\.([1-9]\d*)(?:\.trial\.([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.([1-9]\d{0,15}))?|-(beta))?$/u;
export function parseReleaseVersion(value){
 if(typeof value!=='string'||value.length>100)return null;
 const match=pattern.exec(value);if(!match||(match[5]?.length??0)>24)return null;
 return {base:match.slice(1,4),stage:match[4]?'alpha':match[7]?'beta':'stable',sequence:match[4]??null,trial:match[5]?{code:match[5],iteration:match[6]}:null};
}
const decimal=(a,b)=>Math.sign(a.length-b.length)||(a===b?0:a<b?-1:1);
export function compareReleaseVersions(left,right){
 const a=parseReleaseVersion(left),b=parseReleaseVersion(right);if(!a||!b)throw Error('INVALID_RELEASE_VERSION');
 for(let i=0;i<3;i++){const n=decimal(a.base[i],b.base[i]);if(n)return n;}
 const rank={alpha:0,beta:1,stable:2};if(a.stage!==b.stage)return Math.sign(rank[a.stage]-rank[b.stage]);
 if(a.stage!=='alpha')return 0;const seq=decimal(a.sequence,b.sequence);if(seq)return seq;
 if(!a.trial||!b.trial)return Number(Boolean(a.trial))-Number(Boolean(b.trial));
 return (a.trial.code===b.trial.code?0:a.trial.code<b.trial.code?-1:1)||decimal(a.trial.iteration,b.trial.iteration);
}
export const validReleaseVersion=value=>parseReleaseVersion(value)!==null;
