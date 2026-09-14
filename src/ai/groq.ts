import "server-only";

import type { AiGenerationRequest, AiGenerationResponse, AiProvider } from "./provider";

function requireEnv(name:string){const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;}

export class GroqAiProvider implements AiProvider {
 async generate(request:AiGenerationRequest):Promise<AiGenerationResponse>{
  const model=process.env.GROQ_MODEL?.trim()||"llama-3.3-70b-versatile";
  const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${requireEnv("GROQ_API_KEY")}`,"Content-Type":"application/json"},body:JSON.stringify({model,temperature:0.1,response_format:{type:"json_object"},messages:[{role:"system",content:request.systemPrompt},{role:"user",content:request.userPrompt}]})});
  if(!response.ok){const body=await response.text().catch(()=>"");throw new Error(`Groq generation failed (${response.status}): ${body.slice(0,200)}`);}
  const data=await response.json() as {model?:string;choices?:Array<{message?:{content?:string}}>} ;const content=data.choices?.[0]?.message?.content;if(!content)throw new Error("Groq returned no content");
  let output:Record<string,unknown>;try{output=JSON.parse(content) as Record<string,unknown>;}catch{throw new Error("Groq response was not valid JSON");}
  const rawConfidence=output.confidence;const confidence=typeof rawConfidence==="number"&&Number.isFinite(rawConfidence)?Math.max(0,Math.min(1,rawConfidence)):undefined;
  return {provider:"GROQ",model:data.model||model,output,confidence};
 }
}

let singleton:GroqAiProvider|null=null;export function getAiProvider():AiProvider{singleton??=new GroqAiProvider();return singleton;}
