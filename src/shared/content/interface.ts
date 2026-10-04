import { getSiteContent } from './runtime';
import { hashString } from '@/shared/lib/hash';
import type { IconName } from '@/shared/ui/Icon';
export function interfaceText(fallback:string):string {
  try{return getSiteContent().site?.copy[`ui.${hashString(fallback).toString(16)}`]??fallback;}catch{return fallback;}
}
export function interfaceIcon(key:string,fallback:IconName):IconName {
  try{return getSiteContent().site?.icons[key] as IconName??fallback;}catch{return fallback;}
}
