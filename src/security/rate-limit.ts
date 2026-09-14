import "server-only";

import { createHash } from "node:crypto";
import { getPool } from "@/db/runtime";

function digest(namespace:string,value:string):string{return createHash("sha256").update(`${namespace}:${value}`,"utf8").digest("hex");}

export async function consumeRateLimit(input:{namespace:string;identifier:string;maxRequests:number;windowSeconds:number}):Promise<boolean>{
 if(!Number.isSafeInteger(input.maxRequests)||input.maxRequests<=0)throw new Error("maxRequests must be positive");if(!Number.isSafeInteger(input.windowSeconds)||input.windowSeconds<=0)throw new Error("windowSeconds must be positive");
 const key=digest(input.namespace,input.identifier);const result=await getPool().query<{allowed:boolean}>("select consume_rate_limit($1::char(64),$2::integer,$3::integer) as allowed",[key,input.maxRequests,input.windowSeconds]);return result.rows[0]?.allowed===true;
}
