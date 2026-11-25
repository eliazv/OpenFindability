/** Next may normalize request.url to its listening address; Host is the browser-facing authority.
 * Local-only, not an authentication mechanism for an externally exposed deployment.
 * Do not trust X-Forwarded-Host/Proto from arbitrary clients. */
const loopback=new Set(["localhost","127.0.0.1","[::1]"]);
function localAuthority(host:string|null,protocol:string){
 if(!host||!/^((localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?)$/i.test(host))return null;
 try{const url=new URL(protocol+"//"+host);return loopback.has(url.hostname)?url:null;}catch{return null;}
}
export function localRequestError(request:Request,mutation=false):string|null{
 const internal=new URL(request.url),host=request.headers.get("host");
 // Require an actual local Host on every request, including read-only exports.
 if(!localAuthority(host,internal.protocol))return "Accesso consentito solo tramite localhost o 127.0.0.1.";
 if(request.headers.get("sec-fetch-site")==="cross-site")return "Richiesta proveniente da un altro sito.";
 if(!mutation)return null;
 const raw=request.headers.get("origin");
 if(!raw)return "Origin mancante: apri OpenFindability direttamente nel browser locale.";
 try{
  const origin=new URL(raw);
  if(!["http:","https:"].includes(origin.protocol)||origin.origin!==raw)return "Origin non valido.";
  const expected=localAuthority(host,origin.protocol);
  if(!expected||origin.origin!==expected.origin)return "Origin e Host non coincidono: usa lo stesso indirizzo locale della dashboard.";
 }catch{return "Origin non valido.";}
 return null;
}
