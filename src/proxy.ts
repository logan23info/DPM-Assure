import { NextResponse, type NextRequest } from "next/server";

const mutationMethods=new Set(["POST","PUT","PATCH","DELETE"]);

export function proxy(request:NextRequest){
 if(!mutationMethods.has(request.method))return NextResponse.next();
 const origin=request.headers.get("origin");
 const secFetchSite=request.headers.get("sec-fetch-site");
 if(origin){
  let parsed:URL;try{parsed=new URL(origin);}catch{return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});}
  if(parsed.origin!==request.nextUrl.origin)return NextResponse.json({error:"CROSS_SITE_MUTATION_REJECTED"},{status:403});
 }else if(secFetchSite&&!["same-origin","same-site","none"].includes(secFetchSite)){
  return NextResponse.json({error:"CROSS_SITE_MUTATION_REJECTED"},{status:403});
 }
 return NextResponse.next();
}

export const config={matcher:"/api/:path*"};
