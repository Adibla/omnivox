import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

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

export function ok<T>(request: Request, payload: T, status = 200) {
  const correlationId = getCorrelationId(request);
  return NextResponse.json(payload, {
    status,
    headers: {
      "x-correlation-id": correlationId
    }
  });
}

export function fail(
  request: Request,
  options: {
    status: number;
    code: ApiErrorCode;
    message: string;
    detail?: string;
  }
) {
  const correlationId = getCorrelationId(request);
  return NextResponse.json(
    {
      code: options.code,
      message: options.message,
      detail: options.detail,
      correlationId
    },
    {
      status: options.status,
      headers: {
        "x-correlation-id": correlationId
      }
    }
  );
}
