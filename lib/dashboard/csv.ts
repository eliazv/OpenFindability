type Cell=string|number|null|undefined;
export function csvText(columns:string[],rows:Cell[][]):string{
 const encode=(value:Cell)=>{let s=String(value??"");if(typeof value==="string"&&/^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return [columns,...rows].map(row=>row.map(encode).join(";")).join("\r\n");
}
