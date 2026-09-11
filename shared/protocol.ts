import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import * as awareness from 'y-protocols/awareness';
import * as Y from 'yjs';

export const SYNC = 0;
export const AWARENESS = 1;
export const SAVED = 2;
export const AGENT_COMMAND = 3;
export const AGENT_STATE = 4;
export function jsonMessage(type: number, payload: unknown): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, type);
  encoding.writeVarString(encoder, JSON.stringify(payload));
  return encoding.toUint8Array(encoder);
}
export function syncStep(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, SYNC);
  sync.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}
export function documentUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, SYNC);
  sync.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}
export function presenceUpdate(state: awareness.Awareness, clients: number[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, AWARENESS);
  encoding.writeVarUint8Array(encoder, awareness.encodeAwarenessUpdate(state, clients));
  return encoding.toUint8Array(encoder);
}
export function awarenessClientIds(update: Uint8Array): number[] {
  const decoder = decoding.createDecoder(update);
  const length = decoding.readVarUint(decoder);
  if (length > 100) throw new Error('Too many awareness states');
  const ids: number[] = [];
  for (let i = 0; i < length; i++) {
    ids.push(decoding.readVarUint(decoder));
    decoding.readVarUint(decoder);
    const state = JSON.parse(decoding.readVarString(decoder));
    if (state !== null && (typeof state !== 'object' || Array.isArray(state)))
      throw new Error('Invalid awareness state');
  }
  return ids;
}
