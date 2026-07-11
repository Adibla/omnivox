import { generatePipelineArtifact } from "@/lib/pipeline-generation";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  return generatePipelineArtifact(request, context, "diagrams");
}
