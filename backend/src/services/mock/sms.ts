import { logger } from "../../utils/logger";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";

const SEMAPHORE_URL = "https://api.semaphore.co/api/v4";

export function assertSmsAvailable(): void {
  if (env.SMS_PROVIDER === "semaphore") return;
  if (env.isProd && !env.ALLOW_MOCK_SMS)
    throw new ApiError(
      503,
      "SMS provider is not configured",
      "SMS_NOT_CONFIGURED"
    );
}

/** Semaphore expects the local 09XXXXXXXXX form. */
const localMobile = (e164: string) =>
  e164.startsWith("+63") ? `0${e164.slice(3)}` : e164;

/** Posts to Semaphore. Never logs the message, code or API key. */
async function semaphorePost(
  path: "messages" | "otp",
  fields: Record<string, string>
): Promise<void> {
  const body = new URLSearchParams({
    apikey: env.SEMAPHORE_API_KEY!,
    ...fields,
  });
  const fail = (detail: Record<string, unknown>): never => {
    logger.error({ provider: "semaphore", ...detail }, "SMS not sent");
    throw new ApiError(
      502,
      "We could not send the SMS. Please try again shortly.",
      "SMS_SEND_FAILED"
    );
  };

  let res: Response;
  try {
    res = await fetch(`${SEMAPHORE_URL}/${path}`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return fail({ reason: (err as Error).name });
  }

  const data: unknown = await res.json().catch(() => null);
  const first = Array.isArray(data)
    ? (data[0] as { status?: string } | undefined)
    : undefined;
  if (
    !res.ok ||
    !first ||
    first.status === "Failed" ||
    first.status === "Refunded"
  )
    return fail({ httpStatus: res.status, messageStatus: first?.status });

  logger.info(
    { provider: "semaphore", messageStatus: first.status },
    "SMS accepted by provider"
  );
}

/** Sends a one-time code. With Semaphore this uses its OTP endpoint with our own code. */
export async function sendOtpSms(to: string, code: string): Promise<void> {
  assertSmsAvailable();
  if (env.SMS_PROVIDER === "semaphore") {
    await semaphorePost("otp", {
      number: localMobile(to),
      message:
        "Your PesoLoan verification code is {otp}. Valid for 5 minutes. Never share it with anyone.",
      code,
      ...(env.SEMAPHORE_SENDER_NAME
        ? { sendername: env.SEMAPHORE_SENDER_NAME }
        : {}),
    });
    return;
  }
  logger.info({ provider: "mock" }, "Simulated SMS; no message delivered");
}

/** General text message. Development/mock mode only logs that a send was simulated. */
export async function sendSms(to: string, message: string): Promise<void> {
  assertSmsAvailable();
  if (env.SMS_PROVIDER === "semaphore") {
    await semaphorePost("messages", {
      number: localMobile(to),
      message,
      ...(env.SEMAPHORE_SENDER_NAME
        ? { sendername: env.SEMAPHORE_SENDER_NAME }
        : {}),
    });
    return;
  }
  logger.info({ provider: "mock" }, "Simulated SMS; no message delivered");
}
