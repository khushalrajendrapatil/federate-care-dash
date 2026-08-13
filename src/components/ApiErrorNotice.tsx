import { AlertTriangle, ServerCrash } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please try again.";
}

/** Human-readable failure notice for any server-function / database error. */
export function ApiErrorNotice({ error, title }: { error: unknown; title?: string }) {
  const message = messageOf(error);
  const notTrained = /no (global )?model|not been trained|no trained model/i.test(message);

  if (notTrained) {
    return (
      <Alert>
        <AlertTriangle className="size-4" />
        <AlertTitle>No global model has been trained yet</AlertTitle>
        <AlertDescription>
          An administrator needs to run a federated training round from the “Train Model” page
          before predictions become available.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <ServerCrash className="size-4" />
      <AlertTitle>{title ?? "Operation failed"}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
