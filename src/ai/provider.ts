export type AiTask = "DOCUMENT_SUMMARY"|"EVIDENCE_EXTRACTION"|"FINDING_DRAFT"|"GAP_ANALYSIS"|"MAPPING_SUGGESTION"|"REMEDIATION_SUGGESTION";

export interface AiGenerationRequest {
 readonly task: AiTask;
 readonly systemPrompt: string;
 readonly userPrompt: string;
 readonly sourceReferences: readonly string[];
}
export interface AiGenerationResponse {
 readonly provider: string;
 readonly model: string;
 readonly modelVersion?: string | undefined;
 readonly output: Readonly<Record<string,unknown>>;
 readonly confidence?: number | undefined;
}
export interface AiProvider { generate(request:AiGenerationRequest):Promise<AiGenerationResponse>; }

export function assertSupportedAiTask(value:string):asserts value is AiTask {
 if(!["DOCUMENT_SUMMARY","EVIDENCE_EXTRACTION","FINDING_DRAFT","GAP_ANALYSIS","MAPPING_SUGGESTION","REMEDIATION_SUGGESTION"].includes(value))throw new Error("Unsupported AI task");
}
