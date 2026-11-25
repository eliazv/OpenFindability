import type {Project} from "@/lib/types";
import {linkedWebsite} from "./favicon";
import {publicWebsite} from "./website-icon-discovery";
import {refreshStoreArtwork,storeIdentities} from "./store-artwork";
import {refreshWebsiteArtwork} from "./website-artwork";
export function hasArtworkSource(p:Project){const web=linkedWebsite(p);return storeIdentities(p).length>0||!!(web&&publicWebsite(web));}
export async function refreshProjectArtwork(p:Project,force=false){
 if(storeIdentities(p).length){const status=await refreshStoreArtwork(p,{force});if(status!=="unavailable")return status;}
 return refreshWebsiteArtwork(linkedWebsite(p),{force});
}
