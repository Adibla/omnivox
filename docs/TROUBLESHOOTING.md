# Troubleshooting

## 1. UI Stuck on "idle" or Clicks Do Nothing

Possible causes:

- development CSP is too strict and blocks scripts/hot reload
- JavaScript error before hydration
- session/CSRF not initialized (`POST /api/v1/auth/session` missing or failed)

Check:

- restart `npm run dev` after middleware changes
- hard refresh (`Cmd+Shift+R`)
- check browser console and Network tab for `auth/session` and presign calls

## 2. `OPTIONS 403` on a Presigned S3 URL

The presign works, but the CORS preflight fails.

Check:

- bucket CORS includes `http://localhost:3000` and `http://127.0.0.1:3000`
- methods include `PUT`, `GET`, `HEAD`
- allowed headers include `content-type`, `x-amz-*`

## 3. `Invalid session cookie signature` / 401 on Presign or Pipeline

Possible causes:

- `SESSION_SECRET` changed while old cookies still exist
- multiple web instances use different secrets

Check:

- delete the `omni_session` cookie in the browser
- restart web with a stable `SESSION_SECRET`
- possible future improvement: regenerate session on invalid signature

## 4. Worker `ZodError` on Startup

The `tsx` process cannot find required env variables. Check `apps/worker/.env.local`.

After env changes, restart `npm run dev:worker`.

## 5. Pipeline Does Not Progress and Stays `queued`

Possible causes:

- worker is not running
- Redis is down or `REDIS_URL` is wrong
- consumer crashed; check the worker terminal

Check:

- `docker compose ps` and `curl http://localhost:4010/health`
- worker logs for BullMQ / AI backend / S3 errors

## 6. `dueDate` Failures

Expected behavior: non-ISO dates are normalized to `null`.

If Zod errors persist, check the current code version and worker logs.

## 7. Storage Endpoint Error

`S3_ENDPOINT` is passed directly to the S3 SDK. If it is wrong, the error comes from the S3 client or provider. Locally, the compose stack exposes MinIO at `http://localhost:9000`.

## 8. `POST /api/v1/pipeline/start` Returns an Existing Job

This is idempotency: same `meetingId` + `objectKey`. Use a new `meetingId` or a different object for a new analysis.

## 9. `PUT` to MinIO Returns `501 Not Implemented`

Possible causes:

- local provider does not support a required header
- `S3_SERVER_SIDE_ENCRYPTION=AES256` is enabled without SSE/KMS support

Check:

- leave `S3_SERVER_SIDE_ENCRYPTION` empty for local MinIO
- if the provider does not support checksums, use `S3_CHECKSUM_ENABLED=false`

## 10. Upload Works but Analysis Fails in `transcribing`

Check:

- IAM/storage permissions for `GetObject`
- object key matches the bucket
- worker AI key is valid
- `OPENAI_BASE_URL` is correct if used
- configured models are available

If the job error is `Connection error.`, the AI provider may be rejecting the
request while the audio is still uploading, which surfaces as a socket reset
instead of a readable status. A quota exhaustion (`insufficient_quota`, HTTP 429) typically shows up exactly this way. Test the key with a small request:

```bash
curl -s https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY" | head -3
curl -s https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F model=whisper-1 -F file=@any-small-file.mp3
```

The second call returns the real error body (e.g. `insufficient_quota`).

## 11. Phone `.m4a` Recording Rejected (`Invalid file format`)

Some phone recorders — notably Samsung's — save **3GP containers renamed to
`.m4a`**. Extension and MIME type both claim m4a, but the transcription
provider inspects the bytes and rejects the file. The UI now detects this
before the upload; if you hit the provider error anyway, check the signature:

```bash
xxd your-file.m4a | head -1   # "ftyp3gp4" = 3GP in disguise
```

Convert it to a real container first:

```bash
# macOS (built-in)
afconvert -f m4af -d aac your-file.m4a converted.m4a
# anywhere with ffmpeg (usually a lossless remux is enough)
ffmpeg -i your-file.m4a -c copy converted.m4a
```

## 12. Suggested Debug Sequence

1. `GET http://localhost:4010/health` and `.../ready`
2. `POST /api/v1/auth/session` returns `csrfToken`
3. `POST /api/v1/storage/presign` with CSRF header
4. Network: `OPTIONS` + `PUT` to S3
5. `POST /api/v1/storage/complete`
6. `POST /api/v1/pipeline/start`
7. `GET /api/v1/pipeline/{jobId}` until terminal state
8. worker logs + `error` field on the job
