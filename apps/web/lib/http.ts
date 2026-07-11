import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal_error";

export function getCorrelationId(request: Request) {
  return request.headers.get("x-correlation-id") ?? randomUUID();
}

// For server-side logging and validation feedback. Never send the result of a
// non-Zod error to the client: internal messages may leak implementation details.
export function describeError(error: unknown) {
  if (error instanceof ZodError) {
    return JSON.stringify(error.issues);
  }
  if (error instanceof Error) {
    return error.message || error.name;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function ok<T>(request: Request, payload: T, status = 200) {
  const correlationId = getCorrelationId(request);
  return NextResponse.json(payload, {
    status,
    headers: {
      "x-correlation-id": correlationId,
    },
  });
}

export function fail(
  request: Request,
  options: {
    status: number;
    code: ApiErrorCode;
    message: string;
    detail?: string;
  },
) {
  const correlationId = getCorrelationId(request);
  return NextResponse.json(
    {
      code: options.code,
      message: options.message,
      detail: options.detail,
      correlationId,
    },
    {
      status: options.status,
      headers: {
        "x-correlation-id": correlationId,
      },
    },
  );
}
