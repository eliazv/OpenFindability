import "dotenv/config";
import {createBackup} from "@/lib/db/backup";
createBackup().then(r=>console.log("Backup verified: "+r.destination+" ("+r.size+" bytes)")).catch(error=>{console.error(error instanceof Error?error.message:"Backup failed.");process.exit(1);});
