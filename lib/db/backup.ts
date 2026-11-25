import {mkdir,stat,readdir,unlink} from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
const directory=(root:string)=>path.join(root,"data","backups");
export async function listBackups(root=process.cwd()){
 try{const names=(await readdir(directory(root))).filter(n=>/^openfindability-[\dTZ-]+\.db$/.test(n)).sort().reverse().slice(0,10);
 return await Promise.all(names.map(async name=>{const info=await stat(path.join(directory(root),name));return {name,size:info.size,modified:info.mtime.toISOString()};}));}catch{return [];}
}
export async function createBackup(root=process.cwd()){
 const databasePath=path.join(root,"data","openfindability.db");await stat(databasePath);await mkdir(directory(root),{recursive:true});
 const timestamp=new Date().toISOString().replace(/[:.]/g,"-"),name="openfindability-"+timestamp+".db",destination=path.join(directory(root),name);
 const db=new Database(databasePath,{readonly:true,fileMustExist:true});
 try{await db.backup(destination);const copy=new Database(destination,{readonly:true,fileMustExist:true});try{if(copy.pragma("integrity_check",{simple:true})!=="ok")throw new Error("Backup integrity check failed.");}finally{copy.close();}return {name,size:(await stat(destination)).size,destination};}
 catch(error){await unlink(destination).catch(()=>{});throw error;}finally{db.close();}
}
