// Database entries are bounded; sums and display remain arbitrary precision.
export const MAX_PIASTRES = 9223372036854775807n;
export function parsePiastres(value: string): bigint {
  if (!/^(0|-?[1-9][0-9]{0,18})$/.test(value)) throw new RangeError('Expected canonical integer piastres');
  const amount=BigInt(value);
  if (amount < -MAX_PIASTRES || amount > MAX_PIASTRES) throw new RangeError('Amount outside BIGINT range');
  return amount;
}
export function egpToPiastres(value: string): string {
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value)) throw new RangeError('Expected an exact EGP amount');
  const negative=value.startsWith('-'); const [whole,fraction='']=value.replace(/^-/,'').split('.');
  return parsePiastres(((BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')))*(negative ? -1n : 1n)).toString()).toString();
}
export function splitPiastres(amount: bigint,childIds: readonly string[]): { childId: string;amount: string }[] {
  if (amount<0n || !childIds.length || new Set(childIds).size!==childIds.length) throw new RangeError('Invalid equal allocation');
  const count=BigInt(childIds.length); const remainder=amount%count;
  return [...childIds].sort().map((childId,index)=>({ childId,amount:(amount/count+(BigInt(index)<remainder ? 1n : 0n)).toString() }));
}
