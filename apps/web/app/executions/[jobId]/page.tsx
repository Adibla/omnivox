import { AppDashboard } from "@/components/app-dashboard";

type ExecutionPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function ExecutionPage({ params }: ExecutionPageProps) {
  const { jobId } = await params;
  return <AppDashboard initialView="results" initialJobId={jobId} />;
}
