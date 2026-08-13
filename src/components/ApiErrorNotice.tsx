import { AlertTriangle, ServerCrash } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiError } from "@/lib/api";

export function ApiErrorNotice({ error }: { error: unknown }) {
  const apiError = error instanceof ApiError ? error : null;
  const message = error instanceof Error ? error.message : "Something went wrong.";

  if (apiError?.notTrained) {
    return (
      <Alert>
        <AlertTriangle className="size-4" />
        <AlertTitle>No global model has been trained yet</AlertTitle>
        <AlertDescription>
          An administrator needs to run a federated training round from the “Train Model” page
          before predictions or the ledger become available.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <ServerCrash className="size-4" />
      <AlertTitle>Prediction service unavailable</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
